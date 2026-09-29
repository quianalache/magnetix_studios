import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listResolvedGateContent } from "@/lib/server/energetic-decoder-gate-content-service";

/** All 64 gates, resolved (override or default) — powers the Reports tab's per-gate editor list. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const gates = await listResolvedGateContent(subAccountId);
  return NextResponse.json({ ok: true, gates });
}
