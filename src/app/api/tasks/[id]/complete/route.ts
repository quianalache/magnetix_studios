import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { setTaskCompletedServerSide } from "@/lib/server/tasks-service";
import { requireTaskAccess } from "@/lib/server/project-tasks-service";
import { isRoutineTaskId } from "@/lib/server/task-ref";
import { materializeRoutineTaskById, routineForTaskId } from "@/lib/server/routines-service";

/**
 * Toggle a task's completed flag server-side so `task.completed` fires (on
 * the false→true edge) and the contact's task_completed activity is written.
 * Body: { completed: boolean }.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // Routine activities live in routineTasks and are private to their
  // routine's audience — checked by requireTaskAccess. Ordinary tasks keep
  // the original lookup below, unchanged.
  const routine = isRoutineTaskId(id);
  if (routine) {
    const candidate = await routineForTaskId(id);
    if (candidate) {
      const member = await requireSubAccountMember(request, candidate.subAccountId);
      if (!(member instanceof NextResponse)) await materializeRoutineTaskById(id, member.uid);
    }
  }
  let data: FirebaseFirestore.DocumentData;
  let access: Awaited<ReturnType<typeof requireSubAccountMember>>;
  if (routine) {
    const guard = await requireTaskAccess(request, id);
    if (guard instanceof NextResponse) return guard;
    data = guard.task;
    access = guard.access;
  } else {
    const db = getAdminDb();
    const snap = await db.doc(`tasks/${id}`).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    data = snap.data()!;
    access = await requireSubAccountMember(request, data.subAccountId);
    if (access instanceof NextResponse) return access;
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.completed !== "boolean") {
    return NextResponse.json(
      { error: "`completed` must be a boolean" },
      { status: 400 },
    );
  }

  const result = await setTaskCompletedServerSide({
    taskId: id,
    completed: body.completed,
    userId: access.uid,
    mode: (data.mode as "live" | "test") ?? "live",
    actor: { kind: "staff", uid: access.uid },
    allowRoutineTask: routine,
  });
  if (!result) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  // `warnings` (Phase 2): unfinished prerequisites. Informational only —
  // dependencies never block completion.
  return NextResponse.json({ task: result.task, warnings: result.warnings });
}
