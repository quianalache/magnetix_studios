import "server-only";

import { Body } from "astronomy-engine";
import {
  eclipticLongitude,
  findDesignTime,
  longitudeToGateLine,
  northNodeLongitude,
  parseBirthToUtc,
  type WallClockBirthInput,
} from "./gate-wheel";
import type { HumanDesignVariables } from "./bodygraph-api";
import { resolveIncarnationCross } from "./incarnation-cross-data";
import {
  CENTERS,
  CHANNELS,
  MOTOR_CENTERS,
  type CenterKey,
  type Channel,
} from "./human-design-data";

/**
 * Human Design bodygraph calculator. Reuses the exact same proven gate-
 * wheel math as Gene Keys (gate-wheel.ts) — same Personality/Design dual-
 * chart mechanic, same 88°-solar-arc Design-time search — just computes
 * all 13 activation points Human Design uses (Gene Keys only needs 6) and
 * derives Type/Authority/Profile/Definition from the resulting gate
 * pattern, using the standard Ra Uru Hu / Jovian Archive bodygraph rules
 * (see human-design-data.ts for provenance).
 *
 * The lunar Nodes' true longitude comes from `northNodeLongitude` in
 * gate-wheel.ts (moved there 2026-08-09 so Astrology's Node fields can
 * reuse the exact same calculation). South Node is always exactly 180°
 * from North Node.
 */

export type HdBodyName =
  | "sun"
  | "earth"
  | "moon"
  | "northNode"
  | "southNode"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export interface HdActivation {
  body: HdBodyName;
  gate: number;
  line: number;
}

const ASTRONOMY_ENGINE_BODIES: { body: HdBodyName; engineBody: Body }[] = [
  { body: "moon", engineBody: Body.Moon },
  { body: "mercury", engineBody: Body.Mercury },
  { body: "venus", engineBody: Body.Venus },
  { body: "mars", engineBody: Body.Mars },
  { body: "jupiter", engineBody: Body.Jupiter },
  { body: "saturn", engineBody: Body.Saturn },
  { body: "uranus", engineBody: Body.Uranus },
  { body: "neptune", engineBody: Body.Neptune },
  { body: "pluto", engineBody: Body.Pluto },
];

function computeActivations(date: Date): HdActivation[] {
  const sunLon = eclipticLongitude(Body.Sun, date);
  const northNodeLon = northNodeLongitude(date);

  const longitudes: { body: HdBodyName; lon: number }[] = [
    { body: "sun", lon: sunLon },
    { body: "earth", lon: (sunLon + 180) % 360 },
    { body: "northNode", lon: northNodeLon },
    { body: "southNode", lon: (northNodeLon + 180) % 360 },
    ...ASTRONOMY_ENGINE_BODIES.map(({ body, engineBody }) => ({
      body,
      lon: eclipticLongitude(engineBody, date),
    })),
  ];

  return longitudes.map(({ body, lon }) => {
    const { gate, line } = longitudeToGateLine(lon);
    return { body, gate, line };
  });
}

// ── bodygraph derivation ────────────────────────────────────────────────

function buildAdjacency(
  definedCenters: Set<CenterKey>,
  definedChannels: readonly Channel[],
): Map<CenterKey, Set<CenterKey>> {
  const adj = new Map<CenterKey, Set<CenterKey>>();
  for (const c of definedCenters) adj.set(c, new Set());
  for (const ch of definedChannels) {
    const [c1, c2] = ch.centers;
    if (adj.has(c1) && adj.has(c2)) {
      adj.get(c1)!.add(c2);
      adj.get(c2)!.add(c1);
    }
  }
  return adj;
}

