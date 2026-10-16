// Edge-safe (imported by middleware): no Node or Firebase imports.

/**
 * Every top-level route segment the app itself owns (public or protected).
 * A single-segment path NOT in this set can only be the Magnetix-hosted
 * public Community entry `/{communitySlug}` (src/app/[groupSlug]) — the one
 * dynamic root route — so it is public. Anything here keeps its normal
 * rule. scripts/check-public-routes.ts fails if a new top-level route is
 * added without being listed, so a protected page can never become public
 * by accident.
 */
export const RESERVED_ROOT_SEGMENTS = new Set([
  "about", "affiliate", "affiliate-program", "agency", "api", "api-webhooks", "b", "booking", "buy", "c",
  "calendar", "communities", "contacts", "conversations", "course", "courses", "dashboard", "decoder", "docs",
  "e", "embed", "f", "forms", "founderx", "gateway", "get-started", "login", "me", "member-password", "my",
  "offer", "p", "pay", "pipeline", "portal", "privacy", "q", "qr", "replay", "report-builder-review", "reports",
  "sa", "security", "signup", "tasks", "terms", "thank-you", "u", "webinar",
]);

/** `/{communitySlug}` — a single lowercase slug segment the app doesn't own. */
export function isRootCommunityPath(pathname: string): boolean {
  const m = /^\/([a-z0-9][a-z0-9-]{0,79})\/?$/.exec(pathname);
  if (!m) return false;
  if (RESERVED_ROOT_SEGMENTS.has(m[1])) return false;
  return !m[1].startsWith("leadstack-vs-");
}
