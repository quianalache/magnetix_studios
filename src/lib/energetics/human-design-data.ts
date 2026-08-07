/**
 * The canonical Human Design bodygraph reference data — the fixed mapping
 * of all 64 gates to the 9 centers, and the 36 channels (gate pairs) that
 * connect them. This is well-known, public-domain system data (the same
 * bodygraph every Human Design chart calculator uses, originating from Ra
 * Uru Hu's Human Design System), not proprietary to any one tool.
 *
 * Cross-checked 2026-08-08 against the MIT-licensed open-source
 * `free-human-design` engine (github.com/adamblvck/free-human-design,
 * © 2026 Adam Blvck / Blvck Studios) — this file's GATE_CENTER and
 * CHANNEL_GATE_PAIRS tables are adapted directly from its `src/hd/
 * bodygraph.js`, translated to TypeScript. Worth noting: its gate-wheel
 * ordering (`src/calc/mandala.js`) was independently verified against this
 * app's own `GATE_WHEEL_ORDER` (gate-data.ts) — built from a completely
 * different reference tool — and the two produce an identical 64-gate
 * sequence once aligned to the same starting point. Real independent
 * confirmation, not just one source trusted blind.
 */

export type CenterKey =
  | "head"
  | "ajna"
  | "throat"
  | "g"
  | "heart"
  | "sacral"
  | "solarplexus"
  | "spleen"
  | "root";

export const CENTERS: readonly CenterKey[] = [
  "head",
  "ajna",
  "throat",
  "g",
  "heart",
  "sacral",
  "solarplexus",
  "spleen",
  "root",
];

export const CENTER_LABELS: Record<CenterKey, string> = {
  head: "Head",
  ajna: "Ajna",
  throat: "Throat",
  g: "G (Identity)",
  heart: "Heart (Ego/Will)",
  sacral: "Sacral",
  solarplexus: "Solar Plexus",
  spleen: "Spleen",
  root: "Root",
};

/** Sources of energy/pressure that, when connected to the Throat, can power manifestation. */
export const MOTOR_CENTERS: readonly CenterKey[] = ["sacral", "heart", "solarplexus", "root"];

/** Gate → center. All 64 gates appear exactly once. */
export const GATE_CENTER: Record<number, CenterKey> = {
  // Head (Crown)
  64: "head", 61: "head", 63: "head",
  // Ajna
  47: "ajna", 24: "ajna", 4: "ajna", 17: "ajna", 11: "ajna", 43: "ajna",
  // Throat
  62: "throat", 23: "throat", 56: "throat", 35: "throat", 12: "throat", 45: "throat",
  33: "throat", 8: "throat", 31: "throat", 20: "throat", 16: "throat",
  // G (Identity / Self)
  1: "g", 13: "g", 25: "g", 46: "g", 2: "g", 15: "g", 10: "g", 7: "g",
  // Heart (Ego / Will)
  21: "heart", 40: "heart", 26: "heart", 51: "heart",
  // Spleen
  48: "spleen", 57: "spleen", 44: "spleen", 50: "spleen", 32: "spleen", 28: "spleen", 18: "spleen",
  // Sacral
  34: "sacral", 5: "sacral", 14: "sacral", 29: "sacral", 59: "sacral", 9: "sacral",
  3: "sacral", 42: "sacral", 27: "sacral",
  // Solar Plexus (Emotional)
  6: "solarplexus", 37: "solarplexus", 30: "solarplexus", 55: "solarplexus",
  49: "solarplexus", 22: "solarplexus", 36: "solarplexus",
  // Root
  53: "root", 60: "root", 52: "root", 19: "root", 39: "root", 41: "root",
  58: "root", 38: "root", 54: "root",
};

/** The 36 channels as gate pairs — fixed by the system, [lower, higher] gate number. */
export const CHANNEL_GATE_PAIRS: readonly (readonly [number, number])[] = [
  [1, 8], [2, 14], [3, 60], [4, 63], [5, 15], [6, 59], [7, 31], [9, 52],
  [10, 20], [10, 34], [10, 57], [11, 56], [12, 22], [13, 33], [16, 48], [17, 62],
  [18, 58], [19, 49], [20, 34], [20, 57], [21, 45], [23, 43], [24, 61], [25, 51],
  [26, 44], [27, 50], [28, 38], [29, 46], [30, 41], [32, 54], [34, 57], [35, 36],
  [37, 40], [39, 55], [42, 53], [47, 64],
];

/** Human-readable channel names — nice-to-have for display, not required for derivation. */
export const CHANNEL_NAMES: Record<string, string> = {
  "1-8": "Inspiration", "2-14": "The Beat", "3-60": "Mutation", "4-63": "Logic",
  "5-15": "Rhythm", "6-59": "Mating", "7-31": "The Alpha", "9-52": "Concentration",
  "10-20": "Awakening", "10-34": "Exploration", "10-57": "Perfected Form",
  "11-56": "Curiosity", "12-22": "Openness", "13-33": "The Prodigal",
  "16-48": "The Wavelength", "17-62": "Acceptance", "18-58": "Judgment",
  "19-49": "Synthesis", "20-34": "Charisma", "20-57": "The Brainwave",
  "21-45": "Money", "23-43": "Structuring", "24-61": "Awareness", "25-51": "Initiation",
  "26-44": "Surrender", "27-50": "Preservation", "28-38": "Struggle",
  "29-46": "Discovery", "30-41": "Recognition", "32-54": "Transformation",
  "34-57": "Power", "35-36": "Transitoriness", "37-40": "Community",
  "39-55": "Emoting", "42-53": "Maturation", "47-64": "Abstraction",
};

export interface Channel {
  key: string;
  gates: readonly [number, number];
  centers: readonly [CenterKey, CenterKey];
  name: string | null;
}

function channelKey(a: number, b: number): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${lo}-${hi}`;
}

export const CHANNELS: readonly Channel[] = CHANNEL_GATE_PAIRS.map(([a, b]) => {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const key = channelKey(lo, hi);
  return {
    key,
    gates: [lo, hi] as const,
    centers: [GATE_CENTER[lo], GATE_CENTER[hi]] as const,
    name: CHANNEL_NAMES[key] ?? null,
  };
});
