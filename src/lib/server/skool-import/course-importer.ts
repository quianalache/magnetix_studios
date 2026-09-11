import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  createStandaloneCourseServerSide,
  createStandaloneSectionServerSide,
  createStandaloneLessonServerSide,
  updateStandaloneLessonServerSide,
  linkCommunityGroupServerSide,
} from "@/lib/server/standalone-course-service";
import { getExistingMappingsBulk, writeMapping } from "./import-mappings";
import type { CourseImportPlan } from "./mapping";

/**
 * Orchestrates one run over already-PLANNED Skool course data (see
 * mapping.ts's planStandaloneCourseImport — this module has zero knowledge
 * of Skool/HTTP/extraction details) — either as a `commit: false` dry-run
 * PLAN (guaranteed zero Firestore mutations) or a `commit: true` EXECUTE
 * pass. Mirrors importer.ts's own member/post/comment convention: one code
 * path for both modes, differing only in whether a "would create" branch
 * actually writes, so a dry run can never silently drift from what a real
 * run actually does.
 *
 * A mapping-exists check is ALWAYS performed (a Firestore read is safe in
 * either mode) — only the "no mapping yet" branch differs by `commit`. This
 * is what makes a dry run run AFTER a real import correctly report
 * "matched existing" instead of misreporting "would create" (see the
 * second-run idempotency check this exists to support).
 *
 * Every write goes through the SAME canonical services the rest of the app
 * uses (createStandaloneCourseServerSide, createStandaloneSectionServerSide,
 * createStandaloneLessonServerSide, updateStandaloneLessonServerSide,
 * linkCommunityGroupServerSide) — no lower-level direct Firestore writes for
 * anything this importer creates.
 */

export interface CourseImportCounts {
  received: number;
  matchedExisting: number;
  wouldCreate: number;
  created: number;
  skipped: number;
  failed: number;
}

function emptyCounts(): CourseImportCounts {
  return {
    received: 0,
    matchedExisting: 0,
    wouldCreate: 0,
    created: 0,
    skipped: 0,
    failed: 0,
  };
}

export interface CourseImportError {
  entity: string;
  externalId: string;
  message: string;
}

/** A mapping exists, but the Magnetix doc it points to is gone — never
 *  auto-recreated (that would silently orphan whatever the mapping used to
 *  mean); surfaced here for a human to resolve instead. */
export interface ReconciliationIssue {
  entity: string;
  externalId: string;
  message: string;
}

export type CourseImportAction =
  | "created"
  | "would-create"
  | "matched-existing"
  | "skipped"
  | "failed";

export interface CourseImportResult {
  skoolCourseId: string;
  title: string;
  action: CourseImportAction;
  magnetixCourseId: string | null;
  offerId: string | null;
  offerVisibility: string | null;
  sectionCount: number;
  lessonCount: number;
  reason?: string;
}

export interface CourseImportReport {
  commit: boolean;
  targetGroupId: string;
  courses: CourseImportCounts;
  offers: CourseImportCounts;
  sections: CourseImportCounts;
  lessons: CourseImportCounts;
  /** Lessons imported (or projected) with no video attached because the
   *  source video is Skool-hosted (native/Mux) or an unrecognized external
   *  format — never faked with a signed/temporary URL. */
  videosPending: number;
  /** Resource items imported (or projected) without their file attached
   *  because no permanent URL exists for a Skool-hosted file yet. */
  filesPending: number;
  errors: CourseImportError[];
  reconciliationIssues: ReconciliationIssue[];
  courseResults: CourseImportResult[];
}

export interface RunCourseImportOptions {
  subAccountId: string;
  agencyId: string;
  targetGroupId: string;
  commit: boolean;
  plans: CourseImportPlan[];
  /** Skool course ids to hold back from creation entirely this run, each
   *  with a human-readable reason (e.g. a pre-existing, non-Skool-mapped
   *  Product with a colliding title) — reported explicitly, never silently
   *  skipped and never merged by title. */
  skipCourseIds?: Map<string, string>;
}

