import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listResolvedChartContent } from "@/lib/server/energetic-decoder-chart-content-service";

/** Every Human Design + Astrology content item, resolved (override or default) — powers the Content tab's HD/Astrology editors, same role gate-content/route.ts plays for Gene Keys. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const items = await listResolvedChartContent(subAccountId);
  return NextResponse.json({ ok: true, items });
}
