import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { getResend } from "@/lib/comms/resend";

export const dynamic = "force-dynamic";

/**
 * Staff-only diagnostic read for one notification's email-delivery record
 * (status/provider/providerMessageId/failureReason) — admin-gated, no
 * customer-facing surface, not part of the notification-email product
 * itself. Exists for ops/support visibility (e.g. "why didn't this
 * customer get an email") and for confirming delivery in QA.
 *
 * `?includeContent=1` additionally fetches the actual sent subject/html/text
 * back from Resend via the stored `providerMessageId` — used to visually
 * inspect a real send during QA without needing the recipient's own inbox.
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

  const includeContent = new URL(request.url).searchParams.get("includeContent") === "1";
  let content: { subject?: string; html?: string; text?: string } | null = null;
  if (includeContent && data?.providerMessageId) {
    try {
      const result = await getResend().emails.get(data.providerMessageId as string);
      if (result.data) {
        content = { subject: result.data.subject, html: result.data.html ?? undefined, text: result.data.text ?? undefined };
      }
    } catch (err) {
      console.warn("[notification-email-deliveries] Resend content fetch failed", err);
    }
  }

  return NextResponse.json({ ok: true, delivery: { id: snap.id, ...data }, content });
}
