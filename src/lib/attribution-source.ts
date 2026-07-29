/**
 * Referrer-based fallback source classifier — used ONLY when a visit/contact
 * has no explicit `utm_source` (see `normalizeAttribution` in
 * `src/lib/attribution.ts`, the only caller). Explicit UTM tagging always
 * wins; this exists purely so untagged traffic ("just clicked a link on
 * Facebook, no UTMs") still gets a coarse channel label instead of showing
 * up as blank.
 *
 * Deliberately NOT shared with `src/lib/landing/traffic-source.ts` — that
 * module classifies traffic to Magnetix Studios' own marketing site, an
 * unrelated feature. This is the CRM-scoped sibling for sub-account pages.
 */

export interface ReferrerSource {
  key: string;
  label: string;
}

const HOST_BUCKETS: { match: string; key: string; label: string }[] = [
  { match: "youtube.", key: "youtube", label: "YouTube" },
  { match: "youtu.be", key: "youtube", label: "YouTube" },
  { match: "instagram.", key: "instagram", label: "Instagram" },
  { match: "facebook.", key: "facebook", label: "Facebook" },
  { match: "fb.com", key: "facebook", label: "Facebook" },
  { match: "l.facebook", key: "facebook", label: "Facebook" },
  { match: "tiktok.", key: "tiktok", label: "TikTok" },
  { match: "google.", key: "google", label: "Google" },
  { match: "bing.", key: "bing", label: "Bing" },
  { match: "twitter.", key: "twitter", label: "X / Twitter" },
  { match: "x.com", key: "twitter", label: "X / Twitter" },
  { match: "linkedin.", key: "linkedin", label: "LinkedIn" },
  { match: "pinterest.", key: "pinterest", label: "Pinterest" },
];

/** Best-effort host → coarse channel label. Returns null for an empty/
 *  unparseable referrer (e.g. direct traffic sends no Referer header). */
export function classifyReferrerSource(
  referrer: string | null | undefined,
): ReferrerSource | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).host.toLowerCase();
  } catch {
    return null;
  }
  for (const bucket of HOST_BUCKETS) {
    if (host.includes(bucket.match)) {
      return { key: bucket.key, label: bucket.label };
    }
  }
  const domain = host.replace(/^www\./, "");
  if (!domain) return null;
  return { key: `ref-${domain.replace(/[^a-z0-9]+/g, "-")}`, label: domain };
}
