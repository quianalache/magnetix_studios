import "server-only";

import { Body, MakeTime } from "astronomy-engine";
import { apparent as gastApparentSeconds } from "astronomia/sidereal";
import { meanObliquity, nutation } from "astronomia/nutation";
import {
  eclipticLongitude,
  meanLilithLongitude,
  northNodeLongitude,
  parseBirthToUtc,
  type WallClockBirthInput,
} from "./gate-wheel";

/**
 * Western Tropical natal-chart calculator — Ascendant/MC/houses/aspects.
 * Genuinely new work, unlike Human Design: everything before this used
 * birth PLACE only for its timezone (via `gate-wheel.ts`'s wall-clock →
 * UTC conversion); houses need the actual geographic latitude/longitude,
 * which nothing in this codebase has used for real positional astronomy
 * until now.
 *
 * The math (Local Sidereal Time → Ascendant/MC via standard spherical-
 * astronomy formulas, then Placidus/Whole-Sign house cusps) is ported from
 * the same MIT-licensed `free-human-design` project already credited in
 * human-design-data.ts (its `src/hd/houses.js`) — same provenance, same
 * `astronomia` package already installed for Human Design's true Node, no
 * new dependency. Tropical (not Sidereal) to match this app's Human
 * Design/Gene Keys calculations, which are tropical-based — confirmed
 * against bodygraph.com's own docs: Human Design and Astrology should use
 * the same zodiac so a practitioner's charts agree with each other.
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const J2000_JD = 2451545.0;

export type ZodiacSign =
  | "Aries" | "Taurus" | "Gemini" | "Cancer" | "Leo" | "Virgo"
  | "Libra" | "Scorpio" | "Sagittarius" | "Capricorn" | "Aquarius" | "Pisces";

export const SIGNS: readonly ZodiacSign[] = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

function signOf(lonDeg: number): { sign: ZodiacSign; signIndex: number; degInSign: number } {
  const lon = normalizeDeg(lonDeg);
  const signIndex = Math.floor(lon / 30);
  return { sign: SIGNS[signIndex], signIndex, degInSign: lon - signIndex * 30 };
}

// ── Julian Day helpers ──────────────────────────────────────────────────

/** Plain UT-based Julian Day (not JDE) — what `astronomia`'s sidereal-time function expects. */
function julianDayUt(date: Date): number {
  return J2000_JD + MakeTime(date).ut;
}
/** Julian Ephemeris Day (UT + ΔT) — what `astronomia`'s nutation/obliquity functions expect. */
function julianEphemerisDay(date: Date): number {
  return J2000_JD + MakeTime(date).tt;
}

function gastDegrees(jdUt: number): number {
  return normalizeDeg((gastApparentSeconds(jdUt) / 3600) * 15);
}

function trueObliquityDeg(jde: number): number {
  const [, deps] = nutation(jde);
  return (meanObliquity(jde) + deps) * R2D;
}

// ── chart angles (Ascendant / MC / Descendant / IC) ────────────────────

export interface ChartAngle {
  longitude: number;
  sign: ZodiacSign;
  degInSign: number;
}

function decorate(lon: number): ChartAngle {
  const { sign, degInSign } = signOf(lon);
  return { longitude: normalizeDeg(lon), sign, degInSign };
}

interface RawAngles {
  ascendant: ChartAngle;
  descendant: ChartAngle;
  mc: ChartAngle;
  ic: ChartAngle;
  ramc: number;
  obliquity: number;
}

/** Right ascension → ecliptic longitude of a point on the ecliptic (β=0). λ = atan2(sin α, cos α · cos ε). */
function eclipticLonFromRA(raDeg: number, epsDeg: number): number {
  const ra = raDeg * D2R;
  const eps = epsDeg * D2R;
  return normalizeDeg(Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(eps)) * R2D);
}

function declOfEclipticPoint(lonDeg: number, epsDeg: number): number {
  return Math.asin(Math.sin(epsDeg * D2R) * Math.sin(lonDeg * D2R)) * R2D;
}

