import "server-only";

import { headers } from "next/headers";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";

/**
 * Request-side counterpart to routes.ts: figures out whether the CURRENT
 * request (page render or API call) is arriving over `saId`'s own verified
 * custom domain, so redirects/emails/links generated during that request
 * stay on whatever domain the visitor is actually on — "remain on the
 * custom domain when the member started there," not "always prefer the
 * custom domain if one exists" (those are different: a visitor can still
 * reach the shared platform domain directly even after a custom domain is
 * configured, e.g. an old bookmarked opaque link).
 */

export interface CommunityRequestOrigin {
  pretty: boolean;
  /** Absolute origin ("https://example.com") to build outbound links (magic-link emails) from. */
  origin: string;
}

function platformOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** For API route handlers, which get the Host header off `request` directly rather than via next/headers. */
export async function resolveCommunityRequestOrigin(
  saId: string,
  hostHeader: string | null,
): Promise<CommunityRequestOrigin> {
  const sub = await getSubAccountByCustomDomain(hostHeader);
  if (sub?.id === saId && sub.customDomain?.domain) {
    return { pretty: true, origin: `https://${sub.customDomain.domain}` };
  }
  return { pretty: false, origin: platformOrigin() };
}

/** For Server Component pages, which read the current request's Host via next/headers. */
export async function isCommunityPrettyRequest(saId: string): Promise<boolean> {
  const host = (await headers()).get("host");
  const { pretty } = await resolveCommunityRequestOrigin(saId, host);
  return pretty;
}
