import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { territoryGateForContact } from "@/lib/auth/territory-filter";
import { markQuotePaidServerSide } from "@/lib/quotes/lifecycle";
import type { Quote } from "@/types/quotes";

export const dynamic = "force-dynamic";

/**
 * POST /api/sub-accounts/[id]/quotes/[quoteId]/mark-paid
 *
 * Manual "Mark as paid" — still the ONLY path for PayPal.me, bank
 * transfer, card swipe, cash/check, or an administrative correction.
 * For a Stripe-backed invoice, the SAME terminal state is normally
 * reached automatically by the signed Stripe webhook the moment
 * payment confirms (Phase 2, 2026-09-10) — this action remains
 * available as a manual override/supplement, not a replacement, and is
 * safe to click on an invoice Stripe already marked paid (idempotent
 * no-op, see `markQuotePaidServerSide`).
 *
 * Gates: caller must be a sub-account member with territory access to
 * this quote's contact. The actual status-transition + activity +
 * workflow-trigger + webhook + review-request logic lives in the one
 * shared `markQuotePaidServerSide` — the Stripe webhook handler goes
 * through the exact same function after its own (different) auth model
 * — so manual and automatic paid never diverge or duplicate side effects.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, quoteId } = await params;

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const quoteSnap = await db.collection("quotes").doc(quoteId).get();
  if (!quoteSnap.exists) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const quote = quoteSnap.data() as Quote;
  if (quote.subAccountId !== subAccountId) {
    return NextResponse.json(
      { error: "Quote belongs to a different sub-account" },
      { status: 403 },
    );
  }
  const gate = await territoryGateForContact(access, quote.contactId);
  if (gate) return gate;
  if (quote.status === "paid") {
    return NextResponse.json(
      { error: "Already marked paid" },
      { status: 409 },
    );
  }

  const result = await markQuotePaidServerSide(quoteId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
