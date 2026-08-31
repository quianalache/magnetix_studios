import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { normalizeAttribution } from "@/lib/attribution";
import {
  BillingError,
  createPlatformSignupCheckoutSession,
} from "@/lib/server/billing-service";
import type { BillingInterval } from "@/types/billing";
import type { ContactAttribution } from "@/types/contacts";

/**
 * Public Magnetix SaaS Signup — checkout-session creation. Reachable
 * without a session (listed under "/api/checkout" in middleware.ts's
 * PUBLIC_PATHS, same prefix `/api/checkout/founders` already used).
 *
 * Every billing-relevant value (agencyId, the plan, its real Stripe price)
 * is resolved SERVER-SIDE from `planSlug` alone via
 * `createPlatformSignupCheckoutSession` → `resolvePublicPlan` — the request
 * body can supply a slug, cadence, and the buyer's own contact details, but
 * never a price, a Stripe price id, or an agency id. A tampered request can
 * at worst buy the same plan at its real price; it can never buy an
 * archived/private plan or set its own amount.
 *
 * Attribution (2026-08-31, Agency Acquisition Foundation): the request body
 * now carries the SAME `ContactAttribution` shape every other public page
 * forwards (via `readAttributionFromBrowser()` on the client — see
 * `plan-signup-form.tsx`), normalized server-side through the SAME
 * `normalizeAttribution()` every Forms/Booking/Course-Offer submission
 * already goes through — not a narrower one-off shape. See the Sales &
 * Affiliate Infrastructure audit, Part 4/8.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_REFERRAL_CODE_LEN = 80;

interface RequestBody {
  planSlug?: string;
  interval?: string;
  email?: string;
  businessName?: string;
  attribution?: Partial<ContactAttribution> | null;
  /** Foundation for future affiliate-referral attribution — stored, not
   *  used for any commission calculation in this task. */
  referralCode?: string | null;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planSlug = body.planSlug?.trim();
  if (!planSlug) {
    return NextResponse.json({ error: "planSlug is required." }, { status: 400 });
  }

  const interval: BillingInterval = body.interval === "year" ? "year" : "month";
  if (body.interval !== undefined && body.interval !== "month" && body.interval !== "year") {
    return NextResponse.json(
      { error: 'interval must be "month" or "year".' },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }

  const businessName = body.businessName?.trim() ?? "";
  if (!businessName || businessName.length > 120) {
    return NextResponse.json(
      { error: "Business / workspace name is required (1–120 characters)." },
      { status: 400 },
    );
  }

  const attribution = normalizeAttribution(body.attribution ?? undefined);
  const referralCode =
    typeof body.referralCode === "string" && body.referralCode.trim()
      ? body.referralCode.trim().slice(0, MAX_REFERRAL_CODE_LEN)
      : null;

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { error: "Signup isn't available on this deployment." },
      { status: 503 },
    );
  }

  try {
    const { url } = await createPlatformSignupCheckoutSession({
      agencyId,
      planSlug,
      interval,
      buyerEmail: email,
      businessName,
      attribution,
      referralCode,
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/checkout/platform-signup] failed", err);
    return NextResponse.json(
      { error: "Something went wrong starting checkout. Please try again." },
      { status: 500 },
    );
  }
}
