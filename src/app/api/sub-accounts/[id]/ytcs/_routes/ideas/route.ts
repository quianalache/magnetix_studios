import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createIdea, listIdeas } from "@/lib/server/ytcs-service";

/**
 * GET/POST /api/sub-accounts/[id]/ytcs/ideas — list/create Saved Ideas
 * (final completion phase). Same auth level as the video routes
 * (`requireSubAccountMember`) — a content tool every staff member uses.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const ideas = await listIdeas(subAccountId);
  return NextResponse.json({ ok: true, ideas });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { title?: string; type?: string; notes?: string; priority?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idea = await createIdea(subAccountId, {
    title: typeof body.title === "string" ? body.title.trim().slice(0, 200) : "",
    type: typeof body.type === "string" ? body.type.trim().slice(0, 100) : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    priority: typeof body.priority === "string" ? body.priority.trim().slice(0, 50) : undefined,
    status: typeof body.status === "string" ? body.status.trim().slice(0, 50) : undefined,
  });
  return NextResponse.json({ ok: true, idea });
}
