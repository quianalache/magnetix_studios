import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart } from "./astrology";
import type { CenterKey } from "./human-design-data";
import { CENTER_LABELS, CENTERS } from "./human-design-data";
import type { GeneKeysSphereName, GeneKeysSphereResult } from "./gene-keys";

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
 *
 * Interpretation-text + Frequency tokens (2026-08-12, Phase 2 Task 9) —
 * the original 24 tokens above resolve to short discrete values
 * ("Generator," "Projector"); these resolve to the long-form paragraphs
 * the Content tab actually manages (Type/Authority/Center/Sign/House/
 * Aspect descriptions, per-Line names, per-gate Frequency showsUp/gift
 * text). Deliberately NOT a second content-resolution pathway: every one
 * of these reads from `reading.humanDesign.content` / `.astrology.content`
 * / `.spheres[].showsUp`/`.giftText` — fields already resolved (sub-account
 * override merged over the shipped default) and snapshotted onto the
 * reading at creation time by energetic-decoder-chart-content-service.ts's
 * `resolveReadingContent()` and energetic-decoder-gate-content-service.ts's
 * per-sphere resolution in energetic-decoder-service.ts. Nothing here does
 * a live Firestore lookup — same reason a `GeneratedReport`'s frozen
 * snapshot can never drift from what a client actually received: the
 * content was already resolved once, at reading-generation time, same as
 * every other field on the reading. Missing on readings saved before this
 * shipped (2026-08-08 for chart content, longer for gate content) — same
 * "real field or absent" degrade-to-empty-string contract as everywhere
 * else in this file, not a broken token.
 */

export type ShortcodeGroup = "Birth Details" | "Human Design" | "Astrology" | "Interpretation" | "Frequency";

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

  // Variables — added 2026-08-09 alongside the Bodygraph API integration.
  // Same granularity as every other Human Design token above (a short
  // value, not the full paragraph description — that lives in the Content
  // tab / reading display, not a shortcode).
  { token: "digestion", label: "Digestion", group: "Human Design" },
  { token: "sense", label: "Sense", group: "Human Design" },
  { token: "design_sense", label: "Design Sense", group: "Human Design" },
  { token: "motivation", label: "Motivation", group: "Human Design" },
  { token: "perspective", label: "Perspective", group: "Human Design" },
  { token: "environment", label: "Environment", group: "Human Design" },

  // Astrology.
  { token: "sun_sign", label: "Sun Sign", group: "Astrology" },
  { token: "moon_sign", label: "Moon Sign", group: "Astrology" },
  { token: "rising_sign", label: "Rising Sign", group: "Astrology" },
  { token: "chiron_sign", label: "Chiron Sign", group: "Astrology" },

  // Interpretation-text — Human Design (2026-08-12).
  { token: "type_description", label: "Type — Interpretation", group: "Interpretation" },
  { token: "authority_description", label: "Authority — Interpretation", group: "Interpretation" },
  { token: "profile_description", label: "Profile — Interpretation", group: "Interpretation" },
  ...CENTERS.map((key) => ({
    token: `${key}_center_text`,
    label: `${CENTER_LABELS[key]} Center — Interpretation`,
    group: "Interpretation" as const,
  })),

  // Interpretation-text — Astrology (2026-08-12).
  { token: "sun_sign_description", label: "Sun Sign — Interpretation", group: "Interpretation" },
  { token: "moon_sign_description", label: "Moon Sign — Interpretation", group: "Interpretation" },
  { token: "rising_sign_description", label: "Rising Sign — Interpretation", group: "Interpretation" },
  { token: "chiron_sign_description", label: "Chiron Sign — Interpretation", group: "Interpretation" },
  { token: "sun_house_theme", label: "Sun's House — Theme", group: "Interpretation" },
  { token: "sun_house_description", label: "Sun's House — Interpretation", group: "Interpretation" },
  { token: "tightest_aspect_description", label: "Tightest Aspect — Interpretation", group: "Interpretation" },

  // Frequency / Gene Keys — the 4 Activation Sequence gates (2026-08-12).
  // Content already manages this copy (energetic-decoder-gate-content-
  // service.ts's showsUp/giftText, editable per sub-account) — this is the
  // first shortcode path into a report for it.
  { token: "life_work_gate", label: "Life's Work — Gate", group: "Frequency" },
  { token: "life_work_shows_up", label: "Life's Work — Shows Up As", group: "Frequency" },
  { token: "life_work_gift_text", label: "Life's Work — Gift", group: "Frequency" },
  { token: "evolution_gate", label: "Evolution — Gate", group: "Frequency" },
  { token: "evolution_shows_up", label: "Evolution — Shows Up As", group: "Frequency" },
  { token: "evolution_gift_text", label: "Evolution — Gift", group: "Frequency" },
  { token: "radiance_gate", label: "Radiance — Gate", group: "Frequency" },
  { token: "radiance_shows_up", label: "Radiance — Shows Up As", group: "Frequency" },
  { token: "radiance_gift_text", label: "Radiance — Gift", group: "Frequency" },
  { token: "purpose_gate", label: "Purpose — Gate", group: "Frequency" },
  { token: "purpose_shows_up", label: "Purpose — Shows Up As", group: "Frequency" },
  { token: "purpose_gift_text", label: "Purpose — Gift", group: "Frequency" },
];

