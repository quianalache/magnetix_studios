import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createTaskServerSide } from "@/lib/server/tasks-service";
import {
  projectTaskExtra,
  projectTerritoryId,
} from "@/lib/server/project-service";
import {
  recomputeProjectTaskCounts,
  recordTaskActivity,
} from "@/lib/server/task-graph-service";
import { TaskInputError } from "@/lib/server/project-tasks-service";
import { SYSTEM_TEMPLATES } from "@/lib/projects/template-library";

/**
 * Restored Momentum OS "Generate Project" (`kSe` + `generateProject`) for
 * the 8 recovered system templates, onto the shared CRM Tasks engine:
 *
 * - Project: name (defaults to the template name), description = template
 *   description, start date, due date = chosen end date, else start +
 *   `estimated_days` (the original's 14-day fallback when a template has no
 *   duration).
 * - One real task per template task, keeping priority, time block,
 *   estimate and tags. Due = start + `day_offset` when "auto-schedule" is
 *   on, otherwise every task is due on the start date (original behavior).
 *   `offset_label` is NOT copied onto tasks (the original didn't either);
 *   it IS kept on generated milestones.
 * - Milestones (if included): due = start + `day_offset`.
 * - Routines (if included): one recurring task each, priority medium, tags
 *   ["routine","generated"], the routine's recurrence / block / estimate.
 * The template data itself is never written anywhere.
 */

const DAY = 86_400_000;
/** Generated due times land at 17:00 on their day (start is local midnight). */
const DUE_TIME = 17 * 3600 * 1000;
const BLOCK_MAP: Record<string, "am" | "midday" | "pm" | "anytime"> = {
  AM: "am",
  Midday: "midday",
  PM: "pm",
  Anytime: "anytime",
};

export async function generateProjectFromSystemTemplate(opts: {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  templateKey: string;
  title: string;
  /** Local midnight of the chosen start day (the browser sends it as ISO). */
  startAt: Date;
  endAt: Date | null;
  autoSchedule: boolean;
  includeRoutines: boolean;
  includeMilestones: boolean;
  assignedContactId: string | null;
}): Promise<{ projectId: string; tasks: number; routines: number; milestones: number }> {
  const template = SYSTEM_TEMPLATES.find((t) => t.key === opts.templateKey);
  if (!template) throw new TaskInputError("Template not found", 404);
  const db = getAdminDb();

  let assignedContactName: string | null = null;
  if (opts.assignedContactId) {
    const c = await db.doc(`contacts/${opts.assignedContactId}`).get();
    if (c.data()?.subAccountId !== opts.subAccountId) {
      throw new TaskInputError("Contact not found", 404);
    }
    assignedContactName = (c.data()?.name as string) ?? null;
  }

  const start = opts.startAt.getTime();
  const due =
    opts.endAt ?? new Date(start + (template.durationDays ?? 14) * DAY);
  const milestones = opts.includeMilestones
    ? template.milestones.map((m, i) => ({
        id: `m${i + 1}`,
        title: m.title,
        dueAt: Timestamp.fromDate(new Date(start + m.dayOffset * DAY + DUE_TIME)),
        offsetLabel: m.offsetLabel ?? null,
        completedAt: null,
      }))
    : [];

  const projectRef = db.collection("projects").doc();
  await projectRef.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    title: opts.title || template.name,
    description: template.description,
    status: "active",
    startAt: Timestamp.fromDate(opts.startAt),
    dueAt: Timestamp.fromDate(due),
    assignedContactId: opts.assignedContactId,
    assignedContactName,
    createdByUid: opts.createdByUid,
    createdByMemberId: null,
    templateId: null,
    systemTemplateId: template.key,
    sourceOfferId: null,
    sourcePurchaseId: null,
    sourceTemplateId: null,
    stepCount: 0,
    stepsDoneCount: 0,
    taskModel: "tasks",
    milestones,
    timeSpentSeconds: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const territoryId = await projectTerritoryId(opts.assignedContactId);
  const base = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    createdByUid: opts.createdByUid,
    mode: "live" as const,
    notes: "",
    contactId: null,
    dealId: null,
    eventId: null,
    territoryIdOverride: territoryId,
  };
  for (const t of template.tasks) {
    const offset = opts.autoSchedule ? (t.dayOffset ?? 0) : 0;
    await createTaskServerSide({
      ...base,
      title: t.title,
      dueAt: new Date(start + offset * DAY + DUE_TIME),
      timeBlock: t.timeBlock ? BLOCK_MAP[t.timeBlock] ?? null : null,
      extra: projectTaskExtra(projectRef.id, opts.assignedContactId, {
        priority: t.priority,
        estimateMinutes: t.estimatedMinutes,
        tags: t.tags,
      }),
    });
  }
  let routines = 0;
  if (opts.includeRoutines) {
    for (const r of template.routines) {
      routines++;
      await createTaskServerSide({
        ...base,
        title: r.title,
        dueAt: new Date(start + DUE_TIME),
        timeBlock: r.timeBlock ? BLOCK_MAP[r.timeBlock] ?? null : null,
        extra: projectTaskExtra(projectRef.id, opts.assignedContactId, {
          priority: "medium",
          estimateMinutes: r.estimatedMinutes,
          tags: ["routine", "generated"],
          recurrence: { type: r.recurrenceType },
          kind: "routine",
        }),
      });
    }
  }
  await recomputeProjectTaskCounts(projectRef.id);
  return {
    projectId: projectRef.id,
    tasks: template.tasks.length,
    routines,
    milestones: milestones.length,
  };
}

// ── milestones ──────────────────────────────────────────────────────────────

type MilestoneDoc = {
  id: string;
  title: string;
  dueAt: Timestamp | null;
  offsetLabel?: string | null;
  completedAt: Timestamp | null;
};

/** Read-modify-write of `projects/{id}.milestones` in a transaction. */
export async function mutateMilestones(
  projectId: string,
  subAccountId: string,
  mutate: (list: MilestoneDoc[]) => MilestoneDoc[],
  actor?: { uid: string; summary: string }
): Promise<MilestoneDoc[]> {
  const db = getAdminDb();
  const ref = db.doc(`projects/${projectId}`);
  let projectData: FirebaseFirestore.DocumentData | undefined;
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    projectData = snap.data();
    if (!projectData || projectData.subAccountId !== subAccountId) {
      throw new TaskInputError("Project not found", 404);
    }
    const list = mutate(
      Array.isArray(projectData.milestones) ? [...projectData.milestones] : []
    );
    tx.set(
      ref,
      { milestones: list, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return list;
  });
  if (actor && projectData) {
    await recordTaskActivity({
      subAccountId,
      agencyId: projectData.agencyId,
      taskId: "",
      projectId,
      taskTitle: "",
      type: "milestone_changed",
      actor: { kind: "staff", uid: actor.uid },
      summary: actor.summary,
      detail: { milestone: true },
      visibility: projectData.assignedContactId ? "client" : "internal",
    });
  }
  return next;
}

export function newMilestoneId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
