import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listNotes, createNote } from "@/lib/server/reflection-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const notes = await listNotes(subAccountId);
  return NextResponse.json({ ok: true, notes });
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

  const content = typeof body.content === "string" ? body.content.slice(0, 8000) : "";
  const plain = content.replace(/<[^>]*>?/gm, "").trim();
  if (!plain) return NextResponse.json({ error: "Note content is required" }, { status: 400 });

  // Real behavior from the source app: title auto-derives from the first
  // line (truncated to 40 chars), not a separate field the user fills in.
  const firstLine = plain.split("\n")[0];
  const title = firstLine.length > 40 ? `${firstLine.slice(0, 40)}...` : firstLine || "Quick Note";
  const category = typeof body.category === "string" && body.category ? body.category.slice(0, 60) : "General";

  const note = await createNote({
    agencyId: access.agencyId ?? "",
    subAccountId,
    title,
    content,
    category,
  });
  return NextResponse.json({ ok: true, note });
}
