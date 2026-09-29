import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteAffiliateLink, updateAffiliateLink } from "@/lib/server/asset-service";
import { AssetsInputError, parseAffiliateInput } from "@/lib/server/assets/inputs";

type Ctx = { params: Promise<{ id: string; linkId: string }> };

/** Tenant-checked: a program from another sub-account reads as not found and is never written. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, linkId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const ok = await updateAffiliateLink(subAccountId, linkId, parseAffiliateInput(body, "patch"), access.uid);
    if (!ok) return NextResponse.json({ error: "Affiliate program not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AssetsInputError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, linkId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const ok = await deleteAffiliateLink(subAccountId, linkId);
  if (!ok) return NextResponse.json({ error: "Affiliate program not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
