import "server-only";

import { Body, Ecliptic, GeoVector } from "astronomy-engine";
import { utcFromWallClock } from "@/lib/booking/availability";
import { GATE_WHEEL_ORDER, geneKeyFor } from "./gate-data";

/**
 * Gene Keys "Hologenetic Profile" calculator — the Activation, Venus, and
 * Pearl Sequences (11 spheres total, plus a "Brand" sphere that reuses the
 * Personality Sun position). Ported from a working reference tool she'd
 * already built and used (a GHL AI Studio app, saved as
 * `~/Desktop/GHL Tools Export/Energetic Visibility Decoder`), which itself
 * used `astronomy-engine` — verified against its output during the port
 * (same gate/line results for the same inputs).
 *
 * One real improvement over the reference tool: it parsed birth date/time
 * with `new Date(\`${date}T${time}\`)`, which JS resolves in whatever
 * timezone the code happens to run in (the browser's, in that case) —
 * wrong unless the visitor's local timezone matches the birth location's.
 * This version requires an explicit IANA `timeZone` (from geocoding the
 * birth place, see geocode.ts) and converts via the same
 * `utcFromWallClock` helper the booking system already uses, so a birth
 * time is always interpreted in the timezone of the birth PLACE, not
 * wherever the calculation happens to run.
 */

/** 360° / 64 gates. */
const DEGREES_PER_GATE = 360 / 64;
/** Each gate spans 6 lines. */
const DEGREES_PER_LINE = DEGREES_PER_GATE / 6;
/**
 * The gate wheel's zero point sits at 302° of raw tropical ecliptic
 * longitude, not 0° Aries — this offset rotates raw longitude into
 * "wheel space" before the gate lookup. Matches the reference tool
 * exactly; this constant is fixed by the Human Design / Gene Keys system,
 * not a tunable.
 */
const WHEEL_OFFSET_DEG = 302;
/** How many days before birth the "Design" (unconscious) chart is cast —
 *  the classic ~88° solar-arc offset, refined below to the exact instant. */
const DESIGN_OFFSET_DAYS = 88;

export interface GateLine {
  gate: number;
  line: number;
}

/** Geocentric apparent ecliptic longitude (degrees, 0-360) of a body at an instant. */
function eclipticLongitude(body: Body, date: Date): number {
  const vector = GeoVector(body, date, true);
  const { elon } = Ecliptic(vector);
  return elon;
}

function longitudeToGateLine(rawLongitude: number): GateLine {
  let wheelPos = (rawLongitude - WHEEL_OFFSET_DEG) % 360;
  if (wheelPos < 0) wheelPos += 360;
  wheelPos = Math.round(wheelPos * 1e6) / 1e6;

  const gateIndex = Math.floor(wheelPos / DEGREES_PER_GATE);
  const gate = GATE_WHEEL_ORDER[gateIndex % 64];
  const posInGate = wheelPos - gateIndex * DEGREES_PER_GATE;
  const line = Math.min(6, Math.max(1, Math.floor(posInGate / DEGREES_PER_LINE) + 1));
  return { gate, line };
}

/**
 * Finds the exact instant ~88 days before `birthUtc` at which the Sun's
 * ecliptic longitude was 88° earlier than at birth — the "Design" moment.
 * Newton's-method-style refinement using a 1-hour finite difference to
 * estimate the Sun's angular rate; converges in a handful of iterations,
 * capped at 20 (matches the reference tool).
 */
function findDesignTime(birthUtc: Date, personalitySunLon: number): Date {
  const targetLon = (personalitySunLon - DESIGN_OFFSET_DAYS + 360) % 360;
  let t = new Date(birthUtc.getTime() - DESIGN_OFFSET_DAYS * 24 * 3600 * 1000);

  for (let i = 0; i < 20; i++) {
    const lon = eclipticLongitude(Body.Sun, t);
    let diff = targetLon - lon;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 1e-6) break;

    const later = new Date(t.getTime() + 3600 * 1000);
    let rate = eclipticLongitude(Body.Sun, later) - lon;
    if (rate < -180) rate += 360;
    if (rate > 180) rate -= 360;

    const hoursToAdjust = diff / rate;
    t = new Date(t.getTime() + hoursToAdjust * 3600 * 1000);
  }
  return t;
}

