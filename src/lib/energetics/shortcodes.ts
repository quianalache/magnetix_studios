import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart } from "./astrology";

/**
 * Shortcodes — merge tags a report/page block's text can contain, resolved
 * per-reading at render time (`resolveShortcodes`). Same real mechanism
 * found in Bodygraph's actual Report Editor 2026-08-09 (its "Shortcodes"
 * panel: Birth Form / Popular / Conscious Planets groups) — one report
 * DESIGN, personalized per reader, without hand-editing anything.
 *
 * Token syntax: `{{token_name}}`, all lowercase/underscore. Kept
 * deliberately flat (no nested/loop syntax) — every real token here
 * resolves to one plain string, matching what a person actually drags
 * into a text block.
 */

export type ShortcodeGroup = "Birth Details" | "Human Design" | "Astrology";

export interface ShortcodeDef {
  token: string;
  label: string;
  group: ShortcodeGroup;
}

export const SHORTCODE_CATALOG: ShortcodeDef[] = [
  // Birth Details — mirrors Bodygraph's "Birth Form" group.
  { token: "full_name", label: "Full Name", group: "Birth Details" },
  { token: "first_name", label: "First Name", group: "Birth Details" },
  { token: "last_name", label: "Last Name", group: "Birth Details" },
  { token: "birth_date", label: "Birth Date", group: "Birth Details" },
  { token: "birth_place", label: "Birth Place", group: "Birth Details" },

  // Human Design — mirrors Bodygraph's "Popular" group.
  { token: "type", label: "Type", group: "Human Design" },
  { token: "strategy", label: "Strategy", group: "Human Design" },
  { token: "authority", label: "Authority", group: "Human Design" },
  { token: "profile", label: "Profile", group: "Human Design" },
  { token: "signature", label: "Signature", group: "Human Design" },
  { token: "not_self_theme", label: "Not-Self Theme", group: "Human Design" },
  { token: "definition", label: "Definition", group: "Human Design" },
  { token: "design_date", label: "Design Date", group: "Human Design" },
  { token: "incarnation_cross", label: "Incarnation Cross", group: "Human Design" },

  // Astrology.
  { token: "sun_sign", label: "Sun Sign", group: "Astrology" },
  { token: "moon_sign", label: "Moon Sign", group: "Astrology" },
  { token: "rising_sign", label: "Rising Sign", group: "Astrology" },
];

export interface ShortcodeReadingInput {
  name?: string;
  birthDate?: string;
  birthPlace?: string;
  humanDesign?: HumanDesignProfile | null;
  astrology?: AstrologyChart | null;
}

function resolveToken(token: string, reading: ShortcodeReadingInput): string {
  const hd = reading.humanDesign;
  const astro = reading.astrology;
  const [first, ...rest] = (reading.name ?? "").trim().split(/\s+/);

  switch (token) {
    case "full_name":
      return reading.name ?? "";
    case "first_name":
      return first ?? "";
    case "last_name":
      return rest.join(" ");
    case "birth_date":
      return reading.birthDate ?? "";
    case "birth_place":
      return reading.birthPlace ?? "";
    case "type":
      return hd?.type ?? "";
    case "strategy":
      return hd?.strategy ?? "";
    case "authority":
      return hd?.authority ?? "";
    case "profile":
      return hd?.profile ?? "";
    case "signature":
      return hd?.signature ?? "";
    case "not_self_theme":
      return hd?.notSelfTheme ?? "";
    case "definition":
      return hd?.definitionLabel ?? "";
    case "design_date":
      return hd?.designDateUtc ? new Date(hd.designDateUtc).toLocaleDateString() : "";
    case "incarnation_cross":
      return hd?.incarnationCross ?? "";
    case "sun_sign":
      return astro?.placements.find((p) => p.body === "sun")?.sign ?? "";
    case "moon_sign":
      return astro?.placements.find((p) => p.body === "moon")?.sign ?? "";
    case "rising_sign":
      return astro?.angles.ascendant.sign ?? "";
    default:
      return "";
  }
}

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Replaces every `{{token}}` in `html` with its real resolved value for this reading. Unknown tokens resolve to an empty string rather than being left in place, so a stray/typo'd token never leaks raw `{{...}}` syntax into a delivered report. */
export function resolveShortcodes(html: string, reading: ShortcodeReadingInput): string {
  return html.replace(TOKEN_PATTERN, (_match, token: string) => resolveToken(token, reading));
}
