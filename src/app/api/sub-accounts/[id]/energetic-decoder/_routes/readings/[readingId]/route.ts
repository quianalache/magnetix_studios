import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteEnergeticDecoderReading } from "@/lib/server/energetic-decoder-service";

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
  const access = await requireSubAccountMember(request, subAccountId);
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
