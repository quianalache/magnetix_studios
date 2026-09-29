import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteStep, getProject, updateStep } from "@/lib/server/project-service";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string; stepId: string }> },
) {
  const { id: subAccountId, projectId, stepId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await getProject(projectId);
  if (!project || project.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: { title?: string; done?: boolean };
  try {
    body = (await request.json()) as { title?: string; done?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await updateStep(projectId, stepId, {
    title: typeof body.title === "string" ? body.title.trim().slice(0, 300) : undefined,
    done: typeof body.done === "boolean" ? body.done : undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; projectId: string; stepId: string }> },
) {
  const { id: subAccountId, projectId, stepId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await getProject(projectId);
  if (!project || project.subAccountId !== subAccountId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await deleteStep(projectId, stepId);
  return NextResponse.json({ ok: true });
}
