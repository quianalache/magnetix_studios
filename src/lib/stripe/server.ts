import "server-only";

import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  PaymentMode,
  StripeConnectAccount,
  StripeConnectConnection,
  StripeEnvironment,
} from "@/types/tenancy";

const clients = new Map<string, Stripe>();

export function getStripeEnvironment(): StripeEnvironment {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your .env.local file."
    );
  }
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  throw new Error("STRIPE_SECRET_KEY must be a Stripe test or live key.");
}

function secretKeyForEnvironment(environment: StripeEnvironment): string {
  const configured =
    process.env[
      environment === "test"
        ? "STRIPE_SECRET_KEY_TEST"
        : "STRIPE_SECRET_KEY_LIVE"
    ]?.trim();
  const key = configured || process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(`Stripe ${environment} secret key is not configured.`);
  }
  const actual = key.startsWith("sk_test_")
    ? "test"
    : key.startsWith("sk_live_")
      ? "live"
      : null;
  if (actual !== environment) {
    throw new Error(`Stripe ${environment} secret key is not configured.`);
  }
  return key;
}

export function getStripeServer(
  environment: StripeEnvironment = getStripeEnvironment()
): Stripe {
  const key = secretKeyForEnvironment(environment);
  const existing = clients.get(key);
  if (existing) return existing;
  const mock = localStripeMock(key);
  const client = mock ? new Stripe(key, mock) : new Stripe(key);
  clients.set(key, client);
  return client;
}

/**
 * LOCAL QA ONLY: send Stripe API calls to a local mock server instead of
 * Stripe, so emulator suites and local browser QA can run the real payment
 * code paths without any network call or charge. Ignored unless ALL hold:
 * `STRIPE_LOCAL_MOCK_URL` is set, the key is a TEST key, NODE_ENV isn't
 * "production" and the process isn't on Vercel — so it can never apply to a
 * deployed app or a live key.
 */
function localStripeMock(key: string): Stripe.StripeConfig | null {
  const raw = process.env.STRIPE_LOCAL_MOCK_URL?.trim();
  if (!raw || !key.startsWith("sk_test_") || process.env.NODE_ENV === "production" || process.env.VERCEL) return null;
  try {
    const url = new URL(raw);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return null;
    return { host: url.hostname, port: url.port || "80", protocol: url.protocol === "https:" ? "https" : "http", maxNetworkRetries: 0 };
  } catch {
    return null;
  }
}

export function getStripeConnectionForEnvironment(
  stripeConnect: StripeConnectAccount | null | undefined,
  environment: StripeEnvironment
): StripeConnectConnection | null {
  if (!stripeConnect) return null;
  const environmentConnection = stripeConnect[environment];
  if (environmentConnection?.accountId?.trim()) return environmentConnection;
  // Explicit compatibility path for legacy flat records. This preserves old
  // accounts until an environment can be confirmed and backfilled; it never
  // treats a flat record as two independent environment connections.
  return stripeConnect.accountId?.trim() ? stripeConnect : null;
}

/** Strict tenant payment resolver. Explicit mode never falls back to another
 * environment or to the legacy flat Connect account field. */
export async function resolveStripeForSubAccount(
  subAccountId: string,
  paymentMode: PaymentMode,
): Promise<{ environment: StripeEnvironment; accountId: string; stripe: Stripe }> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const connection = snap.data()?.stripeConnect?.[paymentMode] as
    | StripeConnectConnection
    | undefined;
  const accountId = connection?.accountId?.trim();
  if (!accountId) {
    throw new Error(
      paymentMode === "test"
        ? "Connect a Stripe test account before using Test mode."
        : "Connect your Live Stripe account before accepting real payments."
    );
  }
  return { environment: paymentMode, accountId, stripe: getStripeServer(paymentMode) };
}

/**
 * The browser (Stripe.js) publishable key for ONE payment mode, or null when
 * that mode has none configured. Never falls back to the other mode: a live
 * checkout gets a `pk_live_` key or nothing (the caller refuses to start).
 *   test: STRIPE_PUBLISHABLE_KEY_TEST, else NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 *   live: STRIPE_PUBLISHABLE_KEY_LIVE, else NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * (each only when its prefix matches the mode). Publishable keys are public
 * by design; secret keys and webhook secrets never leave the server.
 */
export function publishableKeyForMode(mode: PaymentMode): string | null {
  const candidates = [
    mode === "test" ? process.env.STRIPE_PUBLISHABLE_KEY_TEST : process.env.STRIPE_PUBLISHABLE_KEY_LIVE,
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  ];
  for (const key of candidates) {
    const k = key?.trim();
    if (k && k.startsWith(mode === "test" ? "pk_test_" : "pk_live_")) return k;
  }
  return null;
}

/** What the browser needs to mount Stripe Checkout / a Payment Element for one server-created session or intent. */
export interface StripeBrowserContext {
  publishableKey: string;
  /** The connected account the session/intent lives on (direct charge), or null for the platform account. */
  stripeAccount: string | null;
  mode: PaymentMode;
}

/** A payment mode is selected but its credentials aren't configured — a configuration problem, not a buyer error. */
export class StripeModeConfigError extends Error {}

/** Refuse (before creating anything at Stripe) when the browser can't be given a key of the SAME mode. */
export function stripeBrowserContextFor(mode: PaymentMode, stripeAccount: string | null): StripeBrowserContext {
  const publishableKey = publishableKeyForMode(mode);
  if (!publishableKey) {
    throw new StripeModeConfigError(
      mode === "live"
        ? "Live card payments aren't configured on this site yet."
        : "Test card payments aren't configured on this site yet."
    );
  }
  return { publishableKey, stripeAccount, mode };
}

export function normalizePaymentMode(value: unknown, fallback: PaymentMode = "test"): PaymentMode {
  return value === "live" || value === "test" ? value : fallback;
}

/** Whether the configured Stripe secret key is a test-mode key — drives the
 *  "Payment Mode: Test/Live" indicator on the Offer details page. */
export function isStripeTestMode(): boolean {
  return getStripeEnvironment() === "test";
}
