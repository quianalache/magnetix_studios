import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { Data as PuckData } from "@puckeditor/core";
import { getAdminDb } from "@/lib/firebase/admin";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { decodeStoredPuckData } from "@/lib/pages-funnels/puck-storage";
import { migratePageBlocksToPuckData } from "@/lib/pages-funnels/puck/migrate-v1";
import { pageNameProblem, resolvePageSettings } from "@/lib/pages-funnels/page-settings";
import {
  EMPTY_TEMPLATE_CONNECTIONS,
  PAGE_TEMPLATE_LIMITS,
  decodeTemplateDesign,
  prepareNewPageFromTemplate,
  summarizeTemplateConnections,
  templateDescriptionProblem,
  templateNameProblem,
} from "@/lib/pages-funnels/page-templates";
import { preparePageWrite, type PuckPersistenceResult } from "@/lib/server/pages-funnels-puck-service";
import { issueTemplateThumbnailToken } from "@/lib/server/pages-funnels/thumbnail-token";
import { THUMBNAIL_SCALE, THUMBNAIL_VIEWPORT } from "@/lib/pages-funnels/thumbnail";
import { normalizePopupMap, type PopupDefinitionMap } from "@/types/pages-funnels-popup";
import { PAGE_GOAL_LABELS, type PageDoc, type PageGoal } from "@/types/pages-funnels";
import { DEFAULT_READING_RESULT_PAGE_SETTINGS } from "@/types/reading-blocks";
import type { PageTemplateConnections, PageTemplateDoc, PageTemplatePreview, PageTemplateSummary } from "@/types/page-templates";

/**
 * Saved Page Templates (2026-11-16) — server side.
 *
 * Storage: `pageTemplates/{id}` (top level, server-only — no Firestore rule
 * matches it, so the client SDK can't read or write it). Every function takes
 * the caller's workspace and re-checks that the template / page belongs to it;
 * a foreign id reads exactly like a missing one. Callers (the API route) have
 * already checked the caller's role in that workspace.
 *
 * A template stores the page design the same way a page stores its draft
 * (`puck-json-v1` envelope + stored Popup map), validated by the same
 * `preparePageWrite` checks Save Draft uses, so anything a page can hold a
 * template can hold, and nothing is silently stripped.
 */

const TEMPLATES = "pageTemplates";
const PAGES = "pages";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export class PageTemplateError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 | 413 | 500 = 400,
  ) {
    super(message);
  }
}

const notFound = () => new PageTemplateError("Template not found", 404);

/** A failed `preparePageWrite` check, as the error the caller shows. */
function writeError(result: PuckPersistenceResult): PageTemplateError {
  if (result.ok) return new PageTemplateError("Couldn't save the template. Try again.", 500);
  return new PageTemplateError(result.error, result.status);
}

function toSummary(id: string, t: PageTemplateDoc): PageTemplateSummary {
  return {
    id,
    name: t.name,
    description: t.description ?? "",
    pageType: t.pageType,
    goal: t.goal,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdByName: t.createdByName ?? "",
    preview: t.preview ? { url: t.preview.url, width: t.preview.width, height: t.preview.height } : null,
    previewStatus: t.previewStatus ?? (t.preview ? "ready" : "pending"),
    connections: { ...EMPTY_TEMPLATE_CONNECTIONS, ...(t.connections ?? {}) },
  };
}

async function loadOwnedTemplate(subAccountId: string, templateId: string) {
  if (!ID.test(templateId)) throw notFound();
  const ref = getAdminDb().collection(TEMPLATES).doc(templateId);
  const snap = await ref.get();
  const doc = snap.data() as PageTemplateDoc | undefined;
  if (!doc || doc.subAccountId !== subAccountId) throw notFound();
  return { ref, doc };
}

/** Read the template's design. Unreadable content is an error, never an empty page. */
export function templateDesign(doc: Pick<PageTemplateDoc, "puckData" | "popups">): { data: PuckData; popups: PopupDefinitionMap } {
  const design = decodeTemplateDesign(doc);
  if (!design) throw new PageTemplateError("This template's design couldn't be read.", 409);
  return design;
}

