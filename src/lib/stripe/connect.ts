import "server-only";

import crypto from "node:crypto";
import type Stripe from "stripe";
import { getStripeServer } from "@/lib/stripe/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Stripe Connect (Standard, OAuth) — lets each sub-account link their OWN
 * Stripe account so Course Offer / Standalone Course checkout can charge
 * directly on THEIR account instead of the shared platform one. Mirrors
 * lib/google-calendar/client.ts's shape: HMAC-signed state (reuses
 * AUTOMATIONS_TOKEN_SECRET, same pattern as Meta + Google Calendar), one
 * shared callback for the whole deployment.
 *
 * Everything here is INERT unless STRIPE_CONNECT_CLIENT_ID is set — that's
 * a Connect application's client id (starts "ca_..."), a DIFFERENT value
 * from STRIPE_SECRET_KEY, obtained from the Stripe Dashboard's Connect
 * settings (Settings -> Connect -> OAuth settings). Requires Connect to be
 * turned on for the platform account first.
 */

const OAUTH_AUTHORIZE_URL = "https://connect.stripe.com/oauth/authorize";

export function stripeConnectAppConfigured(): boolean {
  return !!process.env.STRIPE_CONNECT_CLIENT_ID?.trim();
}

/**
 * ONE OAuth redirect URI for the whole deployment, same reasoning as Meta's
 * and Google Calendar's callbacks — Stripe validates it against the
 * Connect application's registered redirect URI list. The connecting
 * sub-account + member travel in the signed `state` instead.
 */
export function stripeConnectRedirectUri(): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/api/stripe-connect/callback`;
}

export function buildStripeConnectOAuthUrl(opts: {
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
    scope: "read_write",
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// CSRF state — HMAC-signed with AUTOMATIONS_TOKEN_SECRET, same pattern as
// Meta's and Google Calendar's signState/verifyState.
// ---------------------------------------------------------------------------

function stateSecret(): string {
  return process.env.AUTOMATIONS_TOKEN_SECRET ?? "";
}

export function signStripeConnectState(
  subAccountId: string,
  uid: string,
  nonce: string,
): string {
  const payload = `${subAccountId}.${uid}.${nonce}`;
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(`stripeconnectstate:${payload}`)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyStripeConnectState(
  state: string,
): { subAccountId: string; uid: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [subAccountId, uid, nonce, sig] = parts;
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(`stripeconnectstate:${subAccountId}.${uid}.${nonce}`)
    .digest("hex");
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  return { subAccountId, uid };
}

// ---------------------------------------------------------------------------
// Token exchange / deauthorize
// ---------------------------------------------------------------------------

export interface StripeConnectLinkResult {
  accountId: string;
  email: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

/** Exchange the OAuth `code` for the connected account's id, then fetch its email + capability flags. */
export async function exchangeStripeConnectCode(
  code: string,
): Promise<StripeConnectLinkResult> {
  const stripe = getStripeServer();
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });
  const accountId = response.stripe_user_id;
  if (!accountId) {
    throw new Error("Stripe did not return a connected account id.");
  }
  const account = await stripe.accounts.retrieve(accountId);
  return {
    accountId,
    email: account.email ?? null,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
  };
}

/**
 * `account.updated` webhook — the OAuth callback only snapshots
 * chargesEnabled/payoutsEnabled once, at the moment a sub-account finishes
 * connecting. Stripe onboarding often isn't fully verified yet at that
 * instant (see the "still needs a bit more info" banner in
 * SubAccountStripeSection), so without this the stored flags go stale
 * forever even after the sub-account owner finishes Stripe's requirements.
 * Fires on the "Connected accounts" event destination (see webhooks/stripe
 * /route.ts's dual-secret handling) — every capability change on a
 * connected account re-syncs here.
 */
export async function handleStripeConnectAccountUpdated(
  account: Stripe.Account,
): Promise<void> {
  const snap = await getAdminDb()
    .collection("subAccounts")
    .where("stripeConnect.accountId", "==", account.id)
    .limit(1)
    .get();
  if (snap.empty) return;

  await snap.docs[0].ref.set(
    {
      stripeConnect: {
        chargesEnabled: account.charges_enabled === true,
        payoutsEnabled: account.payouts_enabled === true,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Best-effort deauthorize on disconnect — the connection doc is cleared regardless. */
export async function deauthorizeStripeConnect(
  accountId: string,
): Promise<void> {
  try {
    const stripe = getStripeServer();
    await stripe.oauth.deauthorize({
      client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
      stripe_user_id: accountId,
    });
  } catch (err) {
    console.warn("[stripe-connect] deauthorize failed", err);
  }
}
