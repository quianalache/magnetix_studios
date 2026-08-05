import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";

/**
 * "Energetic Decoder" — the Memberships-tab home for chart-reading
 * products (Gene Keys today; Human Design and astrology are planned
 * later phases sharing the same birth-data foundation). Deliberately
 * system-agnostic naming since a sub-account picks which system(s) they
 * offer, not us.
 */

export interface EnergeticDecoderRequest {
  name: string;
  /** YYYY-MM-DD. */
  birthDate: string;
  /** HH:MM, 24-hour. */
  birthTime: string;
  /** Free-text place. Geocoded server-side UNLESS lat/lng/timeZone below
   *  are already present (the visitor picked a specific autocomplete
   *  suggestion, so this is just the display label at that point). */
  birthPlace: string;
  /** Pre-resolved from the autocomplete dropdown — skips server-side
   *  geocoding and guarantees the calculation uses exactly the place the
   *  visitor picked, not a possibly-different best-guess re-geocode of
   *  the raw text. */
  lat?: number;
  lng?: number;
  timeZone?: string;
}

export interface EnergeticDecoderResult {
  name: string;
  birthPlace: string;
  timeZone: string;
  spheres: GeneKeysSphereResult[];
}
