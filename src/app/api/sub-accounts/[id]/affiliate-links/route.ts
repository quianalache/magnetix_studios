import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createAffiliateLink, listAffiliateLinks, type AffiliateLinkInput } from "@/lib/server/asset-service";
import { AssetsInputError, parseAffiliateInput } from "@/lib/server/assets/inputs";
import { tenantOf } from "@/lib/server/assets/media-library-service";
import { isoOf, memberNames } from "@/lib/server/assets/people";

/** Affiliate Library — EXTERNAL programs the owner promotes (not Magnetix's own affiliate program). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const links = await listAffiliateLinks(subAccountId);
  const names = await memberNames(subAccountId, links.map((l) => l.updatedByUid ?? l.createdByUid));
  return NextResponse.json({
    ok: true,
    links: links.map((l) => ({
      ...l,
      createdAt: isoOf(l.createdAt),
      updatedAt: isoOf(l.updatedAt),
      updatedByName: names.get((l.updatedByUid ?? l.createdByUid) as string) ?? null,
    })),
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
  try {
    const input = parseAffiliateInput(body, "create") as AffiliateLinkInput;
    const tenant = await tenantOf(subAccountId);
    const link = await createAffiliateLink(tenant.agencyId || access.agencyId || "", subAccountId, input, access.uid);
    return NextResponse.json({ ok: true, link }, { status: 201 });
  } catch (err) {
    if (err instanceof AssetsInputError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
