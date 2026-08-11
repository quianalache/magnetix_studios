/**
 * Incarnation Cross — real, complete 192-entry table pulled directly from
 * her own paid Bodygraph account's real Chart Content tool (2026-08-09),
 * not guessed or reverse-engineered from a partial spec. She found it
 * herself: Chart Content > HHD > Incarnation Cross lists every cross name
 * next to the exact 4 gates that define it — Personality Sun/Earth and
 * Design Sun/Earth. Extracted programmatically from that real page,
 * cross-checked against 5 of her own real saved charts (Quiana Ross,
 * Alex Davis, Jenna Marbles, Kristina Ruffolo, Ethan Ross) — every single
 * one matched exactly, including the rare Juxtaposition case.
 *
 * The cross TYPE (Right Angle / Left Angle / Juxtaposition) is a pure
 * function of Profile — sourced from real Human Design reference material
 * (geneticmatrix.com, 2026-08-09) and independently confirmed against
 * those same 5 real charts, 5-for-5:
 *   Right Angle:   1/3, 1/4, 2/4, 2/5, 3/5, 3/6, 4/6
 *   Left Angle:    5/1, 5/2, 6/2, 6/3
 *   Juxtaposition: 4/1 (the only profile that produces one — real,
 *                  confirmed, not a guess, however unusual it sounds)
 *
 * No live API dependency, no ongoing cost — this is real reference data,
 * embedded once, same as gate-data.ts.
 */

export type IncarnationCrossAngle = "rightAngle" | "leftAngle" | "juxtaposition";

const ANGLE_LABEL: Record<IncarnationCrossAngle, string> = {
  rightAngle: "Right Angle Cross",
  leftAngle: "Left Angle Cross",
  juxtaposition: "Juxtaposition Cross",
};

/** Profile string (e.g. "3/6") -> which angle that exact profile always produces. Order matters — "1/4" and "4/1" are different profiles with different natives. */
const ANGLE_BY_PROFILE: Record<string, IncarnationCrossAngle> = {
  "1/3": "rightAngle", "1/4": "rightAngle",
  "2/4": "rightAngle", "2/5": "rightAngle",
  "3/5": "rightAngle", "3/6": "rightAngle",
  "4/6": "rightAngle",
  "5/1": "leftAngle", "5/2": "leftAngle",
  "6/2": "leftAngle", "6/3": "leftAngle",
  "4/1": "juxtaposition",
};

interface CrossEntry {
  type: IncarnationCrossAngle;
  name: string;
  pSun: number;
  pEarth: number;
  dSun: number;
  dEarth: number;
}

