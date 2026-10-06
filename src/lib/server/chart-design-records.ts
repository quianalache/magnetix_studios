import { MANDALA_ELEMENT_PALETTES } from "@/lib/energetics/mandala-spec";
import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { ChartDesign } from "@/types/chart-design";
import { defaultChartDesignColor } from "@/types/chart-design";
import type { ChartDesignSet } from "@/types/chart-design-set";

/**
 * Low-level chart design storage shared by chart-design-service.ts (the
 * per-system records) and chart-design-set-service.ts (the unified
 * designs), so neither service has to import the other. Moved here
 * unchanged from chart-design-service.ts (2026-10, unified Chart Designs).
 */

export function designsCol() {
  return getAdminDb().collection("chartDesigns");
}

export function setsCol() {
  return getAdminDb().collection("chartDesignSets");
}

/**
 * Firestore Timestamps aren't plain-serializable — passed as-is, they
 * throw the moment a ChartDesign crosses a Server → Client Component
 * boundary (the public decoder form, the report design viewer both do).
 * Real Timestamp → ISO string; a still-in-flight FieldValue sentinel (the
 * immediate return of a create, before any re-read) → null, same "don't
 * fabricate a client-side date" convention already used for reading
 * createdAt in energetic-decoder-service.ts. Fixed 2026-08-11.
 */
export function toIsoString(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return null;
}