function computeAngles(date: Date, lat: number, lng: number): RawAngles {
  const jdUt = julianDayUt(date);
  const jde = julianEphemerisDay(date);
  const eps = trueObliquityDeg(jde);
  const ramc = normalizeDeg(gastDegrees(jdUt) + lng); // lng: east positive
  const ramcR = ramc * D2R;
  const epsR = eps * D2R;
  const phiR = lat * D2R;

  const mc = normalizeDeg(Math.atan2(Math.sin(ramcR), Math.cos(ramcR) * Math.cos(epsR)) * R2D);

  let asc = normalizeDeg(
    Math.atan2(
      Math.cos(ramcR),
      -(Math.sin(ramcR) * Math.cos(epsR) + Math.tan(phiR) * Math.sin(epsR)),
    ) * R2D,
  );
  // The Ascendant must lie in the rising semicircle — 0..180° east of the MC.
  if (normalizeDeg(asc - mc) > 180) asc = normalizeDeg(asc + 180);

  return {
    ascendant: decorate(asc),
    descendant: decorate(asc + 180),
    mc: decorate(mc),
    ic: decorate(mc + 180),
    ramc,
    obliquity: eps,
  };
}

// ── house cusps ──────────────────────────────────────────────────────────

export type HouseSystem = "placidus" | "whole" | "equal";

export interface HouseCusp {
  house: number;
  longitude: number;
  sign: ZodiacSign;
  degInSign: number;
}

export interface AstrologyHouses {
  /** The system actually used — may differ from requested if Placidus was undefined at this latitude (polar circle) and fell back to Whole Sign. */
  system: HouseSystem;
  requestedSystem: HouseSystem;
  fallbackReason: string | null;
  cusps: HouseCusp[];
}

/** Iterative Placidus intermediate cusp (houses 11, 12, 2, 3) — solves for the ecliptic point whose RA divides its day/night semi-arc in the Placidus ratio. Null if circumpolar (Placidus undefined, roughly |lat| > 66°). */
function placidusIntermediate(
  ramc: number,
  eps: number,
  lat: number,
  which: "11" | "12" | "2" | "3",
): number | null {
  const phiR = lat * D2R;
  const initialOffset = { "11": 30, "12": 60, "2": 120, "3": 150 }[which];
  let ra = ramc + initialOffset;

  function targetRA(SA: number): number {
    const NA = 180 - SA;
    switch (which) {
      case "11": return ramc + (1 / 3) * SA;
      case "12": return ramc + (2 / 3) * SA;
      case "2": return ramc + SA + (1 / 3) * NA;
      case "3": return ramc + SA + (2 / 3) * NA;
    }
  }

  for (let i = 0; i < 100; i++) {
    const lon = eclipticLonFromRA(ra, eps);
    const decl = declOfEclipticPoint(lon, eps);
    const cosSA = -Math.tan(phiR) * Math.tan(decl * D2R);
    if (cosSA <= -1 || cosSA >= 1) return null;
    const SA = Math.acos(cosSA) * R2D;
    const next = targetRA(SA);
    if (Math.abs(normalizeDeg(next - ra + 180) - 180) < 1e-9) {
      ra = next;
      break;
    }
    ra = next;
  }
  return eclipticLonFromRA(ra, eps);
}

function wholeSignCusps(ascLon: number): number[] {
  const base = Math.floor(normalizeDeg(ascLon) / 30) * 30;
  return Array.from({ length: 12 }, (_, i) => normalizeDeg(base + i * 30));
}

