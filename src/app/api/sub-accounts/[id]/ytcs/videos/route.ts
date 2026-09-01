import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  createVideoProject,
  listVideoProjects,
} from "@/lib/server/ytcs-service";

/**
 * GET/POST /api/sub-accounts/[id]/ytcs/videos — list/create Video
 * Workspace projects. Same auth level as Content Library
 * (`requireSubAccountMember`) — YTCS is a content tool every staff
 * member uses, not an admin-only settings surface like Business Brain.
 */

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const projects = await listVideoProjects(subAccountId);
  return NextResponse.json({ ok: true, projects });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const project = await createVideoProject(subAccountId, { name });
  return NextResponse.json({ ok: true, project });
}
