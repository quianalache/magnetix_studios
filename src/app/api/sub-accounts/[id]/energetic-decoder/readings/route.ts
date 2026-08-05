import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  createEnergeticDecoderReading,
  listReadingsForSubAccount,
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

  const readings = await listReadingsForSubAccount(subAccountId);
  return NextResponse.json({ ok: true, readings });
}
