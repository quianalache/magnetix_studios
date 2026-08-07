import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteAffiliateLink, updateAffiliateLink, type AffiliateLinkInput } from "@/lib/server/asset-service";

const STRING_FIELDS: (keyof AffiliateLinkInput)[] = [
  "programName",
  "companyName",
  "description",
  "category",
  "affiliateLink",
  "publicLandingLink",
  "loginDashboardLink",
  "notes",
  "commissionType",
  "payoutStructure",
  "payoutPlatform",
  "payoutFrequency",
  "cookieWindow",
  "paymentNotes",
  "wherePromoted",
  "bestFitAudience",
  "promoNotes",
  "contentIdeas",
];
const NUMBER_FIELDS: (keyof AffiliateLinkInput)[] = ["commissionAmount", "payoutThreshold"];

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id: subAccountId, linkId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AffiliateLinkInput> = {};
  for (const key of STRING_FIELDS) {
    if (typeof body[key] === "string") (patch as Record<string, unknown>)[key] = (body[key] as string).trim().slice(0, 5000);
  }
  for (const key of NUMBER_FIELDS) {
    if (key in body) {
      (patch as Record<string, unknown>)[key] =
        typeof body[key] === "number" && Number.isFinite(body[key]) ? body[key] : null;
    }
  }
  if (body.status === "active" || body.status === "inactive" || body.status === "archived") {
    patch.status = body.status;
  }

  await updateAffiliateLink(linkId, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id: subAccountId, linkId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteAffiliateLink(linkId);
  return NextResponse.json({ ok: true });
}
