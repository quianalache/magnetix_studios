import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  Project,
  ProjectStep,
  ProjectTemplate,
  ProjectTemplateStep,
} from "@/types/projects";

/**
 * Admin-SDK service for Projects — the one place both the staff API routes
 * (`/api/sub-accounts/[id]/projects*`) and the portal member API routes
 * (`/api/portal/[saId]/projects*`) go through, so permission checks and the
 * step-count recompute logic live in exactly one place regardless of which
 * side made the change. See `src/types/projects.ts` for the data model.
 */

function projectsCol() {
  return getAdminDb().collection("projects");
}
function stepsCol(projectId: string) {
  return projectsCol().doc(projectId).collection("steps");
}
function templatesCol() {
  return getAdminDb().collection("projectTemplates");
}

function toDoc<T>(snap: FirebaseFirestore.DocumentSnapshot): T {
  return { id: snap.id, ...(snap.data() as Omit<T, "id">) } as T;
}

export async function getProject(projectId: string): Promise<Project | null> {
  const snap = await projectsCol().doc(projectId).get();
  return snap.exists ? toDoc<Project>(snap) : null;
}

export async function listProjectsForSubAccount(
  subAccountId: string,
  status?: "active" | "archived",
): Promise<Project[]> {
  let q = projectsCol().where(
    "subAccountId",
    "==",
    subAccountId,
  ) as FirebaseFirestore.Query;
  if (status) q = q.where("status", "==", status);
  const snap = await q.get();
  return snap.docs.map((d) => toDoc<Project>(d));
}

/** Every project assigned to this Contact — the Client Portal's "Your projects" section. */
export async function listProjectsForContact(
  subAccountId: string,
  contactId: string,
): Promise<Project[]> {
  const snap = await projectsCol()
    .where("subAccountId", "==", subAccountId)
    .where("assignedContactId", "==", contactId)
    .get();
  return snap.docs.map((d) => toDoc<Project>(d));
}

export async function listSteps(projectId: string): Promise<ProjectStep[]> {
  const snap = await stepsCol(projectId).orderBy("order", "asc").get();
  return snap.docs.map((d) => toDoc<ProjectStep>(d));
}

/** True when `actor` may read/edit this project: any staff caller (already gated at the route level by requireSubAccountMember), or the specific member it's assigned to. */
export function canActOnProject(
  project: Project,
  actor: { uid: string } | { memberId: string; contactId: string | null },
): boolean {
  if ("uid" in actor) return true; // staff — route-level auth already scoped this to the right sub-account
  return !!project.assignedContactId && project.assignedContactId === actor.contactId;
}

export interface CreateProjectOpts {
  agencyId: string;
  subAccountId: string;
  title: string;
  description: string;
  startAt: Date | null;
  dueAt: Date | null;
  assignedContactId: string | null;
  assignedContactName: string | null;
  createdByUid: string | null;
  createdByMemberId: string | null;
  templateId?: string | null;
}