/** One resolved chart-content item as it's snapshotted onto a reading — same shape energetic-decoder-chart-content-service.ts's resolveReadingContent() returns. */
interface HumanDesignReadingContentShape {
  typeStrategy: string;
  typeDescription: string;
  authorityDescription: string;
  centers: Record<string, { definedText: string; undefinedText: string }>;
  /** Line 1-6 name (e.g. "The Investigator"), keyed by line number as a string. */
  lines?: Record<string, string>;
}

interface AstrologyReadingContentShape {
  signs: Record<string, string>;
  houses: Record<string, { theme: string; description: string }>;
  aspectTypes: Record<string, string>;
}

export interface ShortcodeReadingInput {
  name?: string;
  birthDate?: string;
  birthPlace?: string;
  humanDesign?: (HumanDesignProfile & { content?: HumanDesignReadingContentShape }) | null;
  astrology?: (AstrologyChart & { content?: AstrologyReadingContentShape }) | null;
  /** Gene Keys / Frequency spheres, each already resolved with showsUp/giftText at reading-generation time (energetic-decoder-service.ts). Optional — omitted by sources that don't compute Gene Keys (e.g. the Report Builder Preview's Sample Data). */
  spheres?: GeneKeysSphereResult[];
}

const ASTRO_BODY_LABELS: Record<string, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
  northNode: "North Node",
  southNode: "South Node",
  lilith: "Lilith",
  chiron: "Chiron",
};

function centerText(hd: ShortcodeReadingInput["humanDesign"], key: CenterKey): string {
  const content = hd?.content?.centers?.[key];
  if (!content) return "";
  const isDefined = hd?.definedCenters?.includes(key) ?? false;
  return isDefined ? content.definedText : content.undefinedText;
}

function profileDescription(hd: ShortcodeReadingInput["humanDesign"]): string {
  const profile = hd?.profile;
  if (!profile) return "";
  const [a, b] = profile.split("/");
  const nameA = hd?.content?.lines?.[a];
  const nameB = hd?.content?.lines?.[b];
  if (!nameA || !nameB) return "";
  return `${profile} — ${nameA} / ${nameB}`;
}