export async function listPageTemplates(subAccountId: string): Promise<PageTemplateSummary[]> {
  // Single-field equality query (no composite index); sorted here.
  const snap = await getAdminDb().collection(TEMPLATES).where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toSummary(d.id, d.data() as PageTemplateDoc)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPageTemplate(subAccountId: string, templateId: string): Promise<{ id: string; doc: PageTemplateDoc }> {
  const { doc } = await loadOwnedTemplate(subAccountId, templateId);
  return { id: templateId, doc };
}

async function displayNameFor(uid: string, email: string | undefined): Promise<string> {
  const user = (await getAdminDb().doc(`users/${uid}`).get().catch(() => null))?.data() as { displayName?: unknown } | undefined;
  const name = typeof user?.displayName === "string" ? user.displayName.trim() : "";
  return name || email || "";
}

/**
 * Save a page's design as a template. `current` is the builder's on-screen
 * design (including edits not yet autosaved); without it, the page's saved
 * draft is used (the same content the builder opens). Never changes the page.
 * `requestId` makes a repeated submission return the same template instead of
 * creating a second one.
 */
export async function savePageAsTemplate(input: {
  subAccountId: string;
  uid: string;
  email?: string;
  pageId: string;
  name: unknown;
  description: unknown;
  requestId: unknown;
  current?: { data: unknown; popups: unknown } | null;
}): Promise<PageTemplateSummary> {
  const nameProblem = templateNameProblem(input.name);
  if (nameProblem) throw new PageTemplateError(nameProblem);
  const descriptionProblem = templateDescriptionProblem(input.description);
  if (descriptionProblem) throw new PageTemplateError(descriptionProblem);
  if (!ID.test(input.pageId)) throw new PageTemplateError("Page not found", 404);
  const requestId = typeof input.requestId === "string" && /^[A-Za-z0-9-]{8,40}$/.test(input.requestId) ? input.requestId : null;

  const db = getAdminDb();
  const pageSnap = await db.collection(PAGES).doc(input.pageId).get();
  const page = pageSnap.data() as Omit<PageDoc, "id"> | undefined;
  if (!page || page.subAccountId !== input.subAccountId) throw new PageTemplateError("Page not found", 404);

  const ref = requestId ? db.collection(TEMPLATES).doc(`tpl_${requestId}`) : db.collection(TEMPLATES).doc();
  if (requestId) {
    const existing = await ref.get();
    if (existing.exists) {
      const doc = existing.data() as PageTemplateDoc;
      if (doc.subAccountId !== input.subAccountId) throw new PageTemplateError("Couldn't save the template. Try again.", 409);
      return toSummary(ref.id, doc);
    }
  }

  const count = (await db.collection(TEMPLATES).where("subAccountId", "==", input.subAccountId).count().get()).data().count;
  if (count >= PAGE_TEMPLATE_LIMITS.perWorkspace) {
    throw new PageTemplateError(`This workspace has ${PAGE_TEMPLATE_LIMITS.perWorkspace} templates, the most it can keep. Delete one you no longer use, then try again.`, 409);
  }

  // The design to save: the builder's current state, or the page's saved draft.
  let data: unknown;
  let popups: unknown;
  if (input.current) {
    data = input.current.data;
    popups = input.current.popups ?? {};
  } else {
    if (page.puckDraftData != null) {
      const decoded = decodeStoredPuckData(page.puckDraftData);
      if (!decoded.ok) throw new PageTemplateError("This page's design couldn't be read, so it can't be saved as a template.", 409);
      data = decoded.data;
    } else {
      data = migratePageBlocksToPuckData(Array.isArray(page.blocks) ? page.blocks : []);
    }
    popups = normalizePopupMap(page.puckDraftPopups ?? page.puckPublishedPopups ?? {});
  }

  // The same checks a draft save runs (unknown blocks, size, depth, popups…).
  const prepared = preparePageWrite(data as PuckData, popups, {}, ["puckDraftData", "puckDraftPopups"]);
  if ("ok" in prepared) throw writeError(prepared);

  const design = data as PuckData;
  const popupMap = normalizePopupMap(popups);
  const now = Date.now();
  const doc: PageTemplateDoc = {
    agencyId: page.agencyId ?? null,
    subAccountId: input.subAccountId,
    name: (input.name as string).trim(),
    description: typeof input.description === "string" ? input.description.trim() : "",
    pageType: page.pageType ?? "generic",
    goal: page.goal ?? "other",
    puckData: prepared.page,
    popups: prepared.stored,
    readingResult: page.pageType === "reading_result" ? (page.readingResult ?? DEFAULT_READING_RESULT_PAGE_SETTINGS) : null,
    socialImage: resolvePageSettings(design as never, page.seo).socialImage,
    connections: summarizeTemplateConnections(design, popupMap),
    sourcePageId: input.pageId,
    createdByUid: input.uid,
    createdByName: await displayNameFor(input.uid, input.email),
    createdAt: now,
    updatedAt: now,
    preview: null,
    previewStatus: "pending",
    previewRequestedAt: now,
  };
  try {
    await ref.create(doc);
  } catch (err) {
    // A concurrent duplicate submission with the same requestId won the race.
    const raced = requestId ? await ref.get() : null;
    if (raced?.exists && (raced.data() as PageTemplateDoc).subAccountId === input.subAccountId) return toSummary(ref.id, raced.data() as PageTemplateDoc);
    throw err;
  }
  await requestTemplatePreview(ref.id);
  return toSummary(ref.id, doc);
}

export async function updatePageTemplate(subAccountId: string, templateId: string, patch: { name?: unknown; description?: unknown }): Promise<PageTemplateSummary> {
  const { ref, doc } = await loadOwnedTemplate(subAccountId, templateId);
  const update: Partial<PageTemplateDoc> = { updatedAt: Date.now() };
  if (patch.name !== undefined) {
    const problem = templateNameProblem(patch.name);
    if (problem) throw new PageTemplateError(problem);
    update.name = (patch.name as string).trim();
  }
  if (patch.description !== undefined) {
    const problem = templateDescriptionProblem(patch.description);
    if (problem) throw new PageTemplateError(problem);
    update.description = typeof patch.description === "string" ? patch.description.trim() : "";
  }
  await ref.update(update);
  return toSummary(templateId, { ...doc, ...update });
}

/**
 * Delete ONE template and the files only it owns (its preview images under
 * `page-templates/{workspace}/{templateId}/`). Pages — the source page and any
 * page created from the template — and every shared Media Library file are
 * untouched.
 */
export async function deletePageTemplate(subAccountId: string, templateId: string): Promise<void> {
  const { ref } = await loadOwnedTemplate(subAccountId, templateId);
  await ref.delete();
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null;
  if (bucket) {
    await getStorage()
      .bucket(bucket)
      .deleteFiles({ prefix: `page-templates/${subAccountId}/${templateId}/` })
      .catch((err) => console.error(`[page-templates] couldn't remove preview files for ${templateId}`, err instanceof Error ? err.message : err));
  }
}

const VALID_GOALS = new Set(Object.keys(PAGE_GOAL_LABELS));

function pageSlug(name: string, id: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 52) || "page";
  return `${base}-${id.slice(0, 6).toLowerCase()}`;
}

