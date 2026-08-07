import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createAffiliateLink,
  listAffiliateLinks,
  type AffiliateLinkInput,
} from "@/lib/server/asset-service";
import type { AffiliateLinkStatus } from "@/types/assets";

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function parseInput(body: Record<string, unknown>): AffiliateLinkInput {
  const status: AffiliateLinkStatus =
    body.status === "inactive" || body.status === "archived" ? body.status : "active";
  return {
    programName: str(body.programName, 200),
    companyName: str(body.companyName, 200),
    description: str(body.description, 5000),
    category: str(body.category, 80),
    status,
    affiliateLink: str(body.affiliateLink, 1000),
    publicLandingLink: str(body.publicLandingLink, 1000),
    loginDashboardLink: str(body.loginDashboardLink, 1000),
    notes: str(body.notes, 5000),
    commissionType: str(body.commissionType, 80),
    commissionAmount: num(body.commissionAmount),
    payoutStructure: str(body.payoutStructure, 80),
    payoutPlatform: str(body.payoutPlatform, 80),
    payoutThreshold: num(body.payoutThreshold),
    payoutFrequency: str(body.payoutFrequency, 80),
    cookieWindow: str(body.cookieWindow, 80),
    paymentNotes: str(body.paymentNotes, 5000),
    wherePromoted: str(body.wherePromoted, 2000),
    bestFitAudience: str(body.bestFitAudience, 500),
    promoNotes: str(body.promoNotes, 5000),
    contentIdeas: str(body.contentIdeas, 5000),
  };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const links = await listAffiliateLinks(subAccountId);
  return NextResponse.json({ ok: true, links });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = parseInput(body);
  if (!input.programName || !input.affiliateLink) {
    return NextResponse.json(
      { error: "Program/Product name and the affiliate link are required" },
      { status: 400 },
    );
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const link = await createAffiliateLink(agencyId, subAccountId, input);
  return NextResponse.json({ ok: true, link }, { status: 201 });
}
