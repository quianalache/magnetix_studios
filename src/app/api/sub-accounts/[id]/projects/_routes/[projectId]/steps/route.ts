import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { addStep, getProject } from "@/lib/server/project-service";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: subAccountId, projectId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await getProject(projectId);
  if (!project || project.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: { title?: string };
  try {
    body = (await request.json()) as { title?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = (body.title ?? "").trim().slice(0, 300);
  if (!title) {
    return NextResponse.json({ error: "Step title is required" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const step = await addStep(projectId, {
    agencyId,
    subAccountId,
    title,
    createdByUid: access.uid,
    createdByMemberId: null,
  });
  return NextResponse.json({ ok: true, step }, { status: 201 });
}