function findSphere(spheres: GeneKeysSphereResult[] | undefined, name: GeneKeysSphereName): GeneKeysSphereResult | undefined {
  return spheres?.find((s) => s.sphere === name);
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
    case "digestion":
      return hd?.variables?.digestion.value ?? "";
    case "sense":
      return hd?.variables?.sense.value ?? "";
    case "design_sense":
      return hd?.variables?.designSense.value ?? "";
    case "motivation":
      return hd?.variables?.motivation.value ?? "";
    case "perspective":
      return hd?.variables?.perspective.value ?? "";
    case "environment":
      return hd?.variables?.environment.value ?? "";
    case "sun_sign":
      return astro?.placements.find((p) => p.body === "sun")?.sign ?? "";
    case "moon_sign":
      return astro?.placements.find((p) => p.body === "moon")?.sign ?? "";
    case "rising_sign":
      return astro?.angles.ascendant.sign ?? "";
    case "chiron_sign":
      return astro?.placements.find((p) => p.body === "chiron")?.sign ?? "";

    // Interpretation-text — Human Design.
    case "type_description":
      return hd?.content?.typeDescription ?? "";
    case "authority_description":
      return hd?.content?.authorityDescription ?? "";
    case "profile_description":
      return profileDescription(hd);
    case "head_center_text":
    case "ajna_center_text":
    case "throat_center_text":
    case "g_center_text":
    case "heart_center_text":
    case "sacral_center_text":
    case "solarplexus_center_text":
    case "spleen_center_text":
    case "root_center_text":
      return centerText(hd, token.replace(/_center_text$/, "") as CenterKey);

    // Interpretation-text — Astrology.
    case "sun_sign_description": {
      const sign = astro?.placements.find((p) => p.body === "sun")?.sign;
      return sign ? (astro?.content?.signs?.[sign] ?? "") : "";
    }
    case "moon_sign_description": {
      const sign = astro?.placements.find((p) => p.body === "moon")?.sign;
      return sign ? (astro?.content?.signs?.[sign] ?? "") : "";
    }
    case "rising_sign_description": {
      const sign = astro?.angles.ascendant.sign;
      return sign ? (astro?.content?.signs?.[sign] ?? "") : "";
    }
    case "chiron_sign_description": {
      const sign = astro?.placements.find((p) => p.body === "chiron")?.sign;
      return sign ? (astro?.content?.signs?.[sign] ?? "") : "";
    }
    case "sun_house_theme": {
      const house = astro?.placements.find((p) => p.body === "sun")?.house;
      return house ? (astro?.content?.houses?.[String(house)]?.theme ?? "") : "";
    }
    case "sun_house_description": {
      const house = astro?.placements.find((p) => p.body === "sun")?.house;
      return house ? (astro?.content?.houses?.[String(house)]?.description ?? "") : "";
    }
    case "tightest_aspect_description": {
      const aspect = astro?.aspects?.[0];
      if (!aspect) return "";
      const desc = astro?.content?.aspectTypes?.[aspect.type];
      if (!desc) return "";
      const labelA = ASTRO_BODY_LABELS[aspect.bodyA] ?? aspect.bodyA;
      const labelB = ASTRO_BODY_LABELS[aspect.bodyB] ?? aspect.bodyB;
      return `${labelA} ${aspect.type} ${labelB} — ${desc}`;
    }

    // Frequency / Gene Keys — Activation Sequence.
    case "life_work_gate":
      return findSphere(reading.spheres, "Life's Work")?.gate?.toString() ?? "";
    case "life_work_shows_up":
      return findSphere(reading.spheres, "Life's Work")?.showsUp ?? "";
    case "life_work_gift_text":
      return findSphere(reading.spheres, "Life's Work")?.giftText ?? "";
    case "evolution_gate":
      return findSphere(reading.spheres, "Evolution")?.gate?.toString() ?? "";
    case "evolution_shows_up":
      return findSphere(reading.spheres, "Evolution")?.showsUp ?? "";
    case "evolution_gift_text":
      return findSphere(reading.spheres, "Evolution")?.giftText ?? "";
    case "radiance_gate":
      return findSphere(reading.spheres, "Radiance")?.gate?.toString() ?? "";
    case "radiance_shows_up":
      return findSphere(reading.spheres, "Radiance")?.showsUp ?? "";
    case "radiance_gift_text":
      return findSphere(reading.spheres, "Radiance")?.giftText ?? "";
    case "purpose_gate":
      return findSphere(reading.spheres, "Purpose")?.gate?.toString() ?? "";
    case "purpose_shows_up":
      return findSphere(reading.spheres, "Purpose")?.showsUp ?? "";
    case "purpose_gift_text":
      return findSphere(reading.spheres, "Purpose")?.giftText ?? "";

    default:
      return "";
  }
}

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Replaces every `{{token}}` in `html` with its real resolved value for this reading. Unknown tokens resolve to an empty string rather than being left in place, so a stray/typo'd token never leaks raw `{{...}}` syntax into a delivered report. */
export function resolveShortcodes(html: string, reading: ShortcodeReadingInput): string {
  return html.replace(TOKEN_PATTERN, (_match, token: string) => resolveToken(token, reading));
}
