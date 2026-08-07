/**
 * Minimal ambient types for the two `astronomia` subpaths this app uses
 * (human-design.ts, for the true lunar Node — the one calculation
 * `astronomy-engine` doesn't expose directly). `astronomia` ships no
 * TypeScript definitions of its own.
 */
declare module "astronomia/moonposition" {
  /** True ascending lunar node longitude, in radians. Takes Julian Ephemeris Day. */
  export function trueNode(jde: number): number;
}

declare module "astronomia/nutation" {
  /** [Δψ (longitude), Δε (obliquity)] nutation, in radians. Takes Julian Ephemeris Day. */
  export function nutation(jde: number): [number, number];
}