function computeHouses(
  date: Date,
  lat: number,
  lng: number,
  requestedSystem: HouseSystem,
): AstrologyHouses {
  const angles = computeAngles(date, lat, lng);
  const asc = angles.ascendant.longitude;
  const mc = angles.mc.longitude;

  let cuspLons: number[];
  let system = requestedSystem;
  let fallbackReason: string | null = null;

  if (requestedSystem === "whole") {
    cuspLons = wholeSignCusps(asc);
  } else if (requestedSystem === "equal") {
    cuspLons = Array.from({ length: 12 }, (_, i) => normalizeDeg(asc + i * 30));
  } else {
    const c11 = placidusIntermediate(angles.ramc, angles.obliquity, lat, "11");
    const c12 = placidusIntermediate(angles.ramc, angles.obliquity, lat, "12");
    const c2 = placidusIntermediate(angles.ramc, angles.obliquity, lat, "2");
    const c3 = placidusIntermediate(angles.ramc, angles.obliquity, lat, "3");
    if (c11 === null || c12 === null || c2 === null || c3 === null) {
      system = "whole";
      fallbackReason = "Placidus is undefined this close to the poles — using Whole Sign instead.";
      cuspLons = wholeSignCusps(asc);
    } else {
      cuspLons = [
        asc, c2, c3, normalizeDeg(mc + 180), normalizeDeg(c11 + 180), normalizeDeg(c12 + 180),
        normalizeDeg(asc + 180), normalizeDeg(c2 + 180), normalizeDeg(c3 + 180), mc, c11, c12,
      ];
    }
  }

  const cusps: HouseCusp[] = cuspLons.map((lon, i) => {
    const { sign, degInSign } = signOf(lon);
    return { house: i + 1, longitude: normalizeDeg(lon), sign, degInSign };
  });

  return { system, requestedSystem, fallbackReason, cusps };
}

function houseOfLongitude(lonDeg: number, cusps: HouseCusp[]): number {
  const lon = normalizeDeg(lonDeg);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i].longitude;
    const end = cusps[(i + 1) % 12].longitude;
    const inRange = start <= end ? lon >= start && lon < end : lon >= start || lon < end;
    if (inRange) return cusps[i].house;
  }
  return 12;
}

// ── planetary placements ────────────────────────────────────────────────

export type AstrologyBodyName =
  | "sun" | "moon" | "mercury" | "venus" | "mars"
  | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto"
  | "northNode" | "southNode" | "lilith" | "chiron";

/**
 * `northNode`/`southNode`/`lilith` added 2026-08-09 — a real, verified gap
 * (her direct question: "did you do the Chiron, the North Nodes, the South
 * Nodes, Lilith?"). North/South Node and Lilith are both free, already
 * buildable from the same `astronomia` functions Human Design's Node
 * already uses (see gate-wheel.ts) — no paid API, no new dependency.
 * Chiron is NOT included: `astronomy-engine` has no minor-planet ephemeris
 * at all, so it needs a genuinely different data source, not found yet.
 */
function longitudeOf(body: AstrologyBodyName, date: Date): number {
  switch (body) {
    case "northNode":
      return northNodeLongitude(date);
    case "southNode":
      return (northNodeLongitude(date) + 180) % 360;
    case "lilith":
      return meanLilithLongitude(date);
    default:
      // Every AstrologyBodyName other than the 3 handled above is a key of
      // this map by construction — see ALL_ASTROLOGY_BODIES below.
      return eclipticLongitude(CLASSICAL_ENGINE_BODY[body]!, date);
  }
}

const CLASSICAL_ENGINE_BODY: Partial<Record<AstrologyBodyName, Body>> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

const ALL_ASTROLOGY_BODIES: readonly AstrologyBodyName[] = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
  "northNode", "southNode", "lilith",
];

export interface AstrologyPlacement {
  body: AstrologyBodyName;
  longitude: number;
  sign: ZodiacSign;
  degInSign: number;
  house: number;
  /** True when the body's ecliptic longitude is currently decreasing (apparent backward motion) — a same-day finite-difference check, not a full station search. */
  retrograde: boolean;
}

