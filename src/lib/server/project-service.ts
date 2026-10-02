import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { GLOBAL_TERRITORY_ID } from "@/types";
import type {
  Project,
  ProjectStep,
  ProjectTemplate,
  ProjectTemplateAudience,
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

function normalizeTemplate(
  id: string,
  data: FirebaseFirestore.DocumentData
): ProjectTemplate {
  return {
    id,
    ...(data as Omit<ProjectTemplate, "id">),
    audience: data.audience === "client" ? "client" : "internal",
  };
}

export async function getProject(projectId: string): Promise<Project | null> {
  const snap = await projectsCol().doc(projectId).get();
  return snap.exists ? toDoc<Project>(snap) : null;
}

export async function listProjectsForSubAccount(
  subAccountId: string,
  status?: "active" | "archived"
): Promise<Project[]> {
  let q = projectsCol().where(
    "subAccountId",
    "==",
    subAccountId
  ) as FirebaseFirestore.Query;
  if (status) q = q.where("status", "==", status);
  const snap = await q.get();
  return snap.docs.map((d) => toDoc<Project>(d));
}

/** Every project assigned to this Contact — the Client Portal's "Your projects" section. */
export async function listProjectsForContact(
  subAccountId: string,
  contactId: string
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
  actor: { uid: string } | { memberId: string; contactId: string | null }
): boolean {
  if ("uid" in actor) return true; // staff — route-level auth already scoped this to the right sub-account
  return (
    !!project.assignedContactId && project.assignedContactId === actor.contactId
  );
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
  templateSteps?: ProjectTemplateStep[] | null;
  sourceOfferId?: string | null;
  sourcePurchaseId?: string | null;
  sourceTemplateId?: string | null;
  /** New projects use the unified CRM Tasks engine. Explicit "steps" is
   * retained only for controlled migration fixtures and recovery tooling. */
  taskModel?: "steps" | "tasks";
}

export async function createProject(opts: CreateProjectOpts): Promise<Project> {
  const taskModel = opts.taskModel ?? "tasks";
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
    sourceOfferId: opts.sourceOfferId ?? null,
    sourcePurchaseId: opts.sourcePurchaseId ?? null,
    sourceTemplateId: opts.sourceTemplateId ?? null,
    stepCount: 0,
    stepsDoneCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(taskModel === "tasks"
      ? { taskModel: "tasks" as const, milestones: [], timeSpentSeconds: 0 }
      : {}),
  };
  await ref.set(doc);

  if (taskModel === "tasks") {
    // Template steps become real CRM tasks on the new project.
    let steps = opts.templateSteps ?? [];
    if (!opts.templateSteps && opts.templateId) {
      const tSnap = await templatesCol().doc(opts.templateId).get();
      if (tSnap.exists) steps = (tSnap.data() as ProjectTemplate).steps ?? [];
    }
    if (steps.length > 0) {
      await createProjectTasksFromTitles(ref.id, {
        agencyId: opts.agencyId,
        subAccountId: opts.subAccountId,
        createdByUid: opts.createdByUid,
        clientContactId: opts.assignedContactId,
        titles: [...steps].sort((a, b) => a.order - b.order).map((s) => s.title),
      });
    }
    const snap = await ref.get();
    return toDoc<Project>(snap);
  }

  // Spawning from a template copies its steps in as real, independently
  // editable project steps — no live link back to the template afterward.
  if (opts.templateSteps || opts.templateId) {
    let steps = opts.templateSteps ?? [];
    if (!opts.templateSteps && opts.templateId) {
      const tSnap = await templatesCol().doc(opts.templateId).get();
      if (tSnap.exists) {
        const template = tSnap.data() as ProjectTemplate;
        steps = template.steps;
      }
    }
    if (steps.length > 0) {
      const batch = getAdminDb().batch();
      for (const step of steps) {
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
      batch.update(ref, { stepCount: steps.length });
      await batch.commit();
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
  patch: UpdateProjectOpts
): Promise<void> {
  const data: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
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
  const before =
    patch.assignedContactId !== undefined
      ? (await projectsCol().doc(projectId).get()).data()
      : null;
  await projectsCol().doc(projectId).set(data, { merge: true });

  // Task projects: when the client changes, tasks follow the new client's
  // territory, a client assignment to the OLD client is cleared, and tasks
  // become client-visible (or lose visibility when made internal).
  if (
    before?.taskModel === "tasks" &&
    patch.assignedContactId !== undefined &&
    (before.assignedContactId ?? null) !== patch.assignedContactId
  ) {
    const db = getAdminDb();
    const territoryId = await projectTerritoryId(patch.assignedContactId);
    const tasks = await db
      .collection("tasks")
      .where("subAccountId", "==", before.subAccountId)
      .where("projectId", "==", projectId)
      .get();
    for (let i = 0; i < tasks.docs.length; i += 400) {
      const batch = db.batch();
      for (const d of tasks.docs.slice(i, i + 400)) {
        const t = d.data();
        batch.update(d.ref, {
          territoryId,
          assigneeContactId:
            t.assigneeContactId && t.assigneeContactId === patch.assignedContactId
              ? t.assigneeContactId
              : null,
          visibility: patch.assignedContactId
            ? t.visibility === "internal"
              ? "internal"
              : "client"
            : null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }
}

export async function projectDeletePreview(projectId: string): Promise<{
  projectId: string;
  taskCount: number;
  stepCount: number;
  canDetach: boolean;
}> {
  const db = getAdminDb();
  const project = await projectsCol().doc(projectId).get();
  if (!project.exists) throw new Error("Project not found");
  const steps = await stepsCol(projectId).get();
  const tasks = project.data()?.taskModel === "tasks"
    ? await db.collection("tasks").where("subAccountId", "==", project.data()!.subAccountId).where("projectId", "==", projectId).get()
    : null;
  return {
    projectId,
    taskCount: tasks?.size ?? 0,
    // Converted projects retain their source steps as recovery data, but the
    // active task model must not count or expose them as a second task set.
    stepCount: project.data()?.taskModel === "tasks" ? 0 : steps.size,
    canDetach: !!tasks,
  };
}

export async function deleteProject(
  projectId: string,
  opts: { mode?: "delete" | "detach" } = {}
): Promise<void> {
  const db = getAdminDb();
  const project = await projectsCol().doc(projectId).get();
  if (!project.exists) return;
  const steps = await stepsCol(projectId).get();
  const mode = opts.mode ?? "delete";
  if (mode === "detach" && project.data()?.taskModel !== "tasks") {
    throw new Error("This project uses legacy checklist steps; those steps cannot be detached as standalone CRM tasks.");
  }
  if (mode === "detach") {
    const tasks = await db.collection("tasks").where("subAccountId", "==", project.data()!.subAccountId).where("projectId", "==", projectId).get();
    for (let i = 0; i < tasks.docs.length; i += 400) {
      const batch = db.batch();
      for (const d of tasks.docs.slice(i, i + 400)) {
        batch.update(d.ref, { projectId: null, updatedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    }
    await projectsCol().doc(projectId).delete();
    return;
  }
  const refs = steps.docs.map((d) => d.ref);
  if (project.data()?.taskModel === "tasks") {
    // A task project's tasks belong to it; time entries are kept (audit).
    const tasks = await db
      .collection("tasks")
      .where("subAccountId", "==", project.data()!.subAccountId)
      .where("projectId", "==", projectId)
      .get();
    refs.push(...tasks.docs.map((d) => d.ref));
  }
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    if (i + 400 >= refs.length) batch.delete(projectsCol().doc(projectId));
    await batch.commit();
  }
  if (refs.length === 0) await projectsCol().doc(projectId).delete();
}

/**
 * Creates plain project tasks from titles (workspace-template spawn). Client
 * projects get client-visible tasks in the client's territory.
 */
export async function createProjectTasksFromTitles(
  projectId: string,
  opts: {
    agencyId: string;
    subAccountId: string;
    createdByUid: string | null;
    clientContactId: string | null;
    titles: string[];
  }
): Promise<void> {
  const { createTaskServerSide } = await import("@/lib/server/tasks-service");
  const { recomputeProjectTaskCounts } = await import("@/lib/server/task-graph-service");
  const territoryId = await projectTerritoryId(opts.clientContactId);
  for (const title of opts.titles) {
    await createTaskServerSide({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      createdByUid: opts.createdByUid ?? "",
      mode: "live",
      title,
      notes: "",
      dueAt: null,
      contactId: null,
      dealId: null,
      eventId: null,
      territoryIdOverride: territoryId,
      extra: projectTaskExtra(projectId, opts.clientContactId),
    });
  }
  await recomputeProjectTaskCounts(projectId);
}

export async function projectTerritoryId(
  clientContactId: string | null
): Promise<string> {
  if (!clientContactId) return GLOBAL_TERRITORY_ID;
  const c = await getAdminDb().doc(`contacts/${clientContactId}`).get();
  const t = c.data()?.territoryId;
  return typeof t === "string" ? t : GLOBAL_TERRITORY_ID;
}

export function projectTaskExtra(
  projectId: string,
  clientContactId: string | null,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    projectId,
    parentTaskId: null,
    status: "todo",
    priority: null,
    assigneeUid: null,
    assigneeContactId: null,
    tags: [],
    estimateMinutes: null,
    checklist: [],
    attachments: [],
    dependsOnTaskIds: [],
    relatedTaskIds: [],
    recurrence: null,
    autoRollover: false,
    rolledOverCount: 0,
    timeSpentSeconds: 0,
    clientTimeSeconds: 0,
    visibility: clientContactId ? "client" : null,
    kind: "task",
    createdByMemberId: null,
    ...overrides,
  };
}

async function recomputeStepCounts(projectId: string): Promise<void> {
  const snap = await stepsCol(projectId).get();
  const stepCount = snap.size;
  const stepsDoneCount = snap.docs.filter((d) => d.data().done === true).length;
  await projectsCol()
    .doc(projectId)
    .set(
      { stepCount, stepsDoneCount, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
}

export async function addStep(
  projectId: string,
  opts: {
    agencyId: string;
    subAccountId: string;
    title: string;
    createdByUid: string | null;
    createdByMemberId: string | null;
  }
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
  patch: { title?: string; done?: boolean }
): Promise<void> {
  const data: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.done !== undefined) data.done = patch.done;
  await stepsCol(projectId).doc(stepId).set(data, { merge: true });
  if (patch.done !== undefined) await recomputeStepCounts(projectId);
}

export async function deleteStep(
  projectId: string,
  stepId: string
): Promise<void> {
  await stepsCol(projectId).doc(stepId).delete();
  await recomputeStepCounts(projectId);
}

// ── templates (coach-only) ──────────────────────────────────────────────────

export async function listTemplates(
  subAccountId: string
): Promise<ProjectTemplate[]> {
  const snap = await templatesCol()
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs.map((d) => normalizeTemplate(d.id, d.data()));
}

export async function getTemplate(
  templateId: string
): Promise<ProjectTemplate | null> {
  const snap = await templatesCol().doc(templateId).get();
  return snap.exists ? normalizeTemplate(snap.id, snap.data()!) : null;
}

export async function createTemplate(opts: {
  agencyId: string;
  subAccountId: string;
  title: string;
  category: string;
  durationDays: number | null;
  description: string;
  steps: ProjectTemplateStep[];
  audience?: ProjectTemplateAudience;
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
    audience: opts.audience === "client" ? "client" : "internal",
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
    audience: ProjectTemplateAudience;
  }>
): Promise<void> {
  await templatesCol()
    .doc(templateId)
    .set(
      { ...patch, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await templatesCol().doc(templateId).delete();
}