/** BFS reachability from `start` to the Throat, through defined centers only. */
function centerReachesThroat(
  start: CenterKey,
  definedCenters: Set<CenterKey>,
  definedChannels: readonly Channel[],
): boolean {
  if (!definedCenters.has("throat") || !definedCenters.has(start)) return false;
  const adj = buildAdjacency(definedCenters, definedChannels);
  const seen = new Set<CenterKey>([start]);
  const queue: CenterKey[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === "throat") return true;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

function anyMotorReachesThroat(
  definedCenters: Set<CenterKey>,
  definedChannels: readonly Channel[],
): boolean {
  return MOTOR_CENTERS.some(
    (m) => definedCenters.has(m) && centerReachesThroat(m, definedCenters, definedChannels),
  );
}

export type HdType = "Manifestor" | "Generator" | "Manifesting Generator" | "Projector" | "Reflector";

function determineType(
  definedCenters: Set<CenterKey>,
  definedChannels: readonly Channel[],
): HdType {
  if (definedCenters.size === 0) return "Reflector";
  const sacral = definedCenters.has("sacral");
  const motorThroat = anyMotorReachesThroat(definedCenters, definedChannels);
  if (sacral) return motorThroat ? "Manifesting Generator" : "Generator";
  return motorThroat ? "Manifestor" : "Projector";
}

export type HdAuthority =
  | "Emotional (Solar Plexus)"
  | "Sacral"
  | "Splenic"
  | "Ego (Heart)"
  | "Self-Projected (G)"
  | "Mental (Environmental)"
  | "Lunar (Reflector)";

/** Standard priority order — the first center in this list that's defined wins. */
function determineAuthority(
  definedCenters: Set<CenterKey>,
  definedChannels: readonly Channel[],
): HdAuthority {
  if (definedCenters.size === 0) return "Lunar (Reflector)";
  if (definedCenters.has("solarplexus")) return "Emotional (Solar Plexus)";
  if (definedCenters.has("sacral")) return "Sacral";
  if (definedCenters.has("spleen")) return "Splenic";
  if (definedCenters.has("heart")) return "Ego (Heart)";
  if (definedCenters.has("g") && centerReachesThroat("g", definedCenters, definedChannels)) {
    return "Self-Projected (G)";
  }
  return "Mental (Environmental)";
}

const DEFINITION_LABELS: Record<number, string> = {
  0: "No Definition",
  1: "Single Definition",
  2: "Split Definition",
  3: "Triple Split Definition",
  4: "Quadruple Split Definition",
};

/** Number of separate connected groups the defined centers form via defined channels — NOT the channel count (a mislabeling in some reference implementations). 0 = Reflector's "No Definition". */
function countDefinitionGroups(
  definedCenters: Set<CenterKey>,
  definedChannels: readonly Channel[],
): number {
  if (definedCenters.size === 0) return 0;
  const adj = buildAdjacency(definedCenters, definedChannels);
  const seen = new Set<CenterKey>();
  let groups = 0;
  for (const start of definedCenters) {
    if (seen.has(start)) continue;
    groups++;
    const queue: CenterKey[] = [start];
    seen.add(start);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  return groups;
}

/**
 * Signature / Not-Self Theme — a straight 5-row lookup keyed by Type, the
 * standard Ra Uru Hu / Jovian Archive pairing (confirmed against a real
 * Bodygraph API response 2026-08-09: Reflector → Surprise/Disappointment,
 * matching exactly). Trivial by design — no derivation needed, just Type.
 */
const SIGNATURE_BY_TYPE: Record<HdType, { signature: string; notSelfTheme: string; strategy: string }> = {
  "Manifestor": { signature: "Peace", notSelfTheme: "Anger", strategy: "To Inform" },
  "Generator": { signature: "Satisfaction", notSelfTheme: "Frustration", strategy: "To Respond" },
  "Manifesting Generator": { signature: "Satisfaction", notSelfTheme: "Frustration", strategy: "To Respond" },
  "Projector": { signature: "Success", notSelfTheme: "Bitterness", strategy: "Wait for the Invitation" },
  "Reflector": { signature: "Surprise", notSelfTheme: "Disappointment", strategy: "Wait a Lunar Cycle" },
};

export interface HumanDesignProfile {
  type: HdType;
  authority: HdAuthority;
  /** Personality Sun line / Design Sun line, e.g. "1/3". Null only if the calculation somehow failed to find either Sun activation. */
  profile: string | null;
  definitionLabel: string;
  signature: string;
  notSelfTheme: string;
  strategy: string;
  /** ISO instant of the Design calculation — real value existed internally since this engine shipped, never exposed on the returned profile until now (2026-08-09). */
  designDateUtc: string;
  /** e.g. "Right Angle Cross of Rulership (47/22 | 45/26)" — real 192-entry lookup, see incarnation-cross-data.ts. Null only if Sun/Earth activations are somehow missing. */
  incarnationCross: string | null;
  activatedGates: number[];
  definedCenters: CenterKey[];
  openCenters: CenterKey[];
  definedChannels: Channel[];
  personality: HdActivation[];
  design: HdActivation[];
  /**
   * The 6 Variables + Skills/Attributes — from Bodygraph's paid API
   * (2026-08-09), not this free local engine (see bodygraph-api.ts for
   * why). Populated by the caller (energetic-decoder-service.ts) after
   * calculateHumanDesignProfile runs, since this function stays a pure,
   * synchronous, free calculation — undefined when the API key is unset
   * or the call fails, never a broken reading.
   */
  variables?: HumanDesignVariables;
  /** Bodygraph's own rendered chart SVG — see bodygraph-api.ts. Same "populated by the caller after the fact" contract as `variables` above; undefined falls back to this app's own HumanDesignChart component. */
  bodygraphSvg?: string;
}

export function calculateHumanDesignProfile(
  input: WallClockBirthInput,
): HumanDesignProfile {
  const birthUtc = parseBirthToUtc(input);
  const personalitySun = eclipticLongitude(Body.Sun, birthUtc);
  const designTime = findDesignTime(birthUtc, personalitySun);

  const personality = computeActivations(birthUtc);
  const design = computeActivations(designTime);

  const gateSet = new Set([...personality, ...design].map((a) => a.gate));

  const definedChannels = CHANNELS.filter(
    (ch) => gateSet.has(ch.gates[0]) && gateSet.has(ch.gates[1]),
  );
  const definedCentersSet = new Set<CenterKey>();
  for (const ch of definedChannels) {
    definedCentersSet.add(ch.centers[0]);
    definedCentersSet.add(ch.centers[1]);
  }
  const definedCenters = CENTERS.filter((c) => definedCentersSet.has(c));
  const openCenters = CENTERS.filter((c) => !definedCentersSet.has(c));

  const pSun = personality.find((a) => a.body === "sun");
  const pEarth = personality.find((a) => a.body === "earth");
  const dSun = design.find((a) => a.body === "sun");
  const dEarth = design.find((a) => a.body === "earth");
  const profile = pSun && dSun ? `${pSun.line}/${dSun.line}` : null;
  const incarnationCross =
    pSun && pEarth && dSun && dEarth
      ? resolveIncarnationCross(profile, pSun.gate, pEarth.gate, dSun.gate, dEarth.gate)?.label ?? null
      : null;

  const groups = countDefinitionGroups(definedCentersSet, definedChannels);
  const type = determineType(definedCentersSet, definedChannels);
  const { signature, notSelfTheme, strategy } = SIGNATURE_BY_TYPE[type];

  return {
    type,
    authority: determineAuthority(definedCentersSet, definedChannels),
    profile,
    definitionLabel: DEFINITION_LABELS[groups] ?? `${groups}-Way Split Definition`,
    signature,
    notSelfTheme,
    strategy,
    designDateUtc: designTime.toISOString(),
    incarnationCross,
    activatedGates: [...gateSet].sort((a, b) => a - b),
    definedCenters,
    openCenters,
    definedChannels,
    personality,
    design,
  };
}