export async function createProject(opts: CreateProjectOpts): Promise<Project> {
  const ref = projectsCol().doc();
  const doc: Omit<Project, "id"> = {
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    title: opts.title,
    description: opts.description,
    status: "active",
    startAt: opts.startAt ? Timestamp.fromDate(opts.startAt) : null,
    dueAt: opts.dueAt ? Timestamp.fromDate(opts.dueAt) : null,
    assignedContactId: opts.assignedContactId,
    assignedContactName: opts.assignedContactName,
    createdByUid: opts.createdByUid,
    createdByMemberId: opts.createdByMemberId,
    templateId: opts.templateId ?? null,
    stepCount: 0,
    stepsDoneCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);

  // Spawning from a template copies its steps in as real, independently
  // editable project steps — no live link back to the template afterward.
  if (opts.templateId) {
    const tSnap = await templatesCol().doc(opts.templateId).get();
    if (tSnap.exists) {
      const template = tSnap.data() as ProjectTemplate;
      const batch = getAdminDb().batch();
      for (const step of template.steps) {
        const stepRef = stepsCol(ref.id).doc();
        batch.set(stepRef, {
          agencyId: opts.agencyId,
          subAccountId: opts.subAccountId,
          title: step.title,
          done: false,
          order: step.order,
          createdByUid: opts.createdByUid,
          createdByMemberId: opts.createdByMemberId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (template.steps.length > 0) {
        batch.update(ref, { stepCount: template.steps.length });
        await batch.commit();
      }
    }
  }

  const snap = await ref.get();
  return toDoc<Project>(snap);
}

export interface UpdateProjectOpts {
  title?: string;
  description?: string;
  status?: "active" | "archived";
  startAt?: Date | null;
  dueAt?: Date | null;
  assignedContactId?: string | null;
  assignedContactName?: string | null;
}

export async function updateProject(
  projectId: string,
  patch: UpdateProjectOpts,
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.startAt !== undefined) {
    data.startAt = patch.startAt ? Timestamp.fromDate(patch.startAt) : null;
  }
  if (patch.dueAt !== undefined) {
    data.dueAt = patch.dueAt ? Timestamp.fromDate(patch.dueAt) : null;
  }
  if (patch.assignedContactId !== undefined) {
    data.assignedContactId = patch.assignedContactId;
    data.assignedContactName = patch.assignedContactName ?? null;
  }
  await projectsCol().doc(projectId).set(data, { merge: true });
}

export async function deleteProject(projectId: string): Promise<void> {
  const steps = await stepsCol(projectId).get();
  const batch = getAdminDb().batch();
  for (const d of steps.docs) batch.delete(d.ref);
  batch.delete(projectsCol().doc(projectId));
  await batch.commit();
}

async function recomputeStepCounts(projectId: string): Promise<void> {
  const snap = await stepsCol(projectId).get();
  const stepCount = snap.size;
  const stepsDoneCount = snap.docs.filter((d) => d.data().done === true).length;
  await projectsCol()
    .doc(projectId)
    .set({ stepCount, stepsDoneCount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function addStep(
  projectId: string,
  opts: {
    agencyId: string;
    subAccountId: string;
    title: string;
    createdByUid: string | null;
    createdByMemberId: string | null;
  },
): Promise<ProjectStep> {
  const existing = await stepsCol(projectId).get();
  const order = existing.size;
  const ref = stepsCol(projectId).doc();
  await ref.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    title: opts.title,
    done: false,
    order,
    createdByUid: opts.createdByUid,
    createdByMemberId: opts.createdByMemberId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recomputeStepCounts(projectId);
  const snap = await ref.get();
  return toDoc<ProjectStep>(snap);
}

export async function updateStep(
  projectId: string,
  stepId: string,
  patch: { title?: string; done?: boolean },
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.done !== undefined) data.done = patch.done;
  await stepsCol(projectId).doc(stepId).set(data, { merge: true });
  if (patch.done !== undefined) await recomputeStepCounts(projectId);
}

export async function deleteStep(projectId: string, stepId: string): Promise<void> {
  await stepsCol(projectId).doc(stepId).delete();
  await recomputeStepCounts(projectId);
}

// ── templates (coach-only) ──────────────────────────────────────────────────

export async function listTemplates(subAccountId: string): Promise<ProjectTemplate[]> {
  const snap = await templatesCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDoc<ProjectTemplate>(d));
}

export async function createTemplate(opts: {
  agencyId: string;
  subAccountId: string;
  title: string;
  category: string;
  durationDays: number | null;
  description: string;
  steps: ProjectTemplateStep[];
}): Promise<ProjectTemplate> {
  const ref = templatesCol().doc();
  await ref.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    title: opts.title,
    category: opts.category,
    durationDays: opts.durationDays,
    description: opts.description,
    steps: opts.steps,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<ProjectTemplate>(snap);
}

export async function updateTemplate(
  templateId: string,
  patch: Partial<{
    title: string;
    category: string;
    durationDays: number | null;
    description: string;
    steps: ProjectTemplateStep[];
  }>,
): Promise<void> {
  await templatesCol()
    .doc(templateId)
    .set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await templatesCol().doc(templateId).delete();
}
