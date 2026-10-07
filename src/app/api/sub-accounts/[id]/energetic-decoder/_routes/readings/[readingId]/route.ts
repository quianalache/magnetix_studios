import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteEnergeticDecoderReading, getReadingById } from "@/lib/server/energetic-decoder-service";

/** Readings library (2026-10-07) — one reading, for the Reading workspace (tenancy-checked; another sub-account's id reads as 404). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; readingId: string }> },
) {
  const { id: subAccountId, readingId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const reading = await getReadingById(subAccountId, readingId);
  if (!reading) return NextResponse.json({ error: "Reading not found" }, { status: 404 });
  return NextResponse.json({ ok: true, reading });
}

/**
 * Phase 3 Task 6 (2026-08-13) — safe Reading deletion. Blocks (409) with a
 * plain-language reason when the Reading still has GeneratedReports
 * attached; deletes only the Reading doc otherwise. No cascade, Profile
 * and Contact untouched either way.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; readingId: string }> },
) {
  const { id: subAccountId, readingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const result = await deleteEnergeticDecoderReading(subAccountId, readingId);
  if ("error" in result) {
    const status = result.generatedReportCount > 0 ? 409 : 404;
    return NextResponse.json(
      { error: result.error, generatedReportCount: result.generatedReportCount },
      { status },
    );
  }
  return NextResponse.json({ ok: true, readingId });
}
