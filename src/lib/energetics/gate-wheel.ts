import "server-only";

import { Body, Ecliptic, GeoVector, MakeTime } from "astronomy-engine";
import { trueNode, perigee as meanLunarPerigee } from "astronomia/moonposition";
import { nutation } from "astronomia/nutation";
import { utcFromWallClock } from "@/lib/booking/availability";
import { GATE_WHEEL_ORDER, WHEEL_START_LONGITUDE_DEG, DEGREES_PER_GATE } from "./gate-data";

/**
 * The proven gate-wheel primitives, extracted out of gene-keys.ts (2026-08-08)
 * so the new Human Design engine can reuse the exact same math instead of a
 * second, possibly-drifting copy. Pure refactor — no behavior change to
 * Gene Keys. See gene-keys.ts's original header for the provenance note
 * (ported from a working reference tool, cross-checked again 2026-08-08
 * against an independently-built open-source engine's gate wheel — both
 * produce an identical 64-gate ordering once aligned to the same start
 * point, real independent confirmation this is correct).
 */

/** Each gate spans 6 lines. DEGREES_PER_GATE itself now lives in gate-data.ts (2026-08-15) — imported above, not redeclared — so the Mandala's zodiac ring can share the exact same constant without a client-safe file importing this server-only one. */
const DEGREES_PER_LINE = DEGREES_PER_GATE / 6;
/**
 * The gate wheel's zero point sits at 302° of raw tropical ecliptic
 * longitude, not 0° Aries — this offset rotates raw longitude into
 * "wheel space" before the gate lookup. Fixed by the Human Design / Gene
 * Keys system, not a tunable. Now WHEEL_START_LONGITUDE_DEG, imported from
 * gate-data.ts (2026-08-15) — same value, same reason as DEGREES_PER_GATE
 * above.
 */
const WHEEL_OFFSET_DEG = WHEEL_START_LONGITUDE_DEG;
/** How many days before birth the "Design" (unconscious) chart is cast —
 *  the classic ~88° solar-arc offset, refined below to the exact instant. */
const DESIGN_OFFSET_DAYS = 88;

export interface GateLine {
  gate: number;
  line: number;
}

/** Geocentric apparent ecliptic longitude (degrees, 0-360) of a body at an instant. */
export function eclipticLongitude(body: Body, date: Date): number {
  const vector = GeoVector(body, date, true);
  const { elon } = Ecliptic(vector);
  return elon;
}

const R2D = 180 / Math.PI;
const J2000_JD = 2451545.0;

/**
 * True ascending lunar Node longitude (degrees, 0-360), nutation-corrected
 * to apparent position — same convention as `eclipticLongitude` above.
 * Moved here from human-design.ts (2026-08-09) so Astrology's North/South
 * Node fields can reuse the exact same proven calculation instead of a
 * second, possibly-drifting copy. `astronomy-engine` has no direct
 * node-longitude function (only node-CROSSING event search), so this comes
 * from `astronomia` (MIT-licensed, Meeus-algorithm-based) instead — no new
 * dependency, already installed for Human Design.
 */
