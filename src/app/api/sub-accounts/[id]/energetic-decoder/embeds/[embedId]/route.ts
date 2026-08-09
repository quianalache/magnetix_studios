import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { updateEmbedConfig, deleteEmbedConfig } from "@/lib/server/embed-config-service";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; embedId: string }> },
) {
  const { id: subAccountId, embedId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fields: Record<string, unknown> = {};
  if (typeof body.name === "string") fields.name = body.name;
  if (typeof body.placementNote === "string") fields.placementNote = body.placementNote;

  try {
    const embed = await updateEmbedConfig(subAccountId, embedId, fields);
    return NextResponse.json({ ok: true, embed });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; embedId: string }> },
) {
  const { id: subAccountId, embedId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteEmbedConfig(subAccountId, embedId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
