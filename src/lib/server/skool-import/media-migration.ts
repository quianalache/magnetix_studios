import "server-only";

import crypto from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStorage } from "firebase-admin/storage";
import { fetchSkoolFileDownloadUrl } from "./skool-client";
import { getExistingMappingsBulk, writeMapping } from "./import-mappings";
import type { SkoolSession } from "./skool-session";
import type { CourseImportPlan } from "./mapping";
import type { ResourceLink } from "@/types/community";

/**
 * Skool-hosted PDF resource migration — the destination Firebase Storage
 * already hosts every other permanent binary asset in this app (course
 * covers, community images, offer thumbnails — see upload-image.ts), always
 * via a permanent download-token URL, never a signed/expiring one. This
 * reuses that exact convention for Skool-hosted PDFs (real Skool-hosted
 * VIDEO is a separate, larger decision — see the delivered report — this
 * module only ever touches PDFs).
 *
 * Real extraction method (confirmed live, not assumed): Skool's own
 * classroom UI resolves a lesson resource by calling
 * `POST api2.skool.com/files/{fileId}/download-url?expire=28800`
 * (see skool-client.ts's fetchSkoolFileDownloadUrl) — the browser session
 * mints a CloudFront-signed `files.skool.com` URL; a plain, cookie-less
 * server-side `fetch` of THAT resulting URL is enough (confirmed live: a
 * real PDF downloaded this way, 200 OK, correct `application/pdf`
 * content-type, valid `%PDF` magic bytes) — only the resolution step needs
 * the authenticated browser.
 *
 * Idempotent via the existing importMappings ledger: entity
 * "standalone_lesson_resources", externalId the Skool file id, `parentId`
 * the owning Magnetix lesson id. A rerun with an existing mapping never
 * re-downloads, re-uploads, or re-appends a resourceLink.
 */

export interface PdfMigrationCounts {
  received: number;
  matchedExisting: number;
  migrated: number;
  wouldMigrate: number;
  failed: number;
}

function emptyCounts(): PdfMigrationCounts {
  return {
    received: 0,
    matchedExisting: 0,
    migrated: 0,
    wouldMigrate: 0,
    failed: 0,
  };
}

export type PdfMigrationAction =
  | "migrated"
  | "matched-existing"
  | "would-migrate"
  | "failed";

export interface PdfMigrationResult {
  skoolFileId: string;
  fileName: string | null;
  skoolLessonId: string;
  skoolCourseId: string;
  magnetixLessonId: string | null;
  action: PdfMigrationAction;
  permanentUrl: string | null;
  sizeBytes: number | null;
  error?: string;
}

export interface PdfMigrationReport {
  commit: boolean;
  counts: PdfMigrationCounts;
  results: PdfMigrationResult[];
}

export interface RunPdfMigrationOptions {
  subAccountId: string;
  commit: boolean;
  session: SkoolSession;
  /** One entry per already-imported course, with its real Magnetix course
   *  id (from the standalone_courses importMapping) — this module never
   *  creates a course/section/lesson, only attaches media to existing ones. */
  courses: {
    skoolCourseId: string;
    magnetixCourseId: string;
    plan: CourseImportPlan;
  }[];
}

function guessExtension(
  fileName: string | null,
  contentType: string | null
): string {
  if (fileName?.includes(".")) return `.${fileName.split(".").pop()}`;
  if (contentType === "application/pdf") return ".pdf";
  return "";
}

function bucket() {
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name)
    throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not configured.");
  return getStorage().bucket(name);
}

/** Uploads a buffer to Firebase Storage with a permanent download token —
 *  same mechanism the client SDK's `getDownloadURL()` produces (a stable,
 *  non-expiring public URL), just done server-side via Admin SDK, which
 *  writes regardless of storage.rules (rules only gate client/REST access). */
