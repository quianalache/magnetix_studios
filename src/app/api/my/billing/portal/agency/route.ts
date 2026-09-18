import "server-only";

import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/server/person-session";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { getAuthEmailOrigin } from "@/lib/server/app-origin";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";

export const dynamic = "force-dynamic";

/**
 * Stripe Billing Portal session for an Agency Standalone Course / Course
 * Offer subscription — the agency-scope sibling of /api/my/billing/portal.
 * That route re-derives ownership via `subscriptionBelongsToMembership`
 * (tenant Contact-matching) against an `externalSubscriptions/{id}` doc —
 * neither exists for an agency purchase (see agency-mymagnetix-billing-
 * service.ts's own doc comment for why agency purchases were never
 * written into that ledger). This route does the equivalent job directly
 * against the real Agency purchase record instead:
 *
 *   - `subscriptionId` here is NOT a real Stripe id — it's the synthetic
 *     `agency-course:{courseId}:{purchaseId}` / `agency-offer:{offerId}:
 *     {purchaseId}` id agency-mymagnetix-billing-service.ts assigns each
 *     row, carrying just enough path info to re-resolve the purchase doc
 *     server-side. `ManageSubscriptionButton` never parses it — it's
 *     opaque to the client and only ever echoed back verbatim.
 *   - Ownership: the purchase doc's own `memberId` must equal the
 *     signed-in Person's id. No client-supplied purchaseId/subscriptionId
 *     is trusted without this check.
 *   - Stripe account/environment: `getStripeServer()` with no override —
 *     the SAME call every other agency Stripe operation in this codebase
 *     uses. Agency checkout never uses Stripe Connect and has exactly one
 *     environment (whichever STRIPE_SECRET_KEY this deployment runs),
 *     so there is no "wrong account" or "wrong environment" state
 *     possible here, unlike tenant's per-sub-account Connect routing.
 */

interface ParsedSubscriptionId {
  kind: "course" | "offer";
  parentId: string;
  purchaseId: string;
}

function parseSubscriptionId(raw: string): ParsedSubscriptionId | null {
  const parts = raw.split(":");
  if (parts.length !== 3) return null;
  const [prefix, parentId, purchaseId] = parts;
  if (!parentId || !purchaseId) return null;
  if (prefix === "agency-course") return { kind: "course", parentId, purchaseId };
  if (prefix === "agency-offer") return { kind: "offer", parentId, purchaseId };
  return null;
}

export async function POST(request: Request) {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json({ error: "Please sign in to manage subscriptions." }, { status: 401 });
  }

  let body: { subscriptionId?: unknown };
  try {
    body = (await request.json()) as { subscriptionId?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.subscriptionId !== "string" || !body.subscriptionId.trim()) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 400 });
  }
  const parsed = parseSubscriptionId(body.subscriptionId.trim());
  if (!parsed) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  const purchasePath =
    parsed.kind === "course"
      ? `agencies/${agencyId}/standaloneCourses/${parsed.parentId}/purchases/${parsed.purchaseId}`
      : `agencies/${agencyId}/courseOffers/${parsed.parentId}/purchases/${parsed.purchaseId}`;
  const purchaseSnap = await getAdminDb().doc(purchasePath).get();
  if (!purchaseSnap.exists) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }
  const purchase = purchaseSnap.data() as {
    memberId?: string;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
  };

  // Re-derived server-side — never trust the client on this.
  if (!purchase.memberId || purchase.memberId !== person.id) {
    return NextResponse.json({ error: "This subscription is not available for management." }, { status: 403 });
  }
  if (!purchase.stripeSubscriptionId || !purchase.stripeCustomerId) {
    return NextResponse.json({ error: "This subscription is not available for management." }, { status: 409 });
  }

  const stripe = getStripeServer();
  try {
    const subscription = await stripe.subscriptions.retrieve(purchase.stripeSubscriptionId);
    if (subscription.status === "canceled") {
      return NextResponse.json({ error: "This subscription is not available for management." }, { status: 409 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: purchase.stripeCustomerId,
      return_url: `${getAuthEmailOrigin()}/my/purchases`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const candidate = error as { code?: string; statusCode?: number };
    if (candidate.code === "resource_missing" || candidate.statusCode === 404) {
      return NextResponse.json(
        { error: "This billing profile is no longer available. Please contact the business for help." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Subscription management is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