const CROSSES: CrossEntry[] = [
  { type: "rightAngle", name: "Explanation", pSun: 49, pEarth: 4, dSun: 43, dEarth: 23 },
  { type: "rightAngle", name: "Explanation", pSun: 23, pEarth: 43, dSun: 49, dEarth: 4 },
  { type: "rightAngle", name: "Explanation", pSun: 4, pEarth: 49, dSun: 23, dEarth: 43 },
  { type: "rightAngle", name: "Explanation", pSun: 43, pEarth: 23, dSun: 4, dEarth: 49 },
  { type: "rightAngle", name: "The Four Ways", pSun: 24, pEarth: 44, dSun: 19, dEarth: 33 },
  { type: "rightAngle", name: "The Four Ways", pSun: 33, pEarth: 19, dSun: 24, dEarth: 44 },
  { type: "rightAngle", name: "The Four Ways", pSun: 44, pEarth: 24, dSun: 33, dEarth: 19 },
  { type: "rightAngle", name: "The Four Ways", pSun: 19, pEarth: 33, dSun: 44, dEarth: 24 },
  { type: "rightAngle", name: "Laws", pSun: 3, pEarth: 50, dSun: 60, dEarth: 56 },
  { type: "rightAngle", name: "Laws", pSun: 56, pEarth: 60, dSun: 3, dEarth: 50 },
  { type: "rightAngle", name: "Planning", pSun: 40, pEarth: 37, dSun: 16, dEarth: 9 },
  { type: "rightAngle", name: "Planning", pSun: 9, pEarth: 16, dSun: 40, dEarth: 37 },
  { type: "rightAngle", name: "Planning", pSun: 37, pEarth: 40, dSun: 9, dEarth: 16 },
  { type: "rightAngle", name: "Planning", pSun: 16, pEarth: 9, dSun: 37, dEarth: 40 },
  { type: "rightAngle", name: "Rulership", pSun: 47, pEarth: 22, dSun: 45, dEarth: 26 },
  { type: "rightAngle", name: "Rulership", pSun: 26, pEarth: 45, dSun: 47, dEarth: 22 },
  { type: "rightAngle", name: "Rulership", pSun: 22, pEarth: 47, dSun: 26, dEarth: 45 },
  { type: "rightAngle", name: "Rulership", pSun: 45, pEarth: 26, dSun: 22, dEarth: 47 },
  { type: "rightAngle", name: "Service", pSun: 17, pEarth: 18, dSun: 58, dEarth: 52 },
  { type: "rightAngle", name: "Service", pSun: 52, pEarth: 58, dSun: 17, dEarth: 18 },
  { type: "rightAngle", name: "Laws", pSun: 60, pEarth: 56, dSun: 50, dEarth: 3 },
  { type: "rightAngle", name: "Laws", pSun: 50, pEarth: 3, dSun: 56, dEarth: 60 },
  { type: "rightAngle", name: "Maya", pSun: 62, pEarth: 61, dSun: 42, dEarth: 32 },
  { type: "rightAngle", name: "Maya", pSun: 42, pEarth: 32, dSun: 61, dEarth: 62 },
  { type: "rightAngle", name: "Maya", pSun: 61, pEarth: 62, dSun: 32, dEarth: 42 },
  { type: "rightAngle", name: "Maya", pSun: 32, pEarth: 42, dSun: 62, dEarth: 61 },
  { type: "rightAngle", name: "Penetration", pSun: 53, pEarth: 54, dSun: 51, dEarth: 57 },
  { type: "rightAngle", name: "Penetration", pSun: 51, pEarth: 57, dSun: 54, dEarth: 53 },
  { type: "rightAngle", name: "Penetration", pSun: 54, pEarth: 53, dSun: 57, dEarth: 51 },
  { type: "rightAngle", name: "Penetration", pSun: 57, pEarth: 51, dSun: 53, dEarth: 54 },
  { type: "rightAngle", name: "The Sleeping Phoenix", pSun: 20, pEarth: 34, dSun: 55, dEarth: 59 },
  { type: "rightAngle", name: "The Sleeping Phoenix", pSun: 55, pEarth: 59, dSun: 34, dEarth: 20 },
  { type: "rightAngle", name: "Service", pSun: 58, pEarth: 52, dSun: 18, dEarth: 17 },
  { type: "rightAngle", name: "Service", pSun: 18, pEarth: 17, dSun: 52, dEarth: 58 },
  { type: "rightAngle", name: "The Sphinx", pSun: 2, pEarth: 1, dSun: 13, dEarth: 7 },
  { type: "rightAngle", name: "The Sphinx", pSun: 13, pEarth: 7, dSun: 1, dEarth: 2 },
  { type: "rightAngle", name: "The Sleeping Phoenix", pSun: 34, pEarth: 20, dSun: 59, dEarth: 55 },
  { type: "rightAngle", name: "The Sleeping Phoenix", pSun: 59, pEarth: 55, dSun: 20, dEarth: 34 },
  { type: "rightAngle", name: "The Sphinx", pSun: 1, pEarth: 2, dSun: 7, dEarth: 13 },
  { type: "rightAngle", name: "The Sphinx", pSun: 7, pEarth: 13, dSun: 2, dEarth: 1 },
  { type: "rightAngle", name: "Consciousness", pSun: 63, pEarth: 64, dSun: 5, dEarth: 35 },
  { type: "rightAngle", name: "Consciousness", pSun: 35, pEarth: 5, dSun: 63, dEarth: 64 },
  { type: "rightAngle", name: "Eden", pSun: 12, pEarth: 11, dSun: 36, dEarth: 6 },
  { type: "rightAngle", name: "Eden", pSun: 36, pEarth: 6, dSun: 11, dEarth: 12 },
  { type: "rightAngle", name: "Contagion", pSun: 14, pEarth: 8, dSun: 29, dEarth: 30 },
  { type: "rightAngle", name: "Contagion", pSun: 29, pEarth: 30, dSun: 8, dEarth: 14 },
  { type: "rightAngle", name: "Contagion", pSun: 8, pEarth: 14, dSun: 30, dEarth: 29 },
  { type: "rightAngle", name: "Contagion", pSun: 30, pEarth: 29, dSun: 14, dEarth: 8 },
  { type: "rightAngle", name: "Consciousness", pSun: 5, pEarth: 35, dSun: 64, dEarth: 63 },
  { type: "rightAngle", name: "Consciousness", pSun: 64, pEarth: 63, dSun: 35, dEarth: 5 },
  { type: "rightAngle", name: "Eden", pSun: 11, pEarth: 12, dSun: 6, dEarth: 36 },
  { type: "rightAngle", name: "Eden", pSun: 6, pEarth: 36, dSun: 12, dEarth: 11 },
  { type: "rightAngle", name: "The Vessel of Love", pSun: 25, pEarth: 46, dSun: 10, dEarth: 15 },
  { type: "rightAngle", name: "The Vessel of Love", pSun: 15, pEarth: 10, dSun: 25, dEarth: 46 },
  { type: "rightAngle", name: "The Unexpected", pSun: 27, pEarth: 28, dSun: 41, dEarth: 31 },
  { type: "rightAngle", name: "The Unexpected", pSun: 31, pEarth: 41, dSun: 27, dEarth: 28 },
  { type: "rightAngle", name: "The Unexpected", pSun: 28, pEarth: 27, dSun: 31, dEarth: 41 },
  { type: "rightAngle", name: "The Unexpected", pSun: 41, pEarth: 31, dSun: 28, dEarth: 27 },
  { type: "rightAngle", name: "Tension", pSun: 21, pEarth: 48, dSun: 38, dEarth: 39 },
  { type: "rightAngle", name: "Tension", pSun: 39, pEarth: 38, dSun: 21, dEarth: 48 },
  { type: "rightAngle", name: "Tension", pSun: 48, pEarth: 21, dSun: 39, dEarth: 38 },
  { type: "rightAngle", name: "Tension", pSun: 38, pEarth: 39, dSun: 48, dEarth: 21 },
  { type: "rightAngle", name: "The Vessel of Love", pSun: 10, pEarth: 15, dSun: 46, dEarth: 25 },
  { type: "rightAngle", name: "The Vessel of Love", pSun: 46, pEarth: 25, dSun: 15, dEarth: 10 },
  { type: "leftAngle", name: "The Alpha", pSun: 41, pEarth: 31, dSun: 44, dEarth: 24 },
  { type: "leftAngle", name: "The Alpha", pSun: 31, pEarth: 41, dSun: 24, dEarth: 44 },
  { type: "leftAngle", name: "Alignment", pSun: 28, pEarth: 27, dSun: 33, dEarth: 19 },
  { type: "leftAngle", name: "Alignment", pSun: 27, pEarth: 28, dSun: 19, dEarth: 33 },
  { type: "leftAngle", name: "The Clarion", pSun: 57, pEarth: 51, dSun: 62, dEarth: 61 },
  { type: "leftAngle", name: "The Clarion", pSun: 51, pEarth: 57, dSun: 61, dEarth: 62 },
  { type: "leftAngle", name: "Cycles", pSun: 53, pEarth: 54, dSun: 42, dEarth: 32 },
  { type: "leftAngle", name: "Cycles", pSun: 54, pEarth: 53, dSun: 32, dEarth: 42 },
  { type: "leftAngle", name: "Confrontation", pSun: 45, pEarth: 26, dSun: 36, dEarth: 6 },
  { type: "leftAngle", name: "Confrontation", pSun: 26, pEarth: 45, dSun: 6, dEarth: 36 },
  { type: "leftAngle", name: "Defiance", pSun: 2, pEarth: 1, dSun: 49, dEarth: 4 },
  { type: "leftAngle", name: "Defiance", pSun: 1, pEarth: 2, dSun: 4, dEarth: 49 },
  { type: "leftAngle", name: "Dedication", pSun: 23, pEarth: 43, dSun: 30, dEarth: 29 },
  { type: "leftAngle", name: "Dedication", pSun: 43, pEarth: 23, dSun: 29, dEarth: 30 },
  { type: "leftAngle", name: "Demands", pSun: 52, pEarth: 58, dSun: 21, dEarth: 48 },
  { type: "leftAngle", name: "Demands", pSun: 58, pEarth: 52, dSun: 48, dEarth: 21 },
  { type: "leftAngle", name: "Endeavor", pSun: 48, pEarth: 21, dSun: 53, dEarth: 54 },
  { type: "leftAngle", name: "Endeavor", pSun: 21, pEarth: 48, dSun: 54, dEarth: 53 },
  { type: "leftAngle", name: "Duality", pSun: 34, pEarth: 20, dSun: 40, dEarth: 37 },
  { type: "leftAngle", name: "Duality", pSun: 20, pEarth: 34, dSun: 37, dEarth: 40 },
  { type: "leftAngle", name: "Education", pSun: 11, pEarth: 12, dSun: 46, dEarth: 25 },
  { type: "leftAngle", name: "Education", pSun: 12, pEarth: 11, dSun: 25, dEarth: 46 },
  { type: "leftAngle", name: "Distraction", pSun: 60, pEarth: 56, dSun: 28, dEarth: 27 },
  { type: "leftAngle", name: "Distraction", pSun: 56, pEarth: 60, dSun: 27, dEarth: 28 },
  { type: "leftAngle", name: "Dominion", pSun: 64, pEarth: 63, dSun: 45, dEarth: 26 },
  { type: "leftAngle", name: "Dominion", pSun: 63, pEarth: 64, dSun: 26, dEarth: 45 },
  { type: "leftAngle", name: "Industry", pSun: 30, pEarth: 29, dSun: 34, dEarth: 20 },
  { type: "leftAngle", name: "Industry", pSun: 29, pEarth: 30, dSun: 20, dEarth: 34 },
  { type: "leftAngle", name: "Incarnation", pSun: 24, pEarth: 44, dSun: 13, dEarth: 7 },
  { type: "leftAngle", name: "Incarnation", pSun: 44, pEarth: 24, dSun: 7, dEarth: 13 },
  { type: "leftAngle", name: "Individualism", pSun: 39, pEarth: 38, dSun: 51, dEarth: 57 },
  { type: "leftAngle", name: "Individualism", pSun: 38, pEarth: 39, dSun: 57, dEarth: 51 },
  { type: "leftAngle", name: "Healing", pSun: 25, pEarth: 46, dSun: 58, dEarth: 52 },
  { type: "leftAngle", name: "Healing", pSun: 46, pEarth: 25, dSun: 52, dEarth: 58 },
  { type: "leftAngle", name: "Identification", pSun: 16, pEarth: 9, dSun: 63, dEarth: 64 },
  { type: "leftAngle", name: "Identification", pSun: 9, pEarth: 16, dSun: 64, dEarth: 63 },
  { type: "leftAngle", name: "Masks", pSun: 13, pEarth: 7, dSun: 43, dEarth: 23 },
  { type: "leftAngle", name: "Masks", pSun: 7, pEarth: 13, dSun: 23, dEarth: 43 },
  { type: "leftAngle", name: "Migration", pSun: 37, pEarth: 40, dSun: 5, dEarth: 35 },
  { type: "leftAngle", name: "Migration", pSun: 40, pEarth: 37, dSun: 35, dEarth: 5 },
  { type: "leftAngle", name: "Informing", pSun: 22, pEarth: 47, dSun: 11, dEarth: 12 },
  { type: "leftAngle", name: "Informing", pSun: 47, pEarth: 22, dSun: 12, dEarth: 11 },
  { type: "leftAngle", name: "Limitation", pSun: 42, pEarth: 32, dSun: 60, dEarth: 56 },
  { type: "leftAngle", name: "Limitation", pSun: 32, pEarth: 42, dSun: 56, dEarth: 60 },
  { type: "leftAngle", name: "Obscuration", pSun: 62, pEarth: 61, dSun: 3, dEarth: 50 },
  { type: "leftAngle", name: "Obscuration", pSun: 61, pEarth: 62, dSun: 50, dEarth: 3 },
  { type: "leftAngle", name: "Wishes", pSun: 3, pEarth: 50, dSun: 41, dEarth: 31 },
  { type: "leftAngle", name: "Wishes", pSun: 50, pEarth: 3, dSun: 31, dEarth: 41 },
  { type: "leftAngle", name: "Upheaval", pSun: 17, pEarth: 18, dSun: 38, dEarth: 39 },
  { type: "leftAngle", name: "Upheaval", pSun: 18, pEarth: 17, dSun: 39, dEarth: 38 },
  { type: "leftAngle", name: "Uncertainty", pSun: 8, pEarth: 14, dSun: 55, dEarth: 59 },
  { type: "leftAngle", name: "Uncertainty", pSun: 14, pEarth: 8, dSun: 59, dEarth: 55 },
  { type: "leftAngle", name: "Spirit", pSun: 55, pEarth: 59, dSun: 9, dEarth: 16 },
  { type: "leftAngle", name: "Spirit", pSun: 59, pEarth: 55, dSun: 16, dEarth: 9 },
  { type: "leftAngle", name: "Refinement", pSun: 19, pEarth: 33, dSun: 1, dEarth: 2 },
  { type: "leftAngle", name: "Refinement", pSun: 33, pEarth: 19, dSun: 2, dEarth: 1 },
  { type: "leftAngle", name: "Revolution", pSun: 4, pEarth: 49, dSun: 8, dEarth: 14 },
  { type: "leftAngle", name: "Revolution", pSun: 49, pEarth: 4, dSun: 14, dEarth: 8 },
  { type: "leftAngle", name: "The Plane", pSun: 6, pEarth: 36, dSun: 15, dEarth: 10 },
  { type: "leftAngle", name: "The Plane", pSun: 36, pEarth: 6, dSun: 10, dEarth: 15 },
  { type: "leftAngle", name: "Prevention", pSun: 10, pEarth: 15, dSun: 18, dEarth: 17 },
  { type: "leftAngle", name: "Prevention", pSun: 15, pEarth: 10, dSun: 17, dEarth: 18 },
  { type: "leftAngle", name: "Separation", pSun: 5, pEarth: 35, dSun: 47, dEarth: 22 },
  { type: "leftAngle", name: "Separation", pSun: 35, pEarth: 5, dSun: 22, dEarth: 47 },
  { type: "juxtaposition", name: "Beginnings", pSun: 53, pEarth: 54, dSun: 42, dEarth: 32 },
  { type: "juxtaposition", name: "Bargains", pSun: 37, pEarth: 40, dSun: 5, dEarth: 35 },
  { type: "juxtaposition", name: "Caring", pSun: 27, pEarth: 28, dSun: 19, dEarth: 33 },
  { type: "juxtaposition", name: "Behavior", pSun: 10, pEarth: 15, dSun: 18, dEarth: 17 },
  { type: "juxtaposition", name: "Ambition", pSun: 54, pEarth: 53, dSun: 32, dEarth: 42 },
  { type: "juxtaposition", name: "Alertness", pSun: 44, pEarth: 24, dSun: 7, dEarth: 13 },
  { type: "juxtaposition", name: "Assimilation", pSun: 23, pEarth: 43, dSun: 30, dEarth: 29 },
  { type: "juxtaposition", name: "Articulation", pSun: 12, pEarth: 11, dSun: 25, dEarth: 46 },
  { type: "juxtaposition", name: "Completion", pSun: 42, pEarth: 32, dSun: 60, dEarth: 56 },
  { type: "juxtaposition", name: "Commitment", pSun: 29, pEarth: 30, dSun: 20, dEarth: 34 },
  { type: "juxtaposition", name: "Mutation", pSun: 3, pEarth: 50, dSun: 41, dEarth: 31 },
  { type: "juxtaposition", name: "Moods", pSun: 55, pEarth: 59, dSun: 9, dEarth: 16 },
  { type: "juxtaposition", name: "The Now", pSun: 20, pEarth: 34, dSun: 37, dEarth: 40 },
  { type: "juxtaposition", name: "Need", pSun: 19, pEarth: 33, dSun: 1, dEarth: 2 },
  { type: "juxtaposition", name: "Opposition", pSun: 38, pEarth: 39, dSun: 57, dEarth: 51 },
  { type: "juxtaposition", name: "Opinions", pSun: 17, pEarth: 18, dSun: 38, dEarth: 39 },
  { type: "juxtaposition", name: "Possession", pSun: 45, pEarth: 26, dSun: 36, dEarth: 6 },
  { type: "juxtaposition", name: "Oppression", pSun: 47, pEarth: 22, dSun: 12, dEarth: 11 },
  { type: "juxtaposition", name: "Principles", pSun: 49, pEarth: 4, dSun: 14, dEarth: 8 },
  { type: "juxtaposition", name: "Power", pSun: 34, pEarth: 20, dSun: 40, dEarth: 37 },
  { type: "juxtaposition", name: "Provocation", pSun: 39, pEarth: 38, dSun: 51, dEarth: 57 },
  { type: "juxtaposition", name: "Rationalization", pSun: 24, pEarth: 44, dSun: 13, dEarth: 7 },
  { type: "juxtaposition", name: "Retreat", pSun: 33, pEarth: 19, dSun: 2, dEarth: 1 },
  { type: "juxtaposition", name: "Risks", pSun: 28, pEarth: 27, dSun: 33, dEarth: 19 },
  { type: "juxtaposition", name: "Self-expression", pSun: 1, pEarth: 2, dSun: 4, dEarth: 49 },
  { type: "juxtaposition", name: "Serendipity", pSun: 46, pEarth: 25, dSun: 52, dEarth: 58 },
  { type: "juxtaposition", name: "Shock", pSun: 51, pEarth: 57, dSun: 61, dEarth: 62 },
  { type: "juxtaposition", name: "Stillness", pSun: 52, pEarth: 58, dSun: 21, dEarth: 48 },
  { type: "juxtaposition", name: "Stimulation", pSun: 56, pEarth: 60, dSun: 27, dEarth: 28 },
  { type: "juxtaposition", name: "Strategy", pSun: 59, pEarth: 55, dSun: 16, dEarth: 9 },
  { type: "juxtaposition", name: "Vitality", pSun: 58, pEarth: 52, dSun: 48, dEarth: 21 },
  { type: "juxtaposition", name: "Values", pSun: 50, pEarth: 3, dSun: 31, dEarth: 41 },
  { type: "juxtaposition", name: "The Trickster", pSun: 26, pEarth: 45, dSun: 6, dEarth: 36 },
  { type: "juxtaposition", name: "Thinking", pSun: 61, pEarth: 62, dSun: 50, dEarth: 3 },
  { type: "juxtaposition", name: "Control", pSun: 21, pEarth: 48, dSun: 54, dEarth: 53 },
  { type: "juxtaposition", name: "Correction", pSun: 18, pEarth: 17, dSun: 39, dEarth: 38 },
  { type: "juxtaposition", name: "Crisis", pSun: 36, pEarth: 6, dSun: 10, dEarth: 15 },
  { type: "juxtaposition", name: "Denial", pSun: 40, pEarth: 37, dSun: 35, dEarth: 5 },
  { type: "juxtaposition", name: "Conflict", pSun: 6, pEarth: 36, dSun: 15, dEarth: 10 },
  { type: "juxtaposition", name: "Confusion", pSun: 64, pEarth: 63, dSun: 45, dEarth: 26 },
  { type: "juxtaposition", name: "Conservation", pSun: 32, pEarth: 42, dSun: 56, dEarth: 60 },
  { type: "juxtaposition", name: "Contribution", pSun: 8, pEarth: 14, dSun: 55, dEarth: 59 },
  { type: "juxtaposition", name: "Depth", pSun: 48, pEarth: 21, dSun: 53, dEarth: 54 },
  { type: "juxtaposition", name: "Detail", pSun: 62, pEarth: 61, dSun: 3, dEarth: 50 },
  { type: "juxtaposition", name: "Fates", pSun: 30, pEarth: 29, dSun: 34, dEarth: 20 },
  { type: "juxtaposition", name: "Fantasy", pSun: 41, pEarth: 31, dSun: 44, dEarth: 24 },
  { type: "juxtaposition", name: "Extremes", pSun: 15, pEarth: 10, dSun: 17, dEarth: 18 },
  { type: "juxtaposition", name: "Experimentation", pSun: 16, pEarth: 9, dSun: 63, dEarth: 64 },
  { type: "juxtaposition", name: "Experience", pSun: 35, pEarth: 5, dSun: 22, dEarth: 47 },
  { type: "juxtaposition", name: "Empowering", pSun: 14, pEarth: 8, dSun: 59, dEarth: 55 },
  { type: "juxtaposition", name: "The Driver", pSun: 2, pEarth: 1, dSun: 49, dEarth: 4 },
  { type: "juxtaposition", name: "Doubts", pSun: 63, pEarth: 64, dSun: 26, dEarth: 45 },
  { type: "juxtaposition", name: "Formulization", pSun: 4, pEarth: 49, dSun: 8, dEarth: 14 },
  { type: "juxtaposition", name: "Focus", pSun: 9, pEarth: 16, dSun: 64, dEarth: 63 },
  { type: "juxtaposition", name: "Interaction", pSun: 7, pEarth: 13, dSun: 23, dEarth: 43 },
  { type: "juxtaposition", name: "Intuition", pSun: 57, pEarth: 51, dSun: 62, dEarth: 61 },
  { type: "juxtaposition", name: "Innocence", pSun: 25, pEarth: 46, dSun: 58, dEarth: 52 },
  { type: "juxtaposition", name: "Insight", pSun: 43, pEarth: 23, dSun: 29, dEarth: 30 },
  { type: "juxtaposition", name: "Ideas", pSun: 11, pEarth: 12, dSun: 46, dEarth: 25 },
  { type: "juxtaposition", name: "Influence", pSun: 31, pEarth: 41, dSun: 24, dEarth: 44 },
  { type: "juxtaposition", name: "Grace", pSun: 22, pEarth: 47, dSun: 11, dEarth: 12 },
  { type: "juxtaposition", name: "Habits", pSun: 5, pEarth: 35, dSun: 47, dEarth: 22 },
  { type: "juxtaposition", name: "Limitation", pSun: 60, pEarth: 56, dSun: 28, dEarth: 27 },
  { type: "juxtaposition", name: "Listening", pSun: 13, pEarth: 7, dSun: 43, dEarth: 23 },
];