export type GeneKeysSphereName =
  | "Life's Work"
  | "Evolution"
  | "Radiance"
  | "Purpose"
  | "Attraction"
  | "IQ"
  | "EQ"
  | "SQ"
  | "Vocation"
  | "Brand"
  | "Culture"
  | "Pearl";

export interface GeneKeysSphereResult {
  sphere: GeneKeysSphereName;
  gate: number;
  line: number;
  shadow: string;
  gift: string;
  siddhi: string;
}

export interface GeneKeysBirthInput {
  /** YYYY-MM-DD, local to the birth place. */
  date: string;
  /** HH:MM, 24-hour, local to the birth place. */
  time: string;
  /** IANA zone for the birth place, e.g. "America/Chicago" — from geocodeBirthPlace(). */
  timeZone: string;
}

export interface GeneKeysProfile {
  spheres: GeneKeysSphereResult[];
  /** The four Activation Sequence spheres, in order — used for the "mini decoder" summary. */
  activationSequence: GeneKeysSphereResult[];
}

function parseBirthToUtc(input: GeneKeysBirthInput): Date {
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  const minuteOfDay = hour * 60 + minute;
  return utcFromWallClock(year, month, day, minuteOfDay, input.timeZone);
}

export function calculateGeneKeysProfile(
  input: GeneKeysBirthInput,
): GeneKeysProfile {
  const birthUtc = parseBirthToUtc(input);

  // Personality (conscious) — planetary positions at the birth moment.
  const personalitySun = eclipticLongitude(Body.Sun, birthUtc);
  const personalityEarth = (personalitySun + 180) % 360;
  const personalityVenus = eclipticLongitude(Body.Venus, birthUtc);
  const personalityMars = eclipticLongitude(Body.Mars, birthUtc);
  const personalityJupiter = eclipticLongitude(Body.Jupiter, birthUtc);

  // Design (unconscious) — planetary positions ~88 solar degrees earlier.
  const designTime = findDesignTime(birthUtc, personalitySun);
  const designSun = eclipticLongitude(Body.Sun, designTime);
  const designEarth = (designSun + 180) % 360;
  const designMoon = eclipticLongitude(Body.Moon, designTime);
  const designVenus = eclipticLongitude(Body.Venus, designTime);
  const designMars = eclipticLongitude(Body.Mars, designTime);
  const designJupiter = eclipticLongitude(Body.Jupiter, designTime);

  const raw: { sphere: GeneKeysSphereName; longitude: number }[] = [
    { sphere: "Life's Work", longitude: personalitySun },
    { sphere: "Evolution", longitude: personalityEarth },
    { sphere: "Radiance", longitude: designSun },
    { sphere: "Purpose", longitude: designEarth },
    { sphere: "Attraction", longitude: designMoon },
    { sphere: "IQ", longitude: personalityVenus },
    { sphere: "EQ", longitude: personalityMars },
    { sphere: "SQ", longitude: designVenus },
    { sphere: "Vocation", longitude: designMars },
    // Brand deliberately reuses the Personality Sun position, matching
    // the reference tool exactly (not a separate planetary point).
    { sphere: "Brand", longitude: personalitySun },
    { sphere: "Culture", longitude: designJupiter },
    { sphere: "Pearl", longitude: personalityJupiter },
  ];

  const spheres: GeneKeysSphereResult[] = raw.map(({ sphere, longitude }) => {
    const { gate, line } = longitudeToGateLine(longitude);
    const names = geneKeyFor(gate);
    return {
      sphere,
      gate,
      line,
      shadow: names.shadow,
      gift: names.gift,
      siddhi: names.siddhi,
    };
  });

  return {
    spheres,
    activationSequence: spheres.slice(0, 4),
  };
}
