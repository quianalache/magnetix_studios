import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { toJson } from "@/lib/server/task-serialize";

/**
 * Project Workspace → Activity for task-based projects: the recorded task
 * activity (created, completed, status / due changes, rollovers, time
 * tracked, milestones…) across the project. Only real recorded rows.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string }> }
) {
  const { id: subAccountId, projectId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const db = getAdminDb();
  const project = await db.doc(`projects/${projectId}`).get();
  if (project.data()?.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const snap = await db
    .collection("taskActivity")
    .where("projectId", "==", projectId)
    .get();
  const rows = snap.docs
    .filter((d) => d.data().subAccountId === subAccountId)
    .map((d) => ({ id: d.id, ...(toJson(d.data()) as Record<string, unknown>) }))
    .sort((a, b) =>
      String((b as { createdAt?: string }).createdAt ?? "").localeCompare(
        String((a as { createdAt?: string }).createdAt ?? "")
      )
    )
    .slice(0, 300);
  return NextResponse.json({ activity: rows });
}
