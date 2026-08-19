import { GiphyFetch } from "@giphy/js-fetch-api";

/**
 * Thin wrapper around the official GIPHY fetch SDK — the one place that
 * reads `NEXT_PUBLIC_GIPHY_API_KEY` and owns the `GiphyFetch` instance.
 * Everything downstream (GiphyPicker, the post/comment GIF renderer) goes
 * through `getGiphyFetch()` rather than constructing its own client, so
 * there's exactly one key-missing check and one content-rating default in
 * the whole feature.
 *
 * Deliberately NOT a server proxy: this module still runs in the browser
 * (imported only from "use client" components) and calls GIPHY's API
 * directly from there, per GIPHY's own Search/Trending requirement — see
 * the Phase D report for the full compliance rationale. `NEXT_PUBLIC_*` is
 * correct here specifically because the key is meant to be client-visible
 * by GIPHY's own design, not a leak of something that should have stayed
 * server-side.
 */

let cached: GiphyFetch | null | undefined;

/** `undefined` env var (key never configured) is expected and must not
 *  throw — every consumer treats a `null` return as "render the
 *  missing-key state," never as an error to surface to Sentry/console. */
export function getGiphyFetch(): GiphyFetch | null {
  if (cached !== undefined) return cached;
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  cached = key ? new GiphyFetch(key) : null;
  return cached;
}

export function hasGiphyKey(): boolean {
  return getGiphyFetch() !== null;
}

/**
 * Centrally configurable content rating (Part 9) — one constant every
 * search/trending call in the feature passes, rather than each call site
 * picking its own. `"g"` (General Audiences) is GIPHY's most conservative
 * tier — the deliberate "default conservative" choice for a Community
 * feature moderators don't get a per-tenant rating control over yet.
 */
export const GIPHY_CONTENT_RATING = "g";

export const GIPHY_PAGE_LIMIT = 24;
