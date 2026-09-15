import "server-only";

/**
 * The stable production Magnetix CRM domain. Every alias
 * (quianalache.com, magnetixstudios.com, www.magnetixstudios.com,
 * crm.magnetixstudios.com) resolves to the same deployment, but a
 * server-generated auth/invite/setup email link needs exactly ONE stable
 * target, and this is it.
 */
export const CANONICAL_APP_ORIGIN = "https://crm.magnetixstudios.com";

/**
 * The origin every server-generated CRM/Business Center auth, invite, and
 * account-setup email link should use.
 *
 * Incident (2026-09-15): a real client-owner setup email went out with a
 * link to `douglas-spatial-dow-villages.trycloudflare.com` — a dead,
 * ephemeral local-dev tunnel hostname. Root cause: `NEXT_PUBLIC_APP_URL`
 * had been set to that tunnel URL (for local webhook/callback testing) and
 * the same value was live in Vercel's PRODUCTION environment variables,
 * so every server that read it — including this real invite send — used
 * it as the email's link origin. `NEXT_PUBLIC_APP_URL` is fine for the
 * many non-auth integrations that already read it directly (Stripe
 * Connect returns, calendar feeds, webhook callback URLs, etc. — out of
 * scope for this fix, and safe to leave alone since a wrong value there
 * fails visibly and immediately, unlike a broken link mailed to a real
 * human) — but it must never be the sole source of truth for a
 * production auth email link again.
 *
 * `VERCEL_ENV` (set automatically by Vercel, distinct from `NODE_ENV`
 * which is "production" even for preview builds) is the actual signal:
 *   - "production" -> ALWAYS the hardcoded canonical CRM domain, full
 *     stop. `NEXT_PUBLIC_APP_URL` is not consulted at all in this branch,
 *     specifically so a future stray/stale value there can never repeat
 *     this incident.
 *   - "preview"    -> Vercel's own real preview deployment URL
 *     (`VERCEL_URL`) — a genuine, working hostname, never a tunnel.
 *   - unset (local dev) -> `NEXT_PUBLIC_APP_URL` if set (so local dev
 *     tunneling still works exactly as before), else localhost:3000.
 */
export function getAuthEmailOrigin(): string {
  if (process.env.VERCEL_ENV === "production") {
    return CANONICAL_APP_ORIGIN;
  }
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured || "http://localhost:3000";
}
