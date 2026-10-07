import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  createEnergeticDecoderReading,
  listReadingsForSubAccount,
  listReadingsForProfile,
} from "@/lib/server/energetic-decoder-service";
import type { EnergeticDecoderRequest } from "@/types/energetic-decoder";

/**
 * The real "save a client chart" path — calculates AND persists, matching
 * or creating a Contact by email. Separate from the calculate/ endpoint,
 * which stays a pure preview with no side effects.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (!access.agencyId) {
    return NextResponse.json({ error: "No agency on this account" }, { status: 500 });
  }

  let body: EnergeticDecoderRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await createEnergeticDecoderReading({
    ...body,
    subAccountId,
    agencyId: access.agencyId,
    createdByUid: access.uid,
    // After the body spread, so a request can never set its own origin.
    origin: "staff",
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  // `?profileId=` — every reading of one Profile (the Reading workspace).
  // Without it, the original newest-50 list, kept for existing callers.
  const profileId = new URL(request.url).searchParams.get("profileId");
  const readings = profileId
    ? await listReadingsForProfile(subAccountId, profileId)
    : await listReadingsForSubAccount(subAccountId);
  return NextResponse.json({ ok: true, readings });
}
