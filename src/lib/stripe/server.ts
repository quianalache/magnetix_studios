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
  const client = new Stripe(key);
  clients.set(key, client);
  return client;
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

export function normalizePaymentMode(value: unknown, fallback: PaymentMode = "test"): PaymentMode {
  return value === "live" || value === "test" ? value : fallback;
}

/** Whether the configured Stripe secret key is a test-mode key — drives the
 *  "Payment Mode: Test/Live" indicator on the Offer details page. */
export function isStripeTestMode(): boolean {
  return getStripeEnvironment() === "test";
}
