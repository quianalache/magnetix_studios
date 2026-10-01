import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isRoutineTaskId, taskDocRef } from "@/lib/server/task-ref";
import {
  deleteFullTask,
  requireTaskAccess,
  updateFullTask,
} from "@/lib/server/project-tasks-service";
import {
  materializeRoutineTaskById,
  routineForTaskId,
} from "@/lib/server/routines-service";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { taskJson, toJson } from "@/lib/server/task-serialize";
import { readJson, taskErrorResponse } from "@/lib/server/task-route-helpers";
import {
  actorKeyOf,
  getActiveTimer,
  listEntriesForTask,
} from "@/lib/server/time-tracking-service";

/**
 * Task Detail (Projects & Tasks Phase 2).
 * GET    → everything the Task Detail modal needs in one round trip.
 * PATCH  → partial edit through the shared service (history + activity).
 * DELETE → removes the task + its subtasks and unlinks connections.
 * Staff only; the Client Portal has its own narrower routes.
 */

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  // Future routine rows are projected in My Tasks and are materialized only
  // when opened, preserving the server-only collection and avoiding placeholder writes.
  if (isRoutineTaskId(id)) {
    const candidate = await routineForTaskId(id);
    if (candidate) {
      const member = await requireSubAccountMember(request, candidate.subAccountId);
      if (!(member instanceof NextResponse)) await materializeRoutineTaskById(id, member.uid);
    }
  }
  const guard = await requireTaskAccess(request, id);
  if (guard instanceof NextResponse) return guard;
  const { access, task } = guard;
  const db = getAdminDb();
  const sa = task.subAccountId as string;

  const idsToLoad = [
    ...((task.dependsOnTaskIds as string[] | undefined) ?? []),
    ...((task.relatedTaskIds as string[] | undefined) ?? []),
    ...(task.parentTaskId ? [task.parentTaskId as string] : []),
  ];
  const [
    projectSnap,
    subtasksSnap,
    linkedSnaps,
    dependentsSnap,
    activitySnap,
    commentsSnap,
    contactSnap,
    dealSnap,
    membersSnap,
  ] = await Promise.all([
    task.projectId ? db.doc(`projects/${task.projectId}`).get() : null,
    db.collection("tasks").where("subAccountId", "==", sa).where("parentTaskId", "==", id).get(),
    idsToLoad.length ? db.getAll(...idsToLoad.map((x) => taskDocRef(x))) : [],
    db.collection("tasks").where("subAccountId", "==", sa).where("dependsOnTaskIds", "array-contains", id).get(),
    db.collection("taskActivity").where("taskId", "==", id).get(),
    db.collection("taskComments").where("taskId", "==", id).get(),
    task.contactId ? db.doc(`contacts/${task.contactId}`).get() : null,
    task.dealId ? db.doc(`deals/${task.dealId}`).get() : null,
    db.collection(`subAccounts/${sa}/subAccountMembers`).get(),
  ]);

  const linked = new Map(
    linkedSnaps
      .filter((s) => s.exists && s.data()?.subAccountId === sa)
      .map((s) => [s.id, { id: s.id, title: s.data()!.title ?? "", completed: s.data()!.completed === true }])
  );
  const pick = (ids: unknown) =>
    ((ids as string[] | undefined) ?? []).map((x) => linked.get(x)).filter(Boolean);

  const project = projectSnap?.data();
  const viewerKey = actorKeyOf({ kind: "staff", uid: access.uid });

  return NextResponse.json({
    task: taskJson(id, task),
    project:
      project && project.subAccountId === sa
        ? {
            id: projectSnap!.id,
            title: project.title,
            taskModel: project.taskModel ?? "steps",
            status: project.status,
            assignedContactId: project.assignedContactId ?? null,
            assignedContactName: project.assignedContactName ?? null,
          }
        : null,
    parent: task.parentTaskId ? linked.get(task.parentTaskId as string) ?? null : null,
    subtasks: subtasksSnap.docs
      .map((d) => taskJson(d.id, d.data()))
      .sort((a, b) =>
        String((a as { createdAt?: string }).createdAt ?? "").localeCompare(
          String((b as { createdAt?: string }).createdAt ?? "")
        )
      ),
    dependsOn: pick(task.dependsOnTaskIds),
    related: pick(task.relatedTaskIds),
    dependents: dependentsSnap.docs.map((d) => ({
      id: d.id,
      title: d.data().title ?? "",
      completed: d.data().completed === true,
    })),
    contact:
      contactSnap?.exists && contactSnap.data()?.subAccountId === sa
        ? { id: contactSnap.id, name: contactSnap.data()?.name ?? contactSnap.data()?.email ?? "Contact" }
        : null,
    deal:
      dealSnap?.exists && dealSnap.data()?.subAccountId === sa
        ? { id: dealSnap.id, title: dealSnap.data()?.title ?? dealSnap.data()?.name ?? "Deal" }
        : null,
    activity: activitySnap.docs
      .map((d) => ({ id: d.id, ...(toJson(d.data()) as Record<string, unknown>) }))
      .sort((a, b) =>
        String((b as { createdAt?: string }).createdAt ?? "").localeCompare(
          String((a as { createdAt?: string }).createdAt ?? "")
        )
      )
      .slice(0, 200),
    comments: commentsSnap.docs
      .filter((d) => d.data().subAccountId === sa)
      .map((d) => ({
        id: d.id,
        body: d.data().body ?? "",
        authorName: d.data().authorName ?? "",
        authorUid: d.data().authorUid ?? null,
        mine: d.data().authorUid === access.uid,
        createdAt: toJson(d.data().createdAt),
      }))
      .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))),
    time: {
      entries: await listEntriesForTask({ taskId: id, subAccountId: sa, viewerKey }),
      activeTimer: await getActiveTimer({ kind: "staff", uid: access.uid }),
    },
    assignees: membersSnap.docs
      .filter((d) => d.data().status !== "removed")
      .map((d) => ({
        uid: d.id,
        name: (d.data().displayName as string) || (d.data().email as string) || "Team member",
      })),
    viewer: { uid: access.uid },
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (isRoutineTaskId(id)) {
    const candidate = await routineForTaskId(id);
    if (candidate) {
      const member = await requireSubAccountMember(request, candidate.subAccountId);
      if (!(member instanceof NextResponse)) await materializeRoutineTaskById(id, member.uid);
    }
  }
  const guard = await requireTaskAccess(request, id);
  if (guard instanceof NextResponse) return guard;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  try {
    const { warnings } = await updateFullTask({
      taskId: id,
      task: guard.task,
      actor: { kind: "staff", uid: guard.access.uid },
      patch: body,
    });
    const fresh = await guard.ref.get();
    return NextResponse.json({ task: taskJson(id, fresh.data()!), warnings });
  } catch (err) {
    return taskErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guard = await requireTaskAccess(request, id);
  if (guard instanceof NextResponse) return guard;
  try {
    await deleteFullTask({
      taskId: id,
      task: guard.task,
      actor: { kind: "staff", uid: guard.access.uid },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return taskErrorResponse(err);
  }
}
