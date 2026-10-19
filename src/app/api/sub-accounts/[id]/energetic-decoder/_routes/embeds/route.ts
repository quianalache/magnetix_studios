import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  createEmbedConfig,
  listEmbedConfigs,
  listEmbedPlacements,
} from "@/lib/server/embed-config-service";

/** Embeds list (Public Reading Tool): every Embed with where it's placed. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const [embeds, placements] = await Promise.all([listEmbedConfigs(subAccountId), listEmbedPlacements(subAccountId)]);
  return NextResponse.json({
    ok: true,
    embeds: embeds.map((e) => ({ ...e, placements: placements.get(e.id) ?? [] })),
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
    body = {};
  }
  const embed = await createEmbedConfig({
    agencyId: access.agencyId ?? "",
    subAccountId,
    name: typeof body.name === "string" ? body.name : "Untitled embed",
    placementNote: typeof body.placementNote === "string" ? body.placementNote : "",
  });
  return NextResponse.json({ ok: true, embed });
}
