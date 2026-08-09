/**
 * Minimal ambient types for the `astronomia` subpaths this app uses —
 * the true lunar Node (human-design.ts) and sidereal time/obliquity for
 * Ascendant/MC/houses (astrology.ts), neither of which `astronomy-engine`
 * exposes directly. `astronomia` ships no TypeScript definitions of its own.
 */
declare module "astronomia/moonposition" {
  /** True ascending lunar node longitude, in radians. Takes Julian Ephemeris Day. */
  export function trueNode(jde: number): number;
  /** Mean longitude of the lunar orbit's perigee, in radians. Takes Julian Ephemeris Day. Used for Mean Black Moon Lilith (perigee + 180°) — added 2026-08-09. */
  export function perigee(jde: number): number;
}

declare module "astronomia/nutation" {
  /** [Δψ (longitude), Δε (obliquity)] nutation, in radians. Takes Julian Ephemeris Day. */
  export function nutation(jde: number): [number, number];
  /** Mean obliquity of the ecliptic, in radians. Takes Julian Ephemeris Day. */
  export function meanObliquity(jde: number): number;
}

declare module "astronomia/sidereal" {
  /** Greenwich Apparent Sidereal Time, in seconds of time (0-86400). Takes a plain UT-based Julian Day (not JDE). */
  export function apparent(jdUt: number): number;
}
