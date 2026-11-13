import type Stripe from "stripe";
import type { PaymentMode } from "@/types/tenancy";

/**
 * Stripe webhook verification with TEST and LIVE endpoints side by side.
 *
 * Each Stripe event destination signs with its own secret, so the secret that
 * verifies an event tells us — from trusted configuration, not from the body —
 * which endpoint it came from:
 *
 *   STRIPE_WEBHOOK_SECRET               test · platform ("Your account")
 *   STRIPE_CONNECT_WEBHOOK_SECRET       test · connected accounts
 *   STRIPE_WEBHOOK_SECRET_LIVE          live · platform            (optional)
 *   STRIPE_CONNECT_WEBHOOK_SECRET_LIVE  live · connected accounts  (optional)
 *
 * An event is accepted only when a secret configured for ITS mode and scope
 * verifies it: the authenticated `livemode` must equal the secret's mode, a
 * connected-account endpoint's event must carry `account`, a platform
 * endpoint's must not. Several secrets may verify the same body (e.g. a local
 * `stripe listen` session using one secret for every variable) — the one
 * whose mode and scope match wins; if none matches, the event is refused.
 * Unset live variables simply add nothing, so test-only deployments behave
 * exactly as before.
 *
 * Note on the existing variable names: they predate live support and have
 * always held the TEST endpoints' secrets in this deployment.
 */
export type StripeWebhookScope = "platform" | "connect";

export interface StripeWebhookSecretContext {
  mode: PaymentMode;
  scope: StripeWebhookScope;
  /** Variable name only — never the value. */
  source: string;
}

interface ConfiguredSecret extends StripeWebhookSecretContext {
  secret: string;
}

const SECRET_VARS: ReadonlyArray<StripeWebhookSecretContext> = [
  { source: "STRIPE_WEBHOOK_SECRET", mode: "test", scope: "platform" },
  { source: "STRIPE_CONNECT_WEBHOOK_SECRET", mode: "test", scope: "connect" },
  { source: "STRIPE_WEBHOOK_SECRET_LIVE", mode: "live", scope: "platform" },
  { source: "STRIPE_CONNECT_WEBHOOK_SECRET_LIVE", mode: "live", scope: "connect" },
];

export function configuredStripeWebhookSecrets(env: Record<string, string | undefined> = process.env): ConfiguredSecret[] {
  const out: ConfiguredSecret[] = [];
  for (const v of SECRET_VARS) {
    const secret = env[v.source]?.trim();
    if (secret) out.push({ ...v, secret });
  }
  return out;
}

/** Which modes this deployment can verify webhooks for (no values exposed). */
export function stripeWebhookModesConfigured(env: Record<string, string | undefined> = process.env): Record<PaymentMode, boolean> {
  const s = configuredStripeWebhookSecrets(env);
  return { test: s.some((x) => x.mode === "test"), live: s.some((x) => x.mode === "live") };
}

export type StripeWebhookVerification =
  | { ok: true; event: Stripe.Event; context: StripeWebhookSecretContext }
  | { ok: false; reason: "no_secrets" | "signature" | "mode_or_scope_mismatch"; message: string };

function eventMatches(event: Stripe.Event, ctx: StripeWebhookSecretContext): boolean {
  const live = event.livemode === true;
  if (live !== (ctx.mode === "live")) return false;
  const account = typeof event.account === "string" ? event.account.trim() : "";
  return ctx.scope === "connect" ? account.length > 0 : account.length === 0;
}

/**
 * Verify the raw body against every configured secret, then require the
 * authenticated event to be consistent with the verifying secret's mode and
 * scope. Nothing in the body is trusted before its signature verifies.
 */
export function verifyStripeWebhook(input: {
  stripe: Pick<Stripe, "webhooks">;
  body: string;
  signature: string;
  env?: Record<string, string | undefined>;
}): StripeWebhookVerification {
  const secrets = configuredStripeWebhookSecrets(input.env);
  if (!secrets.length) return { ok: false, reason: "no_secrets", message: "No webhook signing secret is configured." };
  let lastError: unknown = null;
  let verifiedButMismatched = false;
  for (const s of secrets) {
    let event: Stripe.Event;
    try {
      event = input.stripe.webhooks.constructEvent(input.body, input.signature, s.secret);
    } catch (err) {
      lastError = err;
      continue;
    }
    if (eventMatches(event, s)) return { ok: true, event, context: { mode: s.mode, scope: s.scope, source: s.source } };
    verifiedButMismatched = true;
  }
  if (verifiedButMismatched) {
    return { ok: false, reason: "mode_or_scope_mismatch", message: "Event mode or account scope doesn't match the endpoint that signed it." };
  }
  return { ok: false, reason: "signature", message: lastError instanceof Error ? lastError.message : "Unknown error" };
}
