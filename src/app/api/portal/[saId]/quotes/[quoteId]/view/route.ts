import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentMember } from "@/lib/community/member-session";
import { buildQuoteUrl, issueQuoteToken } from "@/lib/quotes/token";
import type { Quote } from "@/types/quotes";

export const dynamic = "force-dynamic";

/**
 * Mint a fresh public-share token for one of the signed-in portal member's
 * own quotes/invoices and redirect to it — same mechanism the operator's
 * "send" action uses (`issueQuoteToken` + persisting the hash), just
 * triggered by the client themselves instead of an outbound email. Scoped
 * to `quote.contactId === member.contactId` so a member can never mint a
 * link for someone else's document.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ saId: string; quoteId: string }> },
) {
  const { saId, quoteId } = await params;

  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const db = getAdminDb();
  const ref = db.doc(`quotes/${quoteId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const quote = snap.data() as Omit<Quote, "id">;
  if (quote.subAccountId !== saId || quote.contactId !== member.contactId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let token: string;
  let hash: string;
  try {
    ({ token, hash } = issueQuoteToken(quoteId));
  } catch (err) {
    console.error("[portal/quotes/view] issueQuoteToken failed", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  await ref.set({ publicTokenHash: hash }, { merge: true });

  const publicUrl = buildQuoteUrl(token);
  if (!publicUrl) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  return NextResponse.redirect(publicUrl);
}
