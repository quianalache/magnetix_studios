import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentMember } from "@/lib/community/member-session";
import { canActOnProject } from "@/lib/server/project-service";
import {
  actorKeyOf,
  getActiveTimer,
} from "@/lib/server/time-tracking-service";
import type { Project } from "@/types/projects";
import type { ActiveTimerView } from "@/types/time-tracking";

/**
 * Client Portal access to TASK-based projects (Projects & Tasks Phase 2).
 * Everything a client can see or do is decided HERE on the server — the
 * portal UI hiding a button is never the protection.
 *
 * A client may only touch a task when ALL hold:
 *   - they're an active member of this sub-account (session cookie),
 *   - the task's project is assigned to THEIR contact (canActOnProject),
 *   - the task (and its parent, for a subtask) isn't `visibility:"internal"`.
 * Then: complete = they created it OR it's assigned to their contact;
 *       edit / delete = they created it;
 *       time = any visible, open task (their own entries only).
 *
 * The projection sent to the browser (`PortalTaskView`) deliberately omits
 * internal notes/comments, deal/contact links, staff assignees and staff
 * time — clients only ever get their own time totals.
 */

export type PortalMember = NonNullable<Awaited<ReturnType<typeof getCurrentMember>>>;

export interface PortalTaskView {
  id: string;
  title: string;
  description: string;
  dueAt: string | null;
  priority: string | null;
  status: string;
  completed: boolean;
  parentTaskId: string | null;
  checklist: { id: string; title: string; done: boolean }[];
  isOwn: boolean;
  assignedToMe: boolean;
  canComplete: boolean;
  canEdit: boolean;
  /** The CLIENT'S OWN tracked time on this task. */
  myTimeSeconds: number;
}

export interface PortalMilestoneView {
  id: string;
  title: string;
  dueAt: string | null;
  completed: boolean;
}

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

export function portalPermissions(
  task: FirebaseFirestore.DocumentData,
  member: PortalMember
) {
  const isOwn = !!task.createdByMemberId && task.createdByMemberId === member.id;
  const assignedToMe =
    !!task.assigneeContactId && task.assigneeContactId === member.contactId;
  return { isOwn, assignedToMe, canComplete: isOwn || assignedToMe, canEdit: isOwn };
}

export async function requirePortalMember(
  saId: string
): Promise<PortalMember | NextResponse> {
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!member.contactId) {
    return NextResponse.json(
      { error: "Your account isn't fully set up yet — contact us for help." },
      { status: 409 }
    );
  }
  return member;
}

/** Loads a project the member may act on and that uses tasks. */
export async function requirePortalTaskProject(
  saId: string,
  projectId: string,
  member: PortalMember
): Promise<Project | NextResponse> {
  const snap = await getAdminDb().doc(`projects/${projectId}`).get();
  const project = snap.exists
    ? ({ id: snap.id, ...snap.data() } as Project)
    : null;
  if (
    !project ||
    project.subAccountId !== saId ||
    !canActOnProject(project, { memberId: member.id, contactId: member.contactId ?? null })
  ) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.taskModel !== "tasks") {
    return NextResponse.json(
      { error: "This project uses its checklist." },
      { status: 400 }
    );
  }
  return project;
}

/** Loads a task the member may SEE (visibility + project ownership). 404 otherwise — never reveals internal tasks. */
export async function requirePortalTask(
  saId: string,
  taskId: string
): Promise<
  | { member: PortalMember; task: FirebaseFirestore.DocumentData; project: Project }
  | NextResponse
> {
  const member = await requirePortalMember(saId);
  if (member instanceof NextResponse) return member;
  const db = getAdminDb();
  const snap = await db.doc(`tasks/${taskId}`).get();
  const task = snap.data();
  const notFound = NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!task || task.subAccountId !== saId || !task.projectId) return notFound;
  if (task.visibility === "internal") return notFound;
  if (task.parentTaskId) {
    const parent = (await db.doc(`tasks/${task.parentTaskId}`).get()).data();
    if (!parent || parent.visibility === "internal") return notFound;
  }
  const project = await requirePortalTaskProject(saId, task.projectId, member);
  if (project instanceof NextResponse) return notFound;
  return { member, task, project };
}

/** Portal data for one task-based project: visible tasks, milestones, and the client's own time. */
export async function loadPortalTaskProject(
  project: Project,
  member: PortalMember
): Promise<{
  tasks: PortalTaskView[];
  milestones: PortalMilestoneView[];
  myTimeSeconds: number;
}> {
  const db = getAdminDb();
  const [tasksSnap, entriesSnap] = await Promise.all([
    db
      .collection("tasks")
      .where("subAccountId", "==", project.subAccountId)
      .where("projectId", "==", project.id)
      .get(),
    db
      .collection("timeEntries")
      .where("actorKey", "==", actorKeyOf({ kind: "client", memberId: member.id, contactId: member.contactId ?? null }))
      .get(),
  ]);
  const myTime = new Map<string, number>();
  for (const e of entriesSnap.docs) {
    const d = e.data();
    if (d.deleted || d.projectId !== project.id) continue;
    myTime.set(d.taskId, (myTime.get(d.taskId) ?? 0) + (d.durationSeconds ?? 0));
  }
  const internalIds = new Set(
    tasksSnap.docs.filter((d) => d.data().visibility === "internal").map((d) => d.id)
  );
  const tasks = tasksSnap.docs
    .filter((d) => {
      const t = d.data();
      if (t.visibility === "internal") return false;
      if (t.parentTaskId && internalIds.has(t.parentTaskId)) return false;
      return true;
    })
    .map((d) => {
      const t = d.data();
      const perms = portalPermissions(t, member);
      return {
        id: d.id,
        title: t.title ?? "",
        description: t.notes ?? "",
        dueAt: iso(t.dueAt),
        priority: t.priority ?? null,
        status: t.completed ? "completed" : t.status && t.status !== "completed" ? t.status : "todo",
        completed: t.completed === true,
        parentTaskId: t.parentTaskId ?? null,
        checklist: Array.isArray(t.checklist) ? t.checklist : [],
        ...perms,
        myTimeSeconds: myTime.get(d.id) ?? 0,
        _sort: (t.order as number | undefined) ?? 0,
        _created: iso(t.createdAt) ?? "",
      };
    })
    .sort((a, b) => a._sort - b._sort || a._created.localeCompare(b._created))
    .map(({ _sort, _created, ...rest }) => {
      void _sort;
      void _created;
      return rest;
    });
  const milestones = (Array.isArray(project.milestones) ? project.milestones : []).map(
    (m) => ({
      id: m.id,
      title: m.title,
      dueAt: iso(m.dueAt),
      completed: !!m.completedAt,
    })
  );
  return {
    tasks,
    milestones,
    myTimeSeconds: [...myTime.values()].reduce((a, b) => a + b, 0),
  };
}

export async function portalActiveTimer(
  member: PortalMember
): Promise<ActiveTimerView | null> {
  return getActiveTimer({ kind: "client", memberId: member.id, contactId: member.contactId ?? null });
}