export function northNodeLongitude(date: Date): number {
  const tt = MakeTime(date).tt; // days since J2000, Terrestrial Time
  const jde = J2000_JD + tt;
  const [dpsi] = nutation(jde);
  let deg = ((trueNode(jde) + dpsi) * R2D) % 360;
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Mean Black Moon Lilith longitude (degrees, 0-360) — the standard
 * "Mean Lilith" most astrology software shows, computed the same way real
 * ephemeris tools do: the mean lunar-orbit perigee (`astronomia`'s
 * `moonposition.perigee`, a direct Meeus mean-element formula, not an
 * apogee-event search) plus 180°, since Lilith is the apogee direction of
 * that same precessing ellipse. Real free calculation, no paid API —
 * genuinely missing before 2026-08-09, verified against our own Astrology
 * chart's Chiron/Node/Lilith audit.
 */
export function meanLilithLongitude(date: Date): number {
  const jde = J2000_JD + MakeTime(date).tt;
  const perigeeDeg = (meanLunarPerigee(jde) * R2D) % 360;
  const deg = (perigeeDeg + 180) % 360;
  return deg < 0 ? deg + 360 : deg;
}

export function longitudeToGateLine(rawLongitude: number): GateLine {
  let wheelPos = (rawLongitude - WHEEL_OFFSET_DEG) % 360;
  if (wheelPos < 0) wheelPos += 360;
  wheelPos = Math.round(wheelPos * 1e6) / 1e6;

  const gateIndex = Math.floor(wheelPos / DEGREES_PER_GATE);
  const gate = GATE_WHEEL_ORDER[gateIndex % 64];
  const posInGate = wheelPos - gateIndex * DEGREES_PER_GATE;
  const line = Math.min(6, Math.max(1, Math.floor(posInGate / DEGREES_PER_LINE) + 1));
  return { gate, line };
}

/** Each Line subdivides into 6 Colors, each Color into 6 Tones, each Tone into 5 Bases — the real Human Design substructure beneath Gate/Line (Ra Uru Hu's "Primary Health System"), same fixed subdivision the Variables (Digestion/Environment/Perspective/Motivation/Sense) read from. */
const DEGREES_PER_COLOR = DEGREES_PER_LINE / 6;
const DEGREES_PER_TONE = DEGREES_PER_COLOR / 6;
const DEGREES_PER_BASE = DEGREES_PER_TONE / 5;

export interface GateLineColorToneBase extends GateLine {
  color: number;
  tone: number;
  base: number;
}

/**
 * Superset of `longitudeToGateLine` — same wheel-offset/Gate/Line math
 * verbatim (not reimplemented, not at risk of drifting from the already-
 * validated version above), extended one level deeper for Variables. Added
 * 2026-08-10 alongside the real Variables engine (human-design-
 * variables.ts) — purely additive, `longitudeToGateLine` itself is
 * untouched and every existing caller is unaffected.
 */
export function longitudeToFullActivation(rawLongitude: number): GateLineColorToneBase {
  let wheelPos = (rawLongitude - WHEEL_OFFSET_DEG) % 360;
  if (wheelPos < 0) wheelPos += 360;
  wheelPos = Math.round(wheelPos * 1e6) / 1e6;

  const gateIndex = Math.floor(wheelPos / DEGREES_PER_GATE);
  const gate = GATE_WHEEL_ORDER[gateIndex % 64];
  const posInGate = wheelPos - gateIndex * DEGREES_PER_GATE;
  const line = Math.min(6, Math.max(1, Math.floor(posInGate / DEGREES_PER_LINE) + 1));
  const posInLine = posInGate - (line - 1) * DEGREES_PER_LINE;
  const color = Math.min(6, Math.max(1, Math.floor(posInLine / DEGREES_PER_COLOR) + 1));
  const posInColor = posInLine - (color - 1) * DEGREES_PER_COLOR;
  const tone = Math.min(6, Math.max(1, Math.floor(posInColor / DEGREES_PER_TONE) + 1));
  const posInTone = posInColor - (tone - 1) * DEGREES_PER_TONE;
  const base = Math.min(5, Math.max(1, Math.floor(posInTone / DEGREES_PER_BASE) + 1));
  return { gate, line, color, tone, base };
}

/**
 * Finds the exact instant ~88 days before `birthUtc` at which the Sun's
 * ecliptic longitude was 88° earlier than at birth — the "Design" moment.
 * Newton's-method-style refinement using a 1-hour finite difference to
 * estimate the Sun's angular rate; converges in a handful of iterations,
 * capped at 20.
 */
export function findDesignTime(birthUtc: Date, personalitySunLon: number): Date {
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

export interface WallClockBirthInput {
  /** YYYY-MM-DD, local to the birth place. */
  date: string;
  /** HH:MM, 24-hour, local to the birth place. */
  time: string;
  /** IANA zone for the birth place, e.g. "America/Chicago". */
  timeZone: string;
}

export function parseBirthToUtc(input: WallClockBirthInput): Date {
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  const minuteOfDay = hour * 60 + minute;
  return utcFromWallClock(year, month, day, minuteOfDay, input.timeZone);
}
