import "server-only";

import { calculateHumanDesignProfile, type HumanDesignProfile } from "./human-design";
import { calculateAstrologyChart, type AstrologyChart } from "./astrology";
import { calculateGeneKeysProfile, type GeneKeysSphereResult } from "./gene-keys";
import { computeHumanDesignVariables, type HumanDesignVariables } from "./human-design-variables";
import { chironPlacement } from "./swiss-ephemeris";
import { parseBirthToUtc } from "./gate-wheel";

/**
 * PREVIEW-ONLY SAMPLE DATA — Report Builder Preview's "Sample Data" source
 * (2026-08-12, Report Builder Preview task). This is NOT a real reading:
 * it is never written to Firestore, never linked to a Contact, and never
 * reachable from the real "create a reading" flow — the only caller is the
 * Report Builder Preview API route, which feeds its output straight into
 * `ReportDesignViewer` and discards it. Safe to call from any sub-account,
 * including one with zero real readings.
 *
 * `PREVIEW_SAMPLE_VERSION` exists so a future change to the fixed birth
 * input below is traceable — every practitioner previewing with sample
 * data sees the exact same chart every time (deterministic, not random),
 * and that chart only changes if this file changes.
 */
export const PREVIEW_SAMPLE_VERSION = "v1";

/**
 * Fixed, hardcoded, fictional birth moment — never geocoded (lat/lng are
 * plain hardcoded coordinates, not resolved from `birthPlace` the way a
 * real reading's would be). Picked only to be unremarkable and clearly
 * synthetic; not modeled on any real person.
 */
const SAMPLE_BIRTH_INPUT = {
  date: "1990-06-15",
  time: "14:30",
  timeZone: "America/New_York",
} as const;
const SAMPLE_LAT = 40.7128;
const SAMPLE_LNG = -74.006;
const SAMPLE_BIRTH_PLACE = "New York, NY, USA";
const SAMPLE_NAME = "Preview Sample";

export interface PreviewSampleReading {
  name: string;
  birthDate: string;
  birthPlace: string;
  humanDesign: HumanDesignProfile;
  astrology: AstrologyChart;
  /** Gene Keys / Frequency spheres — not consumed by `ReportDesignViewer` today (no shortcode or chart block reads them yet), included for shape-completeness and so this stays meaningful once that changes. */
  spheres: GeneKeysSphereResult[];
}

let cached: Promise<PreviewSampleReading> | null = null;

/**
 * Computed once per server process, then reused — the inputs are fixed, so
 * recomputing would only ever produce the same result. Never throws:
 * Human Design and Gene Keys are pure/synchronous and can't fail; if the
 * local Chiron calc (Swiss Ephemeris WASM) has trouble initializing, the
 * sample chart simply has no Chiron placement, same "real field or absent"
 * degradation every real reading already tolerates.
 */
export function getPreviewSampleReading(): Promise<PreviewSampleReading> {
  if (!cached) cached = buildPreviewSampleReading();
  return cached;
}

async function buildPreviewSampleReading(): Promise<PreviewSampleReading> {
  const humanDesign = calculateHumanDesignProfile(SAMPLE_BIRTH_INPUT);

  // Same try/catch contract as energetic-decoder-service.ts's
  // withDerivedVariableArrows — this calc shares its swiss-ephemeris WASM
  // dependency with chironPlacement below, and that dependency has been
  // observed failing to initialize in this Vercel deployment (a
  // pre-existing gap, not introduced here — the exact same failure shows
  // up in that function's own try/catch). A missing Variables field on the
  // sample is a real "field or absent" degrade, same as everywhere else in
  // this codebase; it must never take the whole Preview request down.
  try {
    const localVariables = await computeHumanDesignVariables(SAMPLE_BIRTH_INPUT);
    humanDesign.variables = {
      digestion: { value: localVariables.digestion, description: "" },
      sense: { value: localVariables.sense, description: "" },
      designSense: { value: localVariables.designSense, description: "" },
      motivation: { value: localVariables.motivation, description: "" },
      perspective: { value: localVariables.perspective, description: "" },
      environment: { value: localVariables.environment, description: "" },
    } satisfies HumanDesignVariables;
    humanDesign.variableArrows = localVariables.arrows;
  } catch {
    // Leave humanDesign.variables/variableArrows undefined — the 6
    // Variables shortcodes ({{digestion}}, etc.) resolve to "" per
    // shortcodes.ts's existing unresolved-token contract, same as any
    // real reading saved without them.
  }

  const chiron = await chironPlacement(parseBirthToUtc(SAMPLE_BIRTH_INPUT)).catch(() => null);
  const astrology = calculateAstrologyChart({
    ...SAMPLE_BIRTH_INPUT,
    lat: SAMPLE_LAT,
    lng: SAMPLE_LNG,
    chironLongitude: chiron?.longitude,
    chironRetrograde: chiron?.retrograde,
  });

  const { spheres } = calculateGeneKeysProfile(SAMPLE_BIRTH_INPUT);

  return {
    name: SAMPLE_NAME,
    birthDate: SAMPLE_BIRTH_INPUT.date,
    birthPlace: SAMPLE_BIRTH_PLACE,
    humanDesign,
    astrology,
    spheres,
  };
}
