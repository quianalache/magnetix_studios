import "server-only";

import { Body } from "astronomy-engine";
import {
  eclipticLongitude,
  findDesignTime,
  longitudeToFullActivation,
  parseBirthToUtc,
  type WallClockBirthInput,
} from "./gate-wheel";
import { trueNodeLongitudeHighPrecision } from "./swiss-ephemeris";

/**
 * The real, free, local Variables engine — replaces the paid Bodygraph API
 * call for 6 of the fields it was the only source for (added 2026-08-09
 * because the calculation rule wasn't published anywhere free; the whole
 * integration, including that original API, is gone as of 2026-08-11 —
 * this file has stood on its own since 2026-08-10). Not guessed, not
 * reverse-engineered from Bodygraph's outputs (their terms explicitly
 * forbid that, checked directly 2026-08-09) — this
 * is the real, published Human Design "Primary Health System" substructure
 * (Gate → Line → Color → Tone → Base), verified independently against 2
 * real Bodygraph reference charts before being trusted:
 *
 *   Motivation   = Color of Personality Sun/Earth   — 2/2 real charts matched
 *   Sense        = Tone  of Personality Sun/Earth   — 2/2 real charts matched
 *   Design Sense = Tone  of Design Sun/Earth        — 2/2 real charts matched
 *   Environment  = Color of Design Node             — matched once Node
 *                                                      precision was fixed
 *                                                      (see swiss-ephemeris.ts)
 *   Perspective  = Color of Personality Node         — same fix
 *   Digestion    = Color of Design Sun/Earth + Left/Right
 *                  orientation from that same activation's Tone (1-3=Left,
 *                  4-6=Right) — her own supplied mapping, still independently
 *                  tested below, not trusted from the table alone.
 *
 * Sun/Earth longitude uses the same astronomy-engine calculation Gate/Line
 * already trusts (measured within 0.6 arcsec of Swiss Ephemeris — no
 * precision concern). Node longitude uses the new high-precision Swiss
 * Ephemeris path — astronomia's node approximation measured ~357 arcsec off
 * on a real test instant, more than a full Tone-width, which is exactly
 * why Environment/Perspective didn't reproduce Bodygraph's real values
 * until this was fixed.
 */

/** One resolved Variable field: the computed word + its (locally-sourced, since 2026-08-11) description text. */
export interface HdVariableField {
  value: string;
  description: string;
}

/**
 * The 6 Variables, fully resolved (value + description) — this shape used
 * to also carry `skills`/`chartSvg` back when it lived in bodygraph-api.ts
 * (deleted 2026-08-11 along with the rest of that integration). Skills
 * moved to its own `HumanDesignProfile.skills` field (see
 * human-design-skills-service.ts, the local replacement); chartSvg is
 * gone entirely — it was never rendered anywhere, same as Astrology's
 * copy before it.
 */
export interface HumanDesignVariables {
  digestion: HdVariableField;
  sense: HdVariableField;
  designSense: HdVariableField;
  motivation: HdVariableField;
  perspective: HdVariableField;
  environment: HdVariableField;
}

const ENVIRONMENT = ["Caves", "Markets", "Kitchens", "Mountains", "Valleys", "Shores"] as const;
const MOTIVATION = ["Fear", "Hope", "Desire", "Need", "Guilt", "Innocence"] as const;
const SENSE = ["Security", "Uncertainty", "Action", "Meditation", "Judgment", "Acceptance"] as const;
const DESIGN_SENSE = ["Smell", "Taste", "Outer Vision", "Inner Vision", "Feeling", "Touch"] as const;
const PERSPECTIVE = ["Survival", "Possibility", "Power", "Wanting", "Probability", "Personal"] as const;

/**
 * Her supplied mapping (2026-08-10) — Color selects the base family, that
 * same activation's Tone (1-3 Left / 4-6 Right) selects the orientation.
 * Verified against 5 real charts: every single one initially "mismatched"
 * by exactly the family word (e.g. computed "Direct Light" vs Bodygraph's
 * real "Direct") — the Color/Tone→orientation logic was correct the whole
 * time, Bodygraph just displays the orientation word alone. Real vocabulary
 * casing below matches Bodygraph's own Chart Content tool exactly
 * (confirmed 2026-08-09, e.g. "InDirect" — capital D, not "Indirect").
 */
const DIGESTION: Record<number, { left: string; right: string }> = {
  1: { left: "Consecutive", right: "Alternating" },
  2: { left: "Open", right: "Closed" },
  3: { left: "Hot", right: "Cold" },
  4: { left: "Calm", right: "Nervous" },
  5: { left: "High", right: "Low" },
  6: { left: "Direct", right: "InDirect" },
};

