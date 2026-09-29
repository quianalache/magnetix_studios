import "server-only";

import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/community/member-session";
import { canActOnProject, getProject, updateProject } from "@/lib/server/project-service";

/** A member editing a project ASSIGNED TO THEM — title/description/dates only. Reassigning who it belongs to stays staff-only (the CRM route), same reasoning as Tasks never letting a portal member change ownership. */
export async function PATCH(
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parseDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const patch: Parameters<typeof updateProject>[1] = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
  if (typeof body.description === "string") {
    patch.description = body.description.trim().slice(0, 5000);
  }
  if ("startAt" in body) patch.startAt = parseDate(body.startAt);
  if ("dueAt" in body) patch.dueAt = parseDate(body.dueAt);

  await updateProject(projectId, patch);
  return NextResponse.json({ ok: true });
}
