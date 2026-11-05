/**
 * Custom-domain Page ownership (pre-Funnel safety, 2026-11-04). The canonical
 * public route `/p/{pageId}` is served on the platform hosts AND on every
 * workspace's verified custom domain. A custom domain may only serve its OWN
 * workspace's Pages — `tenantA.com/p/{tenant-B-page}` must read as not-found,
 * exactly like a missing page, so it never reveals which workspace owns it.
 *
 * Pure decision (no I/O) so it can be checked offline; the caller supplies
 * whether the host is a platform host and which workspace (if any) owns the
 * host as a verified custom domain.
 */
export type PageHostDecision = "allow" | "not_found";

export function decidePageHost(input: {
  /** True for localhost, *.vercel.app, the app URL host and the primary domain (apex/www). */
  isPlatformHost: boolean;
  /** Workspace whose VERIFIED custom domain is this host, or null. */
  hostSubAccountId: string | null;
  /** The page's own workspace. */
  pageSubAccountId: string | null | undefined;
}): PageHostDecision {
  if (input.isPlatformHost) return "allow";
  // An unregistered / unverified host never serves tenant Pages (fail closed —
  // same rule the other custom-domain routes follow).
  if (!input.hostSubAccountId) return "not_found";
  if (!input.pageSubAccountId) return "not_found";
  return input.hostSubAccountId === input.pageSubAccountId ? "allow" : "not_found";
}