async function uploadPermanent(opts: {
  path: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const token = crypto.randomUUID();
  const file = bucket().file(opts.path);
  await file.save(opts.buffer, {
    metadata: {
      contentType: opts.contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const encodedPath = encodeURIComponent(opts.path);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
}

export async function runSkoolPdfResourceMigration(
  opts: RunPdfMigrationOptions
): Promise<PdfMigrationReport> {
  const db = getAdminDb();
  const report: PdfMigrationReport = {
    commit: opts.commit,
    counts: emptyCounts(),
    results: [],
  };

  // Flatten every rehost-required PDF resource across every course, paired
  // with its real Magnetix lesson id (resolved from the already-written
  // standalone_course_lessons mapping — this migration never creates a
  // lesson, only attaches media to one that already exists).
  const allSkoolLessonIds = opts.courses.flatMap((c) =>
    c.plan.lessons.map((l) => l.skoolLessonId)
  );
  const lessonMappings = await getExistingMappingsBulk(
    opts.subAccountId,
    "standalone_course_lessons",
    allSkoolLessonIds
  );

  type PendingItem = {
    skoolCourseId: string;
    magnetixCourseId: string;
    skoolLessonId: string;
    magnetixLessonId: string | null;
    fileId: string;
    fileName: string | null;
    contentType: string | null;
  };
  const pending: PendingItem[] = [];
  for (const c of opts.courses) {
    for (const lesson of c.plan.lessons) {
      if (lesson.resources.rehostRequired.length === 0) continue;
      const mapping = lessonMappings.get(lesson.skoolLessonId);
      for (const r of lesson.resources.rehostRequired) {
        pending.push({
          skoolCourseId: c.skoolCourseId,
          magnetixCourseId: c.magnetixCourseId,
          skoolLessonId: lesson.skoolLessonId,
          magnetixLessonId: mapping?.leadstackId ?? null,
          fileId: r.fileId,
          fileName: r.fileName,
          contentType: r.contentType,
        });
      }
    }
  }

  const fileMappings = await getExistingMappingsBulk(
    opts.subAccountId,
    "standalone_lesson_resources",
    pending.map((p) => p.fileId)
  );

  for (const item of pending) {
    report.counts.received += 1;
    const existing = fileMappings.get(item.fileId);
    if (existing) {
      report.counts.matchedExisting += 1;
      report.results.push({
        skoolFileId: item.fileId,
        fileName: item.fileName,
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        magnetixLessonId: item.magnetixLessonId,
        action: "matched-existing",
        permanentUrl: existing.leadstackId,
        sizeBytes: null,
      });
      continue;
    }
    if (!item.magnetixLessonId) {
      report.counts.failed += 1;
      report.results.push({
        skoolFileId: item.fileId,
        fileName: item.fileName,
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        magnetixLessonId: null,
        action: "failed",
        permanentUrl: null,
        sizeBytes: null,
        error:
          "No standalone_course_lessons mapping found for this Skool lesson — course content import must run first.",
      });
      continue;
    }
    if (!opts.commit) {
      report.counts.wouldMigrate += 1;
      report.results.push({
        skoolFileId: item.fileId,
        fileName: item.fileName,
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        magnetixLessonId: item.magnetixLessonId,
        action: "would-migrate",
        permanentUrl: null,
        sizeBytes: null,
      });
      continue;
    }

    try {
      const signedUrl = await fetchSkoolFileDownloadUrl(
        item.fileId,
        opts.session
      );
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0)
        throw new Error("Downloaded file is empty (0 bytes).");
      const contentType =
        res.headers.get("content-type") ||
        item.contentType ||
        "application/octet-stream";
      if (
        item.contentType &&
        contentType &&
        !contentType.startsWith(item.contentType.split("/")[0])
      ) {
        throw new Error(
          `Unexpected content-type: expected ${item.contentType}, got ${contentType}`
        );
      }

      const ext = guessExtension(item.fileName, contentType);
      const path = `standalone-courses/${opts.subAccountId}/${item.magnetixCourseId}/skool-import-resource-${item.fileId}${ext}`;
      const permanentUrl = await uploadPermanent({ path, buffer, contentType });

      // Merge into the lesson's EXISTING resourceLinks (already-imported
      // external links must survive, not be clobbered).
      const lessonRef = db.doc(
        `subAccounts/${opts.subAccountId}/standaloneCourses/${item.magnetixCourseId}/lessons/${item.magnetixLessonId}`
      );
      const lessonSnap = await lessonRef.get();
      const currentLinks =
        (lessonSnap.data()?.resourceLinks as ResourceLink[] | undefined) ?? [];
      const newLink: ResourceLink = {
        label: item.fileName || "Resource",
        url: permanentUrl,
      };
      await lessonRef.update({ resourceLinks: [...currentLinks, newLink] });

      await writeMapping({
        subAccountId: opts.subAccountId,
        entity: "standalone_lesson_resources",
        externalId: item.fileId,
        leadstackId: permanentUrl,
        parentId: item.magnetixLessonId,
      });

      report.counts.migrated += 1;
      report.results.push({
        skoolFileId: item.fileId,
        fileName: item.fileName,
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        magnetixLessonId: item.magnetixLessonId,
        action: "migrated",
        permanentUrl,
        sizeBytes: buffer.length,
      });
    } catch (err) {
      report.counts.failed += 1;
      report.results.push({
        skoolFileId: item.fileId,
        fileName: item.fileName,
        skoolLessonId: item.skoolLessonId,
        skoolCourseId: item.skoolCourseId,
        magnetixLessonId: item.magnetixLessonId,
        action: "failed",
        permanentUrl: null,
        sizeBytes: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
