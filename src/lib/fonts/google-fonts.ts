import fontList from "./font-list.json";

/**
 * Google Fonts catalog for the course theme font picker. `font-list.json` is
 * a slim, generated snapshot (family + category + available weights only —
 * no per-font CDN URLs) derived once from the `google-fonts-complete` npm
 * package, which is NOT a runtime dependency (it's ~12MB of URL data we don't
 * need — the actual font files are always served live from Google's own CDN
 * via the URL built below, never bundled or self-hosted).
 *
 * Deliberately not using `next/font/google`: that API requires every font to
 * be statically imported at build time, which can't support a user picking
 * an arbitrary family at runtime from ~1,580 options.
 */
export interface GoogleFontFamily {
  family: string;
  category: string;
  weights: string[];
}

export const GOOGLE_FONTS: GoogleFontFamily[] = fontList as GoogleFontFamily[];

const FONT_BY_NAME = new Map(GOOGLE_FONTS.map((f) => [f.family, f]));

export function getGoogleFont(family: string): GoogleFontFamily | null {
  return FONT_BY_NAME.get(family) ?? null;
}

/** Case-insensitive substring search over family names, for the picker. */
export function searchGoogleFonts(query: string, limit = 50): GoogleFontFamily[] {
  const q = query.trim().toLowerCase();
  if (!q) return GOOGLE_FONTS.slice(0, limit);
  return GOOGLE_FONTS.filter((f) => f.family.toLowerCase().includes(q)).slice(0, limit);
}

/**
 * Builds the Google Fonts CSS2 stylesheet URL for one or more family+weight
 * selections. Used to inject a `<link rel="stylesheet">` on the public
 * course sales page so the chosen fonts actually render — Google's CDN
 * serves the woff2 files, nothing is self-hosted.
 */
export function buildGoogleFontsStylesheetUrl(
  selections: { family: string; weight: string }[],
): string {
  const params = selections
    .filter((s) => s.family)
    .map((s) => `family=${encodeURIComponent(s.family).replace(/%20/g, "+")}:wght@${s.weight}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
