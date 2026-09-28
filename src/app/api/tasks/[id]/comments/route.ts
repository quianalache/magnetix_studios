import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireTaskAccess } from "@/lib/server/project-tasks-service";
import { actorName } from "@/lib/server/task-graph-service";
import { readJson } from "@/lib/server/task-route-helpers";

/**
 * Task comments (Task Detail → Comments). Staff-only: comments are the
 * business's internal discussion and are never shown in the Client Portal.
 * Stored in the server-only `taskComments` collection.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guard = await requireTaskAccess(request, id);
  if (guard instanceof NextResponse) return guard;
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 5000) : "";
  if (!text) return NextResponse.json({ error: "Write a comment first." }, { status: 400 });
  const { task, access } = guard;
  const ref = await getAdminDb().collection("taskComments").add({
    subAccountId: task.subAccountId,
    agencyId: task.agencyId,
    taskId: id,
    projectId: task.projectId ?? null,
    authorUid: access.uid,
    authorName: await actorName(task.subAccountId, { kind: "staff", uid: access.uid }),
    body: text,
    createdAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id }, { status: 201 });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const guard = await requireTaskAccess(request, id);
  if (guard instanceof NextResponse) return guard;
  const commentId = new URL(request.url).searchParams.get("commentId") ?? "";
  const ref = getAdminDb().doc(`taskComments/${commentId}`);
  const snap = commentId ? await ref.get() : null;
  if (!snap?.exists || snap.data()?.taskId !== id) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (snap.data()?.authorUid !== guard.access.uid) {
    return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