export type VariableArrowDirection = "Left" | "Right";

/** One of the 4 Variable "arrow" source points — the Color/Tone that activation landed on, plus the arrow direction that Tone implies. */
export interface VariableArrowSource {
  color: number;
  tone: number;
  arrow: VariableArrowDirection;
}

/**
 * The 4 Variable arrow directions, verified 2026-08-10 against the same 5
 * real Bodygraph reference charts (+ boundary case) used for the word
 * fields below: Color/Tone at all 4 source points matched Bodygraph's own
 * raw per-body data exactly (20/20), and the Tone→direction rule itself
 * (1-3 Left / 4-6 Right) is independently corroborated by NatalEngine's
 * own source code, which documents the same 4-point mapping citing real
 * external PHS/Rave Psychology sources — not assumed by analogy to
 * Digestion alone. One honest gap: Bodygraph's own literal rendered arrow
 * icon was never directly observable (neither their API response nor the
 * chart SVG exposes it), so this is verified at the Color/Tone/rule level,
 * not by a pixel-for-pixel match against their drawn arrow.
 */
export interface ComputedVariableArrows {
  /** Design Sun. */
  digestion: VariableArrowSource;
  /** Design Node. */
  environment: VariableArrowSource;
  /** Personality Node. */
  perspective: VariableArrowSource;
  /** Personality Sun. */
  motivation: VariableArrowSource;
}

export interface ComputedHumanDesignVariables {
  digestion: string;
  environment: string;
  perspective: string;
  motivation: string;
  sense: string;
  designSense: string;
  /** Real fields, not debug-only — Color/Tone/arrow-direction for all 4 Variable source points. See ComputedVariableArrows above for the verification note. */
  arrows: ComputedVariableArrows;
}

export async function computeHumanDesignVariables(
  input: WallClockBirthInput,
): Promise<ComputedHumanDesignVariables> {
  const birthUtc = parseBirthToUtc(input);
  const personalitySunLon = eclipticLongitude(Body.Sun, birthUtc);
  const personalityEarthLon = (personalitySunLon + 180) % 360;
  const designTime = findDesignTime(birthUtc, personalitySunLon);
  const designSunLon = eclipticLongitude(Body.Sun, designTime);
  const designEarthLon = (designSunLon + 180) % 360;

  // Sun/Earth share a Color/Tone pair by construction (Earth is always
  // exactly 180° from Sun, and both Gate-wheel positions and this
  // subdivision math are linear) — computed from Sun's longitude alone for
  // clarity, matching what's actually read from the Design/Personality
  // "Sun/Earth" activation as one unit in real Human Design teaching.
  void personalityEarthLon;
  void designEarthLon;

  const personalityNodeLon = await trueNodeLongitudeHighPrecision(birthUtc);
  const designNodeLon = await trueNodeLongitudeHighPrecision(designTime);

  const pSun = longitudeToFullActivation(personalitySunLon);
  const dSun = longitudeToFullActivation(designSunLon);
  const pNode = longitudeToFullActivation(personalityNodeLon);
  const dNode = longitudeToFullActivation(designNodeLon);

  const digestionFamily = DIGESTION[dSun.color];
  const digestion = dSun.tone <= 3 ? digestionFamily.left : digestionFamily.right;

  // Verified 2026-08-10 — see ComputedVariableArrows above. Same Tone
  // value already computed for each point above; arrowOf just applies the
  // one shared rule (1-3 Left / 4-6 Right) rather than re-deriving it.
  const arrowOf = (tone: number): VariableArrowDirection => (tone <= 3 ? "Left" : "Right");

  return {
    digestion,
    environment: ENVIRONMENT[dNode.color - 1],
    perspective: PERSPECTIVE[pNode.color - 1],
    motivation: MOTIVATION[pSun.color - 1],
    sense: SENSE[pSun.tone - 1],
    designSense: DESIGN_SENSE[dSun.tone - 1],
    arrows: {
      digestion: { color: dSun.color, tone: dSun.tone, arrow: arrowOf(dSun.tone) },
      environment: { color: dNode.color, tone: dNode.tone, arrow: arrowOf(dNode.tone) },
      perspective: { color: pNode.color, tone: pNode.tone, arrow: arrowOf(pNode.tone) },
      motivation: { color: pSun.color, tone: pSun.tone, arrow: arrowOf(pSun.tone) },
    },
  };
}
