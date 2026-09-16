import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  buildStripeConnectOAuthUrl,
  signStripeConnectState,
  stripeConnectAppConfigured,
  stripeConnectRedirectUri,
} from "@/lib/stripe/connect";
import { getStripeEnvironment } from "@/lib/stripe/server";
import type { StripeEnvironment } from "@/types/tenancy";

/**
 * Kick off Stripe Connect for a sub-account — admin-only (linking a bank
 * account is a financial action, not a "any active member" one, unlike
 * Google Calendar's per-member connect).
 *
 *   GET /api/sub-accounts/[id]/stripe-connect/connect
 */

function appBase(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const settingsUrl = new URL(`/sa/${id}/dashboard/settings`, appBase(request));
  const requestedEnvironment = new URL(request.url).searchParams.get(
    "environment"
  );
  const environment: StripeEnvironment =
    requestedEnvironment === "live" || requestedEnvironment === "test"
      ? requestedEnvironment
      : getStripeEnvironment();

  if (!stripeConnectAppConfigured(environment)) {
    settingsUrl.searchParams.set("stripeconnect", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = stripeConnectRedirectUri();
  if (!redirectUri) {
    settingsUrl.searchParams.set("stripeconnect", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = signStripeConnectState(id, access.uid, nonce, environment);
  return NextResponse.redirect(
    buildStripeConnectOAuthUrl({ redirectUri, state, environment })
  );
}
