import "server-only";

import { NextResponse } from "next/server";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  BillingError,
  createPlatformSignupCheckoutSession,
  type PlatformSignupAttribution,
} from "@/lib/server/billing-service";
import type { BillingInterval } from "@/types/billing";

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
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RequestBody {
  planSlug?: string;
  interval?: string;
  email?: string;
  businessName?: string;
  attribution?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    referrer?: string | null;
  };
}

function normalizeAttributionField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

  const attribution: PlatformSignupAttribution = {
    utmSource: normalizeAttributionField(body.attribution?.utmSource),
    utmMedium: normalizeAttributionField(body.attribution?.utmMedium),
    utmCampaign: normalizeAttributionField(body.attribution?.utmCampaign),
    utmContent: normalizeAttributionField(body.attribution?.utmContent),
    utmTerm: normalizeAttributionField(body.attribution?.utmTerm),
    referrer: normalizeAttributionField(body.attribution?.referrer),
  };

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
