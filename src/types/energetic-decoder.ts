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
  /** Free-text place, geocoded server-side. */
  birthPlace: string;
}

export interface EnergeticDecoderResult {
  name: string;
  birthPlace: string;
  timeZone: string;
  spheres: GeneKeysSphereResult[];
}
