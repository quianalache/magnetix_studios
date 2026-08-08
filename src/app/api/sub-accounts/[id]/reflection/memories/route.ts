import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listMemories, createMemory } from "@/lib/server/reflection-service";
import { listProjectsForSubAccount } from "@/lib/server/project-service";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const [memories, projects] = await Promise.all([
    listMemories(subAccountId),
    listProjectsForSubAccount(subAccountId, "active"),
  ]);
  return NextResponse.json({
    ok: true,
    memories,
    projects: projects.map((p) => ({ id: p.id, title: p.title })),
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayStr();
  const reflection = typeof body.reflection === "string" ? body.reflection.slice(0, 4000) : "";
  const linkedProjectId = typeof body.linkedProjectId === "string" && body.linkedProjectId ? body.linkedProjectId : null;

  const memory = await createMemory({
    agencyId: access.agencyId ?? "",
    subAccountId,
    title,
    date,
    reflection,
    linkedProjectId,
  });
  return NextResponse.json({ ok: true, memory });
}