export function toDesign(id: string, data: FirebaseFirestore.DocumentData): ChartDesign {
  return {
    id,
    ...(data as Omit<ChartDesign, "id">),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

/** Real, working defaults for the fields with no legacy value to inherit — everything a fresh design needs to render correctly with zero configuration. */
export function freshDesignFields() {
  return {
    chartDefinedColor: defaultChartDesignColor(),
    channelsColor: "#52525b", // zinc-600 — the faint background channel-network color (remapped 2026-08-17, see chart-designs-tab.tsx's FIELD_LABEL comment)
    gatesColor: "#18181b", // zinc-900 — matches the traditional Personality gate-text color
    // 2026-08-10 — full-chart-layout fields, see chart-design.ts's header
    // comment. Defaults match human-design-chart.tsx's current hardcoded
    // PERSONALITY_FILL/DESIGN_FILL exactly, so the moment the full-chart
    // component reads these, a design nobody has touched yet renders
    // identically to what the BodyGraph already shows today — no visual
    // jump on first load.
    personalityActivationColor: "#18181b", // zinc-900 — same as gatesColor/PERSONALITY_FILL
    designActivationColor: "#9a3412", // rust/brown — same as human-design-chart.tsx's DESIGN_FILL
    arrowColor: "#3f3f46", // zinc-700 — neutral ink, matches WHEEL_TEXT already used elsewhere (astrology wheel, PDF)
    arrowStyle: "solid" as const,
    planetBoxColor: "#f4f4f5", // zinc-100 — currently unused by the renderer, see chart-design.ts's header comment
    // "fullBox" as the default rather than "iconOnly": the full-chart
    // component has always rendered a filled row (planetBoxColor, before
    // this field existed) — fullBox is the closest continuity with that,
    // even though the fill source changes to the activation color per
    // side. Border radius default (6) matches the Tailwind `rounded-md`
    // class the renderer already hardcoded before this field existed.
    planetBoxMode: "fullBox" as const,
    planetBoxBorderRadius: 6,
    // "uniform" preserves current behavior exactly — every existing
    // design keeps rendering every defined center in chartDefinedColor
    // until someone explicitly switches to traditional. The 9 colors
    // below are still given real defaults (not blank) so switching to
    // traditional works correctly with zero further configuration —
    // real values read directly off Bodygraph's own traditional-mode
    // fields, 2026-08-10.
    centersMode: "uniform" as const,
    headCenterColor: "#e49e4b",
    ajnaCenterColor: "#a19a5c",
    throatCenterColor: "#bf5a0f",
    gCenterColor: "#e49e4b",
    heartCenterColor: "#a23423",
    spleenCenterColor: "#bf5a0f",
    sacralCenterColor: "#a23423",
    solarPlexusCenterColor: "#bf5a0f",
    rootCenterColor: "#bf5a0f",
    backgroundColor: "#ffffff",
    houseSystem: "placidus" as const,
    wheelAccentColor: "#5E2574", // the real theme-magnetix primary purple, not an invented color
    // Mandala-only, added 2026-08-15 (Phase 6, completing the Mandala
    // rebuild) — defaults are this chart's own original picks, not copied
    // from Bodygraph (whose Mandala isn't reachable through its API to
    // even compare against). Violet for the zodiac ring ties it visually
    // to this app's own established brand purple (wheelAccentColor above)
    // without being the identical value, so the two rings read as
    // related but distinct on a chart that shows both HD and astrology
    // structure at once.
    mandalaZodiacColor: "#8b5cf6",
    mandalaGateRingColor: "#71717a", // zinc-500 — neutral structural ink, matches this app's other faint-ring conventions
    mandalaQuadrantColor: "#71717a",
    // Zodiac element colors (2026-10 Mandala redesign) — written only on
    // brand-new designs. Existing designs are deliberately NOT backfilled
    // (chart-design-service's missingFieldsPatch doesn't list them): they
    // resolve at read time via resolveMandalaElementColors().
    mandalaFireColor: MANDALA_ELEMENT_PALETTES.default.fire,
    mandalaEarthColor: MANDALA_ELEMENT_PALETTES.default.earth,
    mandalaAirColor: MANDALA_ELEMENT_PALETTES.default.air,
    mandalaWaterColor: MANDALA_ELEMENT_PALETTES.default.water,
    // The rest of the Mandala design controls (2026-10) — explicit on new designs only; existing designs resolve at read time.
    mandalaHexagramColor: "#27272a",
    mandalaGateTextColor: "#27272a",
    mandalaGlowColor: "#ffffff",
    mandalaInitiationColor: "#60608b",
    mandalaInitiationTextColor: "#ffffff",
    mandalaCivilizationColor: "#7e6997",
    mandalaCivilizationTextColor: "#ffffff",
    mandalaDualityColor: "#546579",
    mandalaDualityTextColor: "#ffffff",
    mandalaMutationColor: "#99759f",
    mandalaMutationTextColor: "#ffffff",
    mandalaFireTextColor: "#ffffff",
    mandalaEarthTextColor: "#ffffff",
    mandalaAirTextColor: "#ffffff",
    mandalaWaterTextColor: "#ffffff",
    mandalaHeadCenterColor: "#e0b25c",
    mandalaAjnaCenterColor: "#8f9a6a",
    mandalaThroatCenterColor: "#c9a27e",
    mandalaGCenterColor: "#d4a24c",
    mandalaHeartCenterColor: "#b5524f",
    mandalaSplenicCenterColor: "#a68a64",
    mandalaSacralCenterColor: "#c0645a",
    mandalaSolarPlexusCenterColor: "#cf8a4c",
    mandalaRootCenterColor: "#9c7a5b",
    mandalaZodiacSymbolColor: "#ffffff",
    // Astrology design controls (2026-10) — the Default palette, explicit on brand-new designs only; existing designs resolve at read time (resolveAstrologyColors).
    astroHousesBackgroundColor: "#faf9f7",
    astroAspectsBackgroundColor: "#ffffff",
    astroWheelLineColor: "#a1a1aa",
    astroHouseLineColor: "#c4c4cc",
    astroHouseNumberColor: "#52525b",
    astroAngleColor: "#5e2574",
    astroFireColor: "#c06e6e",
    astroEarthColor: "#9c7f58",
    astroAirColor: "#828d5d",
    astroWaterColor: "#6f8ca3",
    astroZodiacSymbolColor: "#1f1b24",
    astroConjunctionColor: "#3f3f46",
    astroSextileColor: "#0d9488",
    astroSquareColor: "#dc2626",
    astroTrineColor: "#2563eb",
    astroOppositionColor: "#b91c1c",
  };
}

export function toSet(id: string, data: FirebaseFirestore.DocumentData): ChartDesignSet {
  return {
    id,
    subAccountId: data.subAccountId,
    agencyId: data.agencyId,
    name: data.name,
    isDefault: data.isDefault === true,
    members: {
      humanDesign: data.members?.humanDesign ?? "",
      mandala: data.members?.mandala ?? "",
      astrology: data.members?.astrology ?? "",
      frequency: null,
    },
    migration: data.migration ?? null,
    starter: data.starter ?? null,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

/** Every chart design record and unified design of one sub-account — both always tenant-filtered at the query. */
export async function loadChartDesignData(
  subAccountId: string,
): Promise<{ designs: ChartDesign[]; sets: ChartDesignSet[] }> {
  const [designSnap, setSnap] = await Promise.all([
    designsCol().where("subAccountId", "==", subAccountId).get(),
    setsCol().where("subAccountId", "==", subAccountId).get(),
  ]);
  return {
    designs: designSnap.docs.map((d) => toDesign(d.id, d.data())),
    sets: setSnap.docs.map((d) => toSet(d.id, d.data())),
  };
}