/**
 * Create a NEW, independent Draft page from a template (owner decisions of
 * 2026-11-16): the complete design and Popups; a fresh id, slug, name, goal
 * and analytics identity; SEO title / description, noindex and tracking IDs
 * reset (the social image is kept as a design asset); no publish state, no
 * funnel, no thumbnail; and every explicit Checkout block made automatic, so
 * the page never sells through another page's checkout. The template itself
 * is never changed.
 */
export async function createPageFromTemplate(input: {
  subAccountId: string;
  uid: string;
  templateId: string;
  name: unknown;
  goal: unknown;
}): Promise<{ pageId: string; connections: PageTemplateConnections; clearedCheckouts: number }> {
  const nameProblem = pageNameProblem(input.name);
  if (nameProblem) throw new PageTemplateError(nameProblem);
  const { doc } = await loadOwnedTemplate(input.subAccountId, input.templateId);
  const goal = typeof input.goal === "string" && VALID_GOALS.has(input.goal) ? (input.goal as PageGoal) : doc.goal;
  const design = templateDesign(doc);
  const fresh = prepareNewPageFromTemplate(design.data, design.popups, doc.socialImage ?? "");
  const prepared = preparePageWrite(fresh.data, fresh.popups, {}, ["puckDraftData", "puckDraftPopups"]);
  if ("ok" in prepared) throw writeError(prepared);

  const name = (input.name as string).trim();
  const ref = getAdminDb().collection(PAGES).doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    name,
    slug: pageSlug(name, ref.id),
    pageType: doc.pageType ?? "generic",
    goal,
    status: "draft",
    origin: "template",
    templateId: input.templateId,
    funnelId: null,
    blocks: [],
    seo: { title: "", description: "", ogImage: doc.socialImage ?? "" },
    agencyId: doc.agencyId ?? null,
    subAccountId: input.subAccountId,
    createdByUid: input.uid,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    puckDraftData: prepared.page,
    puckDraftUpdatedAt: now,
    puckDraftPopups: prepared.stored,
    ...(doc.pageType === "reading_result" ? { readingResult: doc.readingResult ?? DEFAULT_READING_RESULT_PAGE_SETTINGS } : {}),
  });
  return { pageId: ref.id, connections: summarizeTemplateConnections(fresh.data, fresh.popups), clearedCheckouts: fresh.clearedCheckouts };
}

// ── Preview image ───────────────────────────────────────────────────────────
// A screenshot of the TEMPLATE itself (rendered by /page-template-preview with
// a 3-minute capture pass), stored at page-templates/{workspace}/{templateId}/
// with a download token — owned by the template, so it never changes when the
// source page is edited or re-captured, and is removed with the template.

