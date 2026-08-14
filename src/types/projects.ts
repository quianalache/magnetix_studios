import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Projects — MomentumOS-parity work management, ported into the CRM per her
 * request to mimic MomentumOS's Projects/Templates structure exactly rather
 * than invent a new design (audited the real "Momentum OS — Daily Flow"
 * artifact for copy/structure: Active Projects / Templates / Archived tabs,
 * a project card with status pill + progress bar + milestones, coach-only
 * templates).
 *
 * The one thing MomentumOS itself has no concept of: `assignedContactId`.
 * When set, the project is a client deliverable — visible on both sides
 * (staff in the CRM, the client in their Client Portal), collaboratively
 * editable by whichever side opens it. `null` = an internal/coach-only
 * project, the plain MomentumOS case.
 *
 * Deliberately its own top-level collection (like `tasks`), NOT nested under
 * `subAccounts/{id}` — matches every other tenant-scoped collection's
 * convention in this codebase. Kept separate from the existing `tasks`
 * collection for now; consolidating them is a later idea, not this build.
 */

export type ProjectStatus = "active" | "archived";
export type ProjectTemplateAudience = "internal" | "client";

export interface Project {
  id: string;
  agencyId: string;
  subAccountId: string;
  title: string;
  description: string;
  status: ProjectStatus;
  startAt: Timestamp | FieldValue | null;
  dueAt: Timestamp | FieldValue | null;
  /** Set = a client deliverable, mirrored into that Contact's Client Portal. Null = internal, coach-only (plain MomentumOS project). */
  assignedContactId: string | null;
  /** Denormalized at assign-time so the CRM card/badge never needs a second read. Re-synced if the contact's name changes (best-effort, on next edit). */
  assignedContactName: string | null;
  /** Which side originated this project — either is set, never both. */
  createdByUid: string | null;
  createdByMemberId: string | null;
  /** The template this was spawned from, if any — informational only, no live link back. */
  templateId: string | null;
  /** Offer entitlement provenance, when a client project was instantiated from a purchase/grant. */
  sourceOfferId?: string | null;
  sourcePurchaseId?: string | null;
  sourceTemplateId?: string | null;
  /** Denormalized step counts, kept in sync by project-service.ts on every step mutation — avoids a subcollection read just to render a progress bar. */
  stepCount: number;
  stepsDoneCount: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface ProjectStep {
  id: string;
  /** Denormalized for Firestore rules (a subcollection doc can't otherwise be scoped without a get() on the parent). */
  agencyId: string;
  subAccountId: string;
  title: string;
  done: boolean;
  order: number;
  createdByUid: string | null;
  createdByMemberId: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface ProjectTemplateStep {
  title: string;
  order: number;
}

export interface ProjectTemplate {
  id: string;
  agencyId: string;
  subAccountId: string;
  title: string;
  /** Free-text category line, e.g. "Content Workflow" — matches MomentumOS's own template cards ("Content Workflow · 14 days"). */
  category: string;
  durationDays: number | null;
  description: string;
  steps: ProjectTemplateStep[];
  /** "internal" = coach/business workflows. "client" = assignable to contacts and eligible for offers. Missing legacy values default to internal. */
  audience?: ProjectTemplateAudience;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type ProjectFormData = {
  title: string;
  description: string;
  startAt: Date | null;
  dueAt: Date | null;
  assignedContactId: string | null;
};

export type ProjectTemplateFormData = {
  title: string;
  category: string;
  durationDays: number | null;
  description: string;
  steps: ProjectTemplateStep[];
  audience: ProjectTemplateAudience;
};

export function projectProgressPct(
  project: Pick<Project, "stepCount" | "stepsDoneCount">
): number {
  if (project.stepCount <= 0) return 0;
  return Math.round((project.stepsDoneCount / project.stepCount) * 100);
}

export function projectTemplateAudience(
  template: Pick<ProjectTemplate, "audience">
): ProjectTemplateAudience {
  return template.audience === "client" ? "client" : "internal";
}
