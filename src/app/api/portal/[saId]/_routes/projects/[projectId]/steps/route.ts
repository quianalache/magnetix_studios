import "server-only";

import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/community/member-session";
import { addStep, canActOnProject, getProject } from "@/lib/server/project-service";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ saId: string; projectId: string }> },
) {
  const { saId, projectId } = await ctx.params;
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

  const step = await addStep(projectId, {
    agencyId: project.agencyId,
    subAccountId: saId,
    title,
    createdByUid: null,
    createdByMemberId: member.id,
  });
  return NextResponse.json({ ok: true, step }, { status: 201 });
}
