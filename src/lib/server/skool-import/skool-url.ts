import "server-only";

/**
 * Validates/normalizes a Skool community URL down to its slug — the one
 * thing every downstream skool-client.ts call actually needs
 * (`https://www.skool.com/{slug}`). Accepts the real forms an owner would
 * plausibly paste in: with/without scheme, with/without `www.`, with/
 * without a trailing slash or path (`/`, `/-/members`, `/about`, ...).
 * Rejects anything that isn't actually skool.com, or has no slug segment.
 */

export interface SkoolUrlValidationResult {
  ok: boolean;
  slug: string | null;
  error: string | null;
}

// Skool's own slug rules aren't published; this is deliberately permissive
// (letters/digits/hyphens/underscores) rather than guessing an exact regex
// Skool enforces — over-rejecting a real community slug is worse than
// under-rejecting, since community access validation (a real authenticated
// fetch) is the actual source of truth, not this text check.
const SLUG_RE = /^[a-zA-Z0-9_-]{1,100}$/;

const RESERVED_TOP_LEVEL_PATHS = new Set([
  "login",
  "signup",
  "logout",
  "settings",
  "help",
  "about",
  "pricing",
  "discover",
  "search",
  "notifications",
  "messages",
]);

export function validateAndNormalizeSkoolUrl(raw: string): SkoolUrlValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, slug: null, error: "Enter your Skool community URL." };
  }

  // Accept a bare "skool.com/slug" (no scheme) by prepending one before
  // handing it to URL() — URL() requires a scheme to parse a host at all.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, slug: null, error: "We couldn't recognize that Skool community URL." };
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "skool.com" && host !== "www.skool.com") {
    return { ok: false, slug: null, error: "We couldn't recognize that Skool community URL." };
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const slug = segments[0]?.trim();
  if (!slug || !SLUG_RE.test(slug) || RESERVED_TOP_LEVEL_PATHS.has(slug.toLowerCase())) {
    return { ok: false, slug: null, error: "We couldn't recognize that Skool community URL." };
  }

  return { ok: true, slug, error: null };
}
