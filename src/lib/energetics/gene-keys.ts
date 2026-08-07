import "server-only";

import { Body } from "astronomy-engine";
import {
  eclipticLongitude,
  findDesignTime,
  longitudeToGateLine,
  parseBirthToUtc,
  type WallClockBirthInput,
} from "./gate-wheel";
import { geneKeyFor } from "./gate-data";

/**
 * Gene Keys "Hologenetic Profile" calculator — the Activation, Venus, and
 * Pearl Sequences (11 spheres total, plus a "Brand" sphere that reuses the
 * Personality Sun position). Ported from a working reference tool she'd
 * already built and used (a GHL AI Studio app, saved as
 * `~/Desktop/GHL Tools Export/Energetic Visibility Decoder`), which itself
 * used `astronomy-engine` — verified against its output during the port
 * (same gate/line results for the same inputs).
 *
 * The core gate-wheel math (ecliptic longitude, gate/line lookup, the
 * Design-time solar-arc search) lives in `gate-wheel.ts`, shared with
 * `human-design.ts` — both systems use the exact same wheel, this file
 * just picks a different, smaller set of planetary points off it.
 */

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
  /**
   * Practitioner-editable interpretive text (see
   * energetic-decoder-gate-content-service.ts) — undefined here, since
   * this pure calculator has no Firestore/sub-account access. Filled in
   * by createEnergeticDecoderReading() after calculation, from the
   * sub-account's own per-gate content (override or shipped default).
   */
  showsUp?: string;
  giftText?: string;
}

export type GeneKeysBirthInput = WallClockBirthInput;

export interface GeneKeysProfile {
  spheres: GeneKeysSphereResult[];
  /** The four Activation Sequence spheres, in order — used for the "mini decoder" summary. */
  activationSequence: GeneKeysSphereResult[];
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
