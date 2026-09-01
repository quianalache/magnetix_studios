import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Backward-compatible redirect (2026-09-01) — the real dual-role gateway
 * moved to /gateway (see that file for the full implementation and why).
 * Kept as a thin stub, not deleted, so any bookmark, saved link, or stale
 * client cache pointing at the old URL still lands somewhere correct.
 * Deliberately not a Next.js `redirects()` config entry — a real page
 * component here keeps this on the same "/my" public-path allowance
 * middleware already grants, no separate entry needed for the old URL.
 */
export default function LegacyGatewayRedirect() {
  redirect("/gateway");
}
