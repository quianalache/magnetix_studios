import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Staff-only diagnostic read for one notification's email-delivery record
 * (status/provider/providerMessageId/failureReason) — admin-gated, no
 * customer-facing surface, not part of the notification-email product
 * itself. Exists for ops/support visibility (e.g. "why didn't this
 * customer get an email") and for confirming delivery in QA.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; notificationId: string }> },
) {
  const { id: subAccountId, notificationId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`notificationEmailDeliveries/${notificationId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ ok: true, delivery: null });
  }
  const data = snap.data();
  if (data?.subAccountId !== subAccountId) {
    return NextResponse.json({ ok: true, delivery: null });
  }
  return NextResponse.json({ ok: true, delivery: { id: snap.id, ...data } });
}
