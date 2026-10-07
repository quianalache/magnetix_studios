import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteContentSet, getContentSet, updateContentSetMeta } from "@/lib/server/content-set-service";
import { contentSetErrorResponse } from "@/lib/server/content-set-route-helpers";

type Ctx = { params: Promise<{ id: string; setId: string }> };

/** One set for the editor: catalog, this set's text, the Default reference text, and per-entry states. */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ ok: true, set: await getContentSet(subAccountId, setId) });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}

/** Rename / edit description / Active ⇄ Draft. Not available on Default. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    await updateContentSetMeta(subAccountId, access, setId, { name: body.name, description: body.description, status: body.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}

/** Delete — refused for Default and for any set a Report Design uses (409). */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await deleteContentSet(subAccountId, setId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return contentSetErrorResponse(err);
  }
}
