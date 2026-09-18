import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AgencyCommunicationSendDoc } from "@/types/agency-communications";

export const dynamic = "force-dynamic";

/** Owner-only: per-recipient delivery status rows for one communication. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const snap = await getAdminDb().collection(`agencies/${caller.agencyId}/communications/${id}/sends`).get();
  const sends = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AgencyCommunicationSendDoc, "id">) }));
  sends.sort((a, b) => {
    const order: Record<AgencyCommunicationSendDoc["status"], number> = { failed: 0, queued: 1, sent: 2, skipped: 3 };
    const o = order[a.status] - order[b.status];
    if (o !== 0) return o;
    return a.recipientName.localeCompare(b.recipientName);
  });
  return NextResponse.json({ ok: true, sends });
}