function computePlacements(date: Date, cusps: HouseCusp[], chironLongitude?: number): AstrologyPlacement[] {
  const oneDayLater = new Date(date.getTime() + 24 * 3600 * 1000);
  const placements = ALL_ASTROLOGY_BODIES.map((body) => {
    const lon = longitudeOf(body, date);
    const lonLater = longitudeOf(body, oneDayLater);
    let delta = lonLater - lon;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const { sign, degInSign } = signOf(lon);
    return {
      body,
      longitude: normalizeDeg(lon),
      sign,
      degInSign,
      house: houseOfLongitude(lon, cusps),
      retrograde: delta < 0,
    };
  });

  // Chiron — the one body this engine can't compute itself (no minor-planet
  // ephemeris in astronomy-engine, see gate-wheel.ts). Only appended when
  // the caller supplied a real longitude from Bodygraph's API; omitted
  // entirely otherwise, same "real field or absent, never fabricated"
  // rule as everything else in this file. Retrograde isn't determined for
  // it — that would need a second API call for a day-later snapshot, not
  // worth the extra cost for one body's motion indicator.
  if (typeof chironLongitude === "number") {
    const { sign, degInSign } = signOf(chironLongitude);
    placements.push({
      body: "chiron",
      longitude: normalizeDeg(chironLongitude),
      sign,
      degInSign,
      house: houseOfLongitude(chironLongitude, cusps),
      retrograde: false,
    });
  }

  return placements;
}

// ── aspects ──────────────────────────────────────────────────────────────

export type AspectType = "Conjunction" | "Sextile" | "Square" | "Trine" | "Opposition";

/** Standard Ptolemaic aspects. Orbs: a common moderate convention (8° for Conjunction/Opposition/Trine/Square, 6° for Sextile) — orb size is a real, unsettled-among-astrologers choice; this is a defensible middle ground, not the only valid one. */
const ASPECT_DEFS: { type: AspectType; angle: number; orb: number }[] = [
  { type: "Conjunction", angle: 0, orb: 8 },
  { type: "Opposition", angle: 180, orb: 8 },
  { type: "Trine", angle: 120, orb: 8 },
  { type: "Square", angle: 90, orb: 8 },
  { type: "Sextile", angle: 60, orb: 6 },
];

export interface AstrologyAspect {
  bodyA: AstrologyBodyName;
  bodyB: AstrologyBodyName;
  type: AspectType;
  /** How far from exact, in degrees — smaller is a tighter, more prominent aspect. */
  orb: number;
}

function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function computeAspects(placements: AstrologyPlacement[]): AstrologyAspect[] {
  const aspects: AstrologyAspect[] = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const sep = angularSeparation(placements[i].longitude, placements[j].longitude);
      let best: { type: AspectType; orb: number } | null = null;
      for (const def of ASPECT_DEFS) {
        const diff = Math.abs(sep - def.angle);
        if (diff <= def.orb && (!best || diff < best.orb)) {
          best = { type: def.type, orb: diff };
        }
      }
      if (best) {
        aspects.push({
          bodyA: placements[i].body,
          bodyB: placements[j].body,
          type: best.type,
          orb: Math.round(best.orb * 100) / 100,
        });
      }
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb);
}

// ── public API ───────────────────────────────────────────────────────────

export interface AstrologyChartInput extends WallClockBirthInput {
  /** Degrees, north positive. */
  lat: number;
  /** Degrees, EAST positive (west is negative) — same convention geocoding APIs use. */
  lng: number;
  houseSystem?: HouseSystem;
  /** Chiron's absolute ecliptic longitude (degrees 0-360), from Bodygraph's API (bodygraph-api.ts) — this engine has no minor-planet ephemeris of its own. Omit to leave Chiron out of the chart entirely rather than fabricate a position. */
  chironLongitude?: number;
}

export interface AstrologyChart {
  placements: AstrologyPlacement[];
  angles: { ascendant: ChartAngle; descendant: ChartAngle; mc: ChartAngle; ic: ChartAngle };
  houses: AstrologyHouses;
  aspects: AstrologyAspect[];
}

export function calculateAstrologyChart(input: AstrologyChartInput): AstrologyChart {
  const birthUtc = parseBirthToUtc(input);
  const houses = computeHouses(birthUtc, input.lat, input.lng, input.houseSystem ?? "placidus");
  const rawAngles = computeAngles(birthUtc, input.lat, input.lng);
  const placements = computePlacements(birthUtc, houses.cusps, input.chironLongitude);

  return {
    placements,
    angles: {
      ascendant: rawAngles.ascendant,
      descendant: rawAngles.descendant,
      mc: rawAngles.mc,
      ic: rawAngles.ic,
    },
    houses,
    aspects: computeAspects(placements),
  };
}