async function findCompanionOffer(
  subAccountId: string,
  courseId: string
): Promise<{ id: string; visibility: string; count: number }> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/courseOffers`)
    .where("courseIds", "array-contains", courseId)
    .get();
  const first = snap.docs[0];
  return {
    id: first?.id ?? "",
    visibility: (first?.data().visibility as string) ?? "",
    count: snap.size,
  };
}

export async function runSkoolCourseImport(
  opts: RunCourseImportOptions
): Promise<CourseImportReport> {
  const db = getAdminDb();
  const report: CourseImportReport = {
    commit: opts.commit,
    targetGroupId: opts.targetGroupId,
    courses: emptyCounts(),
    offers: emptyCounts(),
    sections: emptyCounts(),
    lessons: emptyCounts(),
    videosPending: 0,
    filesPending: 0,
    errors: [],
    reconciliationIssues: [],
    courseResults: [],
  };

  const existingCourseMappings = await getExistingMappingsBulk(
    opts.subAccountId,
    "standalone_courses",
    opts.plans.map((p) => p.skoolCourseId)
  );

  for (const plan of opts.plans) {
    report.courses.received += 1;

    const skipReason = opts.skipCourseIds?.get(plan.skoolCourseId);
    if (skipReason) {
      report.courses.skipped += 1;
      report.courseResults.push({
        skoolCourseId: plan.skoolCourseId,
        title: plan.title,
        action: "skipped",
        magnetixCourseId: null,
        offerId: null,
        offerVisibility: null,
        sectionCount: plan.sections.length,
        lessonCount: plan.lessons.length,
        reason: skipReason,
      });
      continue;
    }

    let magnetixCourseId: string | null = null;
    let action: CourseImportAction;

    const existingMapping = existingCourseMappings.get(plan.skoolCourseId);
    if (existingMapping) {
      const existingDoc = await db
        .doc(
          `subAccounts/${opts.subAccountId}/standaloneCourses/${existingMapping.leadstackId}`
        )
        .get();
      if (!existingDoc.exists) {
        report.reconciliationIssues.push({
          entity: "standalone_courses",
          externalId: plan.skoolCourseId,
          message: `importMapping points to standaloneCourses/${existingMapping.leadstackId}, which no longer exists — needs manual reconciliation, not auto-recreated.`,
        });
        report.courses.failed += 1;
        report.courseResults.push({
          skoolCourseId: plan.skoolCourseId,
          title: plan.title,
          action: "failed",
          magnetixCourseId: null,
          offerId: null,
          offerVisibility: null,
          sectionCount: plan.sections.length,
          lessonCount: plan.lessons.length,
          reason: "mapping target missing",
        });
        continue;
      }
      magnetixCourseId = existingMapping.leadstackId;
      action = "matched-existing";
      report.courses.matchedExisting += 1;
    } else if (opts.commit) {
      try {
        const created = await createStandaloneCourseServerSide({
          subAccountId: opts.subAccountId,
          agencyId: opts.agencyId,
          title: plan.title,
          aboutHtml: plan.aboutHtml,
          coverUrl:
            plan.coverUrlClassification === "direct" ? plan.coverUrl : null,
          access: plan.plannedAccess,
          published: plan.plannedPublished,
        });
        magnetixCourseId = created.id;
        await writeMapping({
          subAccountId: opts.subAccountId,
          entity: "standalone_courses",
          externalId: plan.skoolCourseId,
          leadstackId: created.id,
        });
        await linkCommunityGroupServerSide({
          subAccountId: opts.subAccountId,
          courseId: created.id,
          groupId: opts.targetGroupId,
        });
        action = "created";
        report.courses.created += 1;
      } catch (err) {
        report.courses.failed += 1;
        report.errors.push({
          entity: "standalone_courses",
          externalId: plan.skoolCourseId,
          message: err instanceof Error ? err.message : String(err),
        });
        report.courseResults.push({
          skoolCourseId: plan.skoolCourseId,
          title: plan.title,
          action: "failed",
          magnetixCourseId: null,
          offerId: null,
          offerVisibility: null,
          sectionCount: plan.sections.length,
          lessonCount: plan.lessons.length,
          reason: "course creation failed",
        });
        continue;
      }
    } else {
      // Dry run, no existing mapping — project counts, no real id exists to
      // scope any Firestore read/write to, so section/lesson accounting is
      // a straight projection from the plan, not a per-entity mapping check.
      action = "would-create";
      report.courses.wouldCreate += 1;
      report.offers.wouldCreate += 1;
      report.sections.wouldCreate += plan.sections.length;
      for (const lesson of plan.lessons) {
        report.lessons.wouldCreate += 1;
        if (
          lesson.video.readiness === "requires-video-migration" ||
          lesson.video.readiness === "unsupported-external-video"
        ) {
          report.videosPending += 1;
        }
        report.filesPending += lesson.resources.rehostRequired.length;
      }
      report.courseResults.push({
        skoolCourseId: plan.skoolCourseId,
        title: plan.title,
        action,
        magnetixCourseId: null,
        offerId: null,
        offerVisibility: null,
        sectionCount: plan.sections.length,
        lessonCount: plan.lessons.length,
      });
      continue;
    }

    // magnetixCourseId is resolved (matched-existing or just created for
    // real) — offer verification and section/lesson idempotency checks run
    // identically for both from here.
    const offer = await findCompanionOffer(opts.subAccountId, magnetixCourseId);
    let offerId: string | null = offer.count > 0 ? offer.id : null;
    let offerVisibility: string | null =
      offer.count > 0 ? offer.visibility : null;
    if (action === "created") {
      report.offers.created += 1;
      if (offer.count !== 1) {
        report.errors.push({
          entity: "course_offers",
          externalId: plan.skoolCourseId,
          message: `Expected exactly 1 auto-created companion Offer, found ${offer.count}.`,
        });
      }
    } else {
      report.offers.matchedExisting += 1;
      if (offer.count !== 1) {
        report.errors.push({
          entity: "course_offers",
          externalId: plan.skoolCourseId,
          message: `Expected exactly 1 companion Offer on an existing course, found ${offer.count}.`,
        });
      }
    }

    // --- Sections (created before lessons — lessons need a real sectionId
    //     to reference; see mapping.ts's ordering doc comment for why this
    //     doesn't affect real curriculum ordering) ---
    const existingSectionMappings = await getExistingMappingsBulk(
      opts.subAccountId,
      "standalone_course_sections",
      plan.sections.map((s) => s.skoolSectionId)
    );
    const sectionMagnetixIdBySkoolId = new Map<string, string>();
    for (const section of plan.sections) {
      report.sections.received += 1;
      const existing = existingSectionMappings.get(section.skoolSectionId);
      if (existing) {
        const doc = await db
          .doc(
            `subAccounts/${opts.subAccountId}/standaloneCourses/${magnetixCourseId}/sections/${existing.leadstackId}`
          )
          .get();
        if (!doc.exists) {
          report.reconciliationIssues.push({
            entity: "standalone_course_sections",
            externalId: section.skoolSectionId,
            message: `importMapping points to a section doc that no longer exists — needs manual reconciliation.`,
          });
          report.sections.failed += 1;
          continue;
        }
        sectionMagnetixIdBySkoolId.set(
          section.skoolSectionId,
          existing.leadstackId
        );
        report.sections.matchedExisting += 1;
        continue;
      }
      if (!opts.commit) {
        report.sections.wouldCreate += 1;
        continue;
      }
      try {
        const created = await createStandaloneSectionServerSide({
          subAccountId: opts.subAccountId,
          courseId: magnetixCourseId,
          title: section.title,
        });
        sectionMagnetixIdBySkoolId.set(section.skoolSectionId, created.id);
        await writeMapping({
          subAccountId: opts.subAccountId,
          entity: "standalone_course_sections",
          externalId: section.skoolSectionId,
          leadstackId: created.id,
          parentId: magnetixCourseId,
        });
        report.sections.created += 1;
      } catch (err) {
        report.sections.failed += 1;
        report.errors.push({
          entity: "standalone_course_sections",
          externalId: section.skoolSectionId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // --- Lessons, in the plan's exact createSequence order ---
    const existingLessonMappings = await getExistingMappingsBulk(
      opts.subAccountId,
      "standalone_course_lessons",
      plan.lessons.map((l) => l.skoolLessonId)
    );
    for (const lesson of plan.lessons) {
      report.lessons.received += 1;
      const existing = existingLessonMappings.get(lesson.skoolLessonId);
      if (existing) {
        const doc = await db
          .doc(
            `subAccounts/${opts.subAccountId}/standaloneCourses/${magnetixCourseId}/lessons/${existing.leadstackId}`
          )
          .get();
        if (!doc.exists) {
          report.reconciliationIssues.push({
            entity: "standalone_course_lessons",
            externalId: lesson.skoolLessonId,
            message: `importMapping points to a lesson doc that no longer exists — needs manual reconciliation.`,
          });
          report.lessons.failed += 1;
          continue;
        }
        report.lessons.matchedExisting += 1;
        if (
          lesson.video.readiness === "requires-video-migration" ||
          lesson.video.readiness === "unsupported-external-video"
        ) {
          report.videosPending += 1;
        }
        report.filesPending += lesson.resources.rehostRequired.length;
        continue;
      }
      if (!opts.commit) {
        report.lessons.wouldCreate += 1;
        if (
          lesson.video.readiness === "requires-video-migration" ||
          lesson.video.readiness === "unsupported-external-video"
        ) {
          report.videosPending += 1;
        }
        report.filesPending += lesson.resources.rehostRequired.length;
        continue;
      }
      const sectionId = lesson.sectionSkoolId
        ? (sectionMagnetixIdBySkoolId.get(lesson.sectionSkoolId) ?? null)
        : null;
      if (lesson.sectionSkoolId && !sectionId) {
        report.errors.push({
          entity: "standalone_course_lessons",
          externalId: lesson.skoolLessonId,
          message: `Section ${lesson.sectionSkoolId} could not be resolved (creation may have failed above) — lesson created flat (sectionId null) instead of under its real section.`,
        });
      }
      try {
        const created = await createStandaloneLessonServerSide({
          subAccountId: opts.subAccountId,
          courseId: magnetixCourseId,
          sectionId,
          title: lesson.title,
        });
        await updateStandaloneLessonServerSide({
          subAccountId: opts.subAccountId,
          courseId: magnetixCourseId,
          lessonId: created.id,
          patch: {
            bodyHtml: lesson.bodyHtml,
            videoUrl:
              lesson.video.readiness === "importable"
                ? lesson.video.videoUrl
                : undefined,
            resourceLinks: lesson.resources.resourceLinks,
            // Always left unpublished — see this importer's own report for
            // the exact policy (parent Product is draft; media/access
            // review isn't complete for most courses; nothing should
            // become member-visible merely because this import ran).
            published: false,
          },
        });
        await writeMapping({
          subAccountId: opts.subAccountId,
          entity: "standalone_course_lessons",
          externalId: lesson.skoolLessonId,
          leadstackId: created.id,
          parentId: magnetixCourseId,
        });
        report.lessons.created += 1;
        if (
          lesson.video.readiness === "requires-video-migration" ||
          lesson.video.readiness === "unsupported-external-video"
        ) {
          report.videosPending += 1;
        }
        report.filesPending += lesson.resources.rehostRequired.length;
      } catch (err) {
        report.lessons.failed += 1;
        report.errors.push({
          entity: "standalone_course_lessons",
          externalId: lesson.skoolLessonId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Re-resolve the offer snapshot once more after section/lesson writes,
    // in case an error above changed nothing about it — cheap, and keeps
    // the reported offerId/visibility accurate to what's really in Firestore
    // right now rather than the pre-section/lesson snapshot taken earlier.
    if (offerId === null) {
      const refreshed = await findCompanionOffer(
        opts.subAccountId,
        magnetixCourseId
      );
      offerId = refreshed.count > 0 ? refreshed.id : null;
      offerVisibility = refreshed.count > 0 ? refreshed.visibility : null;
    }

    report.courseResults.push({
      skoolCourseId: plan.skoolCourseId,
      title: plan.title,
      action,
      magnetixCourseId,
      offerId,
      offerVisibility,
      sectionCount: plan.sections.length,
      lessonCount: plan.lessons.length,
    });
  }

  return report;
}