export async function requestTemplatePreview(templateId: string): Promise<void> {
  try {
    const queued = qstashIsConfigured()
      ? await publishCallback({
          pathname: "/api/pages-funnels/thumbnail/step",
          body: { templateId },
          delaySeconds: 2,
          deduplicationId: `tthumb_${templateId}_${Date.now()}`,
        })
      : null;
    if (!queued) after(() => captureTemplatePreview(templateId).then(() => undefined));
  } catch (err) {
    console.error(`[page-templates] couldn't queue a preview for ${templateId}`, err instanceof Error ? err.message : err);
  }
}

const PREVIEW_RETRY_AFTER_MS = 15 * 60_000;
const MAX_PREVIEW_RETRIES_PER_VISIT = 3;

/**
 * Library visit: re-queue previews that never arrived (a failed or lost
 * capture), throttled per template by `previewRequestedAt` — the same model as
 * page thumbnails. Never throws.
 */
export async function requeueStaleTemplatePreviews(subAccountId: string): Promise<number> {
  try {
    const now = Date.now();
    const snap = await getAdminDb().collection(TEMPLATES).where("subAccountId", "==", subAccountId).get();
    const due = snap.docs
      .filter((d) => {
        const t = d.data() as PageTemplateDoc;
        return t.previewStatus !== "ready" && now - (t.previewRequestedAt ?? 0) > PREVIEW_RETRY_AFTER_MS;
      })
      .slice(0, MAX_PREVIEW_RETRIES_PER_VISIT);
    for (const d of due) {
      await d.ref.update({ previewRequestedAt: now, previewStatus: "pending" });
      await requestTemplatePreview(d.id);
    }
    return due.length;
  } catch (err) {
    console.error(`[page-templates] couldn't re-queue previews for ${subAccountId}`, err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function captureTemplatePreview(templateId: string): Promise<{ status: "captured" | "skipped" | "failed"; reason?: string }> {
  if (!ID.test(templateId)) return { status: "skipped", reason: "invalid_id" };
  const ref = getAdminDb().collection(TEMPLATES).doc(templateId);
  const doc = (await ref.get().catch(() => null))?.data() as PageTemplateDoc | undefined;
  if (!doc) return { status: "skipped", reason: "missing" };
  // Loaded only here: the headless-browser runtime must never be part of the
  // routes and pages that merely import this service (it isn't traced into
  // their Vercel functions). Captures run in /api/pages-funnels/thumbnail/step.
  const { appBaseUrl, bucketName, downloadUrl, screenshot } = await import("@/lib/server/pages-funnels/page-thumbnail-service");
  const base = appBaseUrl();
  const bucket = bucketName();
  const token = issueTemplateThumbnailToken(templateId);
  const fail = async (reason: string) => {
    await ref.update({ previewStatus: "failed" }).catch(() => undefined);
    return { status: "failed" as const, reason };
  };
  if (!base || !bucket || !token) return fail("not_configured");

  let bytes: Buffer;
  try {
    bytes = await screenshot(`${base}/page-template-preview?t=${encodeURIComponent(templateId)}&mx_thumb=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error(`[page-templates] preview capture failed for ${templateId}`, err instanceof Error ? err.message : err);
    return fail("capture_failed");
  }
  const key = `page-templates/${doc.subAccountId}/${templateId}/preview-${randomUUID().slice(0, 8)}.jpg`;
  const downloadToken = randomUUID();
  const file = getStorage().bucket(bucket).file(key);
  try {
    await file.save(bytes, {
      resumable: false,
      contentType: "image/jpeg",
      metadata: { cacheControl: "public, max-age=31536000, immutable", metadata: { firebaseStorageDownloadTokens: downloadToken, subAccountId: doc.subAccountId, templateId } },
    });
  } catch (err) {
    console.error(`[page-templates] preview upload failed for ${templateId}`, err instanceof Error ? err.message : err);
    return fail("upload_failed");
  }
  const preview: PageTemplatePreview = {
    url: downloadUrl(bucket, key, downloadToken),
    storageKey: key,
    capturedAt: Date.now(),
    width: Math.round(THUMBNAIL_VIEWPORT.width * THUMBNAIL_SCALE),
    height: Math.round(THUMBNAIL_VIEWPORT.height * THUMBNAIL_SCALE),
  };
  const written = await getAdminDb()
    .runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data() as PageTemplateDoc | undefined;
      if (!fresh) return { ok: false, oldKey: null as string | null };
      tx.update(ref, { preview, previewStatus: "ready" });
      return { ok: true, oldKey: fresh.preview?.storageKey ?? null };
    })
    .catch(() => ({ ok: false, oldKey: null as string | null }));
  const storage = getStorage().bucket(bucket);
  if (!written.ok) await file.delete({ ignoreNotFound: true }).catch(() => undefined);
  else if (written.oldKey && written.oldKey !== key) await storage.file(written.oldKey).delete({ ignoreNotFound: true }).catch(() => undefined);
  return written.ok ? { status: "captured" } : { status: "skipped", reason: "deleted" };
}
