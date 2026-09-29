import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listEmbedConfigs, createEmbedConfig } from "@/lib/server/embed-config-service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const embeds = await listEmbedConfigs(subAccountId);
  return NextResponse.json({ ok: true, embeds });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const name = typeof body.name === "string" ? body.name : "Untitled embed";
  const placementNote = typeof body.placementNote === "string" ? body.placementNote : "";

  const embed = await createEmbedConfig({
    agencyId: access.agencyId ?? "",
    subAccountId,
    name,
    placementNote,
  });
  return NextResponse.json({ ok: true, embed });
}
