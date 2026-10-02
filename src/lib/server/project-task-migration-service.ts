import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  projectTaskExtra,
  projectTerritoryId,
} from "@/lib/server/project-service";
import type { ProjectStep } from "@/types/projects";

const MIGRATION_VERSION = 1;
type ConversionStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ProjectTaskConversion {
  version: number;
  status: ConversionStatus;
  totalSteps: number;
  convertedSteps: number;
  failedStepIds: string[];
  error?: string | null;
  startedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  completedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export interface LegacyProjectAudit {
  projectId: string;
  subAccountId: string;
  title: string;
  status: string;
  stepCount: number;
  completedStepCount: number;
  taskCount: number;
  conversion: ProjectTaskConversion | null;
}

function stepsCol(projectId: string) {
  return getAdminDb().collection("projects").doc(projectId).collection("steps");
}

function stableTaskId(projectId: string, stepId: string): string {
  return ("legacy_project_task_" + projectId + "_" + stepId).replace(/[^A-Za-z0-9_-]/g, "_");
}

function dateValue(value: unknown): unknown {
  return value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? value
    : null;
}

function taskForStep(
  project: FirebaseFirestore.DocumentData,
  step: FirebaseFirestore.DocumentData,
  projectId: string,
  territoryId: string,
) {
  const completed = step.done === true;
  const createdByUid =
    typeof step.createdByUid === "string"
      ? step.createdByUid
      : typeof project.createdByUid === "string"
        ? project.createdByUid
        : "";
  const createdAt = dateValue(step.createdAt) ?? FieldValue.serverTimestamp();
  const updatedAt = dateValue(step.updatedAt) ?? createdAt;
  return {
    ...projectTaskExtra(projectId, project.assignedContactId ?? null, {
      legacyProjectStepId: step.id,
      legacyProjectStepPath: "projects/" + projectId + "/steps/" + step.id,
      legacyProjectStepOrder: Number.isFinite(step.order) ? step.order : 0,
      migrationVersion: MIGRATION_VERSION,
      status: completed ? "completed" : "todo",
      completedAt: completed ? dateValue(step.completedAt) : null,
      createdByMemberId: step.createdByMemberId ?? null,
      assigneeUid: typeof step.assigneeUid === "string" ? step.assigneeUid : null,
      visibility: project.assignedContactId ? "client" : null,
    }),
    title: typeof step.title === "string" ? step.title : "Untitled project task",
    notes: typeof step.notes === "string" ? step.notes : "",
    dueAt: dateValue(step.dueAt),
    completed,
    contactId: null,
    dealId: null,
    eventId: null,
    timeBlock: step.timeBlock ?? null,
    agencyId: project.agencyId,
    subAccountId: project.subAccountId,
    createdByUid,
    territoryId,
    mode: "live",
    createdAt,
    updatedAt,
  };
}

async function projectTaskDocs(projectId: string, subAccountId: string) {
  return getAdminDb()
    .collection("tasks")
    .where("subAccountId", "==", subAccountId)
    .where("projectId", "==", projectId)
    .get();
}

export async function auditLegacyProjects(
  subAccountId?: string,
): Promise<LegacyProjectAudit[]> {
  let query = getAdminDb().collection("projects") as FirebaseFirestore.Query;
  if (subAccountId) query = query.where("subAccountId", "==", subAccountId);
  const projects = await query.get();
  const result: LegacyProjectAudit[] = [];
  for (const projectSnap of projects.docs) {
    const project = projectSnap.data();
    if (project.taskModel === "tasks") continue;
    const [steps, tasks] = await Promise.all([
      stepsCol(projectSnap.id).orderBy("order", "asc").get(),
      projectTaskDocs(projectSnap.id, project.subAccountId),
    ]);
    result.push({
      projectId: projectSnap.id,
      subAccountId: project.subAccountId,
      title: project.title ?? "",
      status: project.status ?? "active",
      stepCount: steps.size,
      completedStepCount: steps.docs.filter((d) => d.data().done === true).length,
      taskCount: tasks.size,
      conversion: (project.taskConversion as ProjectTaskConversion | undefined) ?? null,
    });
  }
  return result;
}

export async function convertLegacyProject(projectId: string): Promise<LegacyProjectAudit> {
  const db = getAdminDb();
  const projectSnap = await db.doc("projects/" + projectId).get();
  if (!projectSnap.exists) throw new Error("Project not found");
  const project = projectSnap.data()!;
  if (project.taskModel === "tasks") {
    const tasks = await projectTaskDocs(projectId, project.subAccountId);
    return {
      projectId,
      subAccountId: project.subAccountId,
      title: project.title ?? "",
      status: project.status ?? "active",
      stepCount: Number(project.stepCount ?? tasks.size),
      completedStepCount: Number(project.stepsDoneCount ?? tasks.docs.filter((d) => d.data().completed === true).length),
      taskCount: tasks.size,
      conversion: (project.taskConversion as ProjectTaskConversion | undefined) ?? null,
    };
  }

  const steps = (await stepsCol(projectId).orderBy("order", "asc").get()).docs;
  const territoryId = await projectTerritoryId(project.assignedContactId ?? null);
  await projectSnap.ref.set({
    taskConversion: {
      version: MIGRATION_VERSION,
      status: "in_progress",
      totalSteps: steps.length,
      convertedSteps: 0,
      failedStepIds: [],
      error: null,
      startedAt: FieldValue.serverTimestamp(),
    } satisfies ProjectTaskConversion,
  }, { merge: true });

  const failedStepIds: string[] = [];
  let convertedSteps = 0;
  for (let i = 0; i < steps.length; i += 400) {
    const batch = db.batch();
    let creates = 0;
    for (const stepSnap of steps.slice(i, i + 400)) {
      const step = { id: stepSnap.id, ...stepSnap.data() } as ProjectStep & Record<string, unknown>;
      const ref = db.doc("tasks/" + stableTaskId(projectId, step.id));
      const existing = await ref.get();
      if (existing.exists) {
        const current = existing.data()!;
        if (current.projectId !== projectId || current.legacyProjectStepId !== step.id) {
          failedStepIds.push(step.id);
          continue;
        }
      } else {
        batch.create(ref, taskForStep(project, step, projectId, territoryId));
        creates++;
      }
      convertedSteps++;
    }
    if (creates > 0) await batch.commit();
  }

  if (failedStepIds.length > 0) {
    await projectSnap.ref.set({
      taskConversion: {
        version: MIGRATION_VERSION,
        status: "failed",
        totalSteps: steps.length,
        convertedSteps,
        failedStepIds,
        error: "A deterministic task ID conflicted with another record.",
      } satisfies ProjectTaskConversion,
    }, { merge: true });
    throw new Error("Project conversion failed for steps: " + failedStepIds.join(", "));
  }

  const tasks = await projectTaskDocs(projectId, project.subAccountId);
  const expected = new Set(steps.map((step) => stableTaskId(projectId, step.id)));
  const converted = tasks.docs.filter((task) => expected.has(task.id));
  if (converted.length !== steps.length) {
    const missing = steps
      .map((step) => stableTaskId(projectId, step.id))
      .filter((id) => !converted.some((task) => task.id === id));
    await projectSnap.ref.set({
      taskConversion: {
        version: MIGRATION_VERSION,
        status: "failed",
        totalSteps: steps.length,
        convertedSteps,
        failedStepIds: missing,
        error: "Verification found missing converted task records.",
      } satisfies ProjectTaskConversion,
    }, { merge: true });
    throw new Error("Project conversion verification failed: " + missing.join(", "));
  }

  const completedStepCount = steps.filter((step) => step.data().done === true).length;
  await projectSnap.ref.set({
    taskModel: "tasks",
    stepCount: steps.length,
    stepsDoneCount: completedStepCount,
    taskConversion: {
      version: MIGRATION_VERSION,
      status: "completed",
      totalSteps: steps.length,
      convertedSteps,
      failedStepIds: [],
      error: null,
      completedAt: FieldValue.serverTimestamp(),
    } satisfies ProjectTaskConversion,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    projectId,
    subAccountId: project.subAccountId,
    title: project.title ?? "",
    status: project.status ?? "active",
    stepCount: steps.length,
    completedStepCount,
    taskCount: converted.length,
    conversion: {
      version: MIGRATION_VERSION,
      status: "completed",
      totalSteps: steps.length,
      convertedSteps,
      failedStepIds: [],
    },
  };
}

export function legacyProjectTaskId(projectId: string, stepId: string): string {
  return stableTaskId(projectId, stepId);
}
