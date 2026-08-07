import "server-only";

import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  canActOnProject,
  deleteStep,
  getProject,
  updateStep,
} from "@/lib/server/project-service";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ saId: string; projectId: string; stepId: string }> },
) {
  const { saId, projectId, stepId } = await ctx.params;
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const project = await getProject(projectId);
  if (!project || project.subAccountId !== saId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!canActOnProject(project, { memberId: member.id, contactId: member.contactId })) {
    return NextResponse.json({ error: "Not your project" }, { status: 403 });
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
  ctx: { params: Promise<{ saId: string; projectId: string; stepId: string }> },
) {
  const { saId, projectId, stepId } = await ctx.params;
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const project = await getProject(projectId);
  if (!project || project.subAccountId !== saId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!canActOnProject(project, { memberId: member.id, contactId: member.contactId })) {
    return NextResponse.json({ error: "Not your project" }, { status: 403 });
  }

  await deleteStep(projectId, stepId);
  return NextResponse.json({ ok: true });
}