export interface IncarnationCrossResult {
  /** e.g. "Right Angle Cross of Rulership (47/22 | 45/26)" — same format as her real chart. */
  label: string;
  name: string;
  angle: IncarnationCrossAngle;
}

/**
 * Looks up the real Incarnation Cross for a chart's 4 defining gates.
 * Returns null only if the profile isn't one of the 12 real Human Design
 * profiles (should never happen from a real calculated chart) or the
 * specific gate combination genuinely isn't in the table — surfaced
 * honestly rather than guessed at.
 */
export function resolveIncarnationCross(
  profile: string | null,
  pSun: number,
  pEarth: number,
  dSun: number,
  dEarth: number,
): IncarnationCrossResult | null {
  if (!profile) return null;
  const angle = ANGLE_BY_PROFILE[profile];
  if (!angle) return null;
  const entry = CROSSES.find(
    (c) => c.type === angle && c.pSun === pSun && c.pEarth === pEarth && c.dSun === dSun && c.dEarth === dEarth,
  );
  if (!entry) return null;
  return {
    name: entry.name,
    angle,
    label: `${ANGLE_LABEL[angle]} of ${entry.name} (${pSun}/${pEarth} | ${dSun}/${dEarth})`,
  };
}

export interface CrossAngleContent {
  angle: IncarnationCrossAngle;
  /** One short framing sentence, standard Human Design teaching on what each Cross angle means about the direction a life's fulfillment tends to run in. Added 2026-08-11 for the local Skills & Attributes replacement's optional framing line (human-design-skills-service.ts) — only 3 possible values, so this stays 3 entries, not a per-Cross-name essay. */
  framing: string;
}

/**
 * Right Angle / Left Angle / Juxtaposition — standard Human Design
 * teaching on what the Cross *angle* itself means (distinct from the 192
 * individual Cross names above, which are gate-pair-specific). Right Angle
 * crosses run personal-first (fulfillment through living one's own
 * process); Left Angle crosses run transpersonal (fulfillment through
 * role and contribution to others); Juxtaposition is the rare single
 * profile (4/1) that fuses both at once. Original wording, written fresh
 * for this file, not sourced from Bodygraph.
 */
export const CROSS_ANGLE_CONTENT: Record<IncarnationCrossAngle, CrossAngleContent> = {
  rightAngle: {
    angle: "rightAngle",
    framing: "A personal life theme — fulfillment comes from living out your own process first; the impact on others follows from that, not the other way around.",
  },
  leftAngle: {
    angle: "leftAngle",
    framing: "A transpersonal life theme — your path is genuinely interwoven with others' needs; fulfillment comes through role and contribution more than solo agenda.",
  },
  juxtaposition: {
    angle: "juxtaposition",
    framing: "A rare, singular life theme — the only profile that fuses personal and transpersonal direction into one, rather than running toward either.",
  },
};
