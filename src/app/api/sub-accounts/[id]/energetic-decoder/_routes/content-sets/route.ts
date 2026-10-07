import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createContentSet, listContentSets } from "@/lib/server/content-set-service";
import { contentSetErrorResponse } from "@/lib/server/content-set-route-helpers";

/** Content Sets (2026-10-07) — the library: Default + the workspace's own sets, each with its real Report Design usage count. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ ok: true, sets: await listContentSets(subAccountId) });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}

/** Create a set: `{ name, description?, startFrom: "default" | "blank" | <setId> }`. New sets start as Draft. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const set = await createContentSet(subAccountId, access, { name: body.name, description: body.description, startFrom: body.startFrom });
    return NextResponse.json({ ok: true, set }, { status: 201 });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}
