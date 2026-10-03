import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";

/**
 * The single source of truth for which ChartDesign fields each chart
 * system's styling uses (unified Chart Designs, 2026-10). Client-safe — the
 * editor UI, the set API and the migration tooling all read this list, so a
 * field can't be shown in one place and silently dropped by another (the
 * hand-maintained allow-list in the legacy PATCH route already caused one
 * such near-miss, see its 2026-08-15 comment).
 *
 * `houseSystem` is deliberately NOT here: it changes Astrology
 * calculations, not appearance, and moves to the reading calculation
 * settings in a later batch. It is still copied with a record (copies are
 * byte-for-byte) and the legacy route still edits it.
 */

const CENTER_COLOR_FIELDS = [
  "headCenterColor",
  "ajnaCenterColor",
  "throatCenterColor",
  "gCenterColor",
  "heartCenterColor",
  "spleenCenterColor",
  "sacralCenterColor",
  "solarPlexusCenterColor",
  "rootCenterColor",
] as const;

export const CHART_DESIGN_SYSTEM_FIELDS = {
  humanDesign: [
    "chartDefinedColor",
    "channelsColor",
    "gatesColor",
    "personalityActivationColor",
    "designActivationColor",
    "arrowColor",
    "arrowStyle",
    "planetBoxColor",
    "planetBoxMode",
    "planetBoxBorderRadius",
    "centersMode",
    ...CENTER_COLOR_FIELDS,
    "backgroundColor",
  ],
  mandala: [
    "chartDefinedColor",
    "personalityActivationColor",
    "designActivationColor",
    "mandalaZodiacColor",
    "mandalaGateRingColor",
    "mandalaQuadrantColor",
    "backgroundColor",
  ],
  astrology: ["wheelAccentColor", "backgroundColor"],
} as const satisfies Record<ChartDesignSystem, readonly (keyof ChartDesign)[]>;

export type ChartDesignEditableField<S extends ChartDesignSystem> = (typeof CHART_DESIGN_SYSTEM_FIELDS)[S][number];
export type ChartDesignSystemPatch = Partial<Pick<ChartDesign, ChartDesignEditableField<ChartDesignSystem>>>;

const ENUM_FIELDS: Partial<Record<keyof ChartDesign, readonly string[]>> = {
  arrowStyle: ["solid", "outline"],
  planetBoxMode: ["iconOnly", "fullBox"],
  centersMode: ["uniform", "traditional"],
};

/**
 * Colors end up inside SVG/CSS attributes, so only plain CSS color syntax is
 * accepted (hex, rgb()/hsl(), named colors) — never markup or url(). The
 * pickers only ever produce hex.
 */
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,24}|(rgb|rgba|hsl|hsla)\([0-9.,%\s]{1,48}\))$/;

/**
 * Validates one system's patch against that system's allow-list. Unknown
 * keys and invalid values are errors (never silently dropped), so a client
 * and this list can't drift apart unnoticed.
 */
export function sanitizeChartDesignSystemPatch(
  system: ChartDesignSystem,
  raw: unknown,
): { patch: ChartDesignSystemPatch; errors: string[] } {
  const errors: string[] = [];
  const patch: Record<string, string | number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { patch: {}, errors: [`${system}: expected an object of fields`] };
  }
  const allowed = new Set<string>(CHART_DESIGN_SYSTEM_FIELDS[system]);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      errors.push(`${system}: "${key}" isn't a ${system} design setting`);
      continue;
    }
    const options = ENUM_FIELDS[key as keyof ChartDesign];
    if (options) {
      if (typeof value === "string" && options.includes(value)) patch[key] = value;
      else errors.push(`${system}: "${key}" must be one of ${options.join(", ")}`);
    } else if (key === "planetBoxBorderRadius") {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 64) patch[key] = Math.round(value);
      else errors.push(`${system}: "planetBoxBorderRadius" must be a number from 0 to 64`);
    } else if (typeof value === "string" && COLOR_RE.test(value.trim())) {
      patch[key] = value.trim();
    } else {
      errors.push(`${system}: "${key}" must be a color`);
    }
  }
  return { patch: patch as ChartDesignSystemPatch, errors };
}

/** Bookkeeping keys that are never copied from one record to another. */
const NON_STYLE_KEYS = new Set([
  "id",
  "subAccountId",
  "agencyId",
  "system",
  "name",
  "isDefault",
  "ownerSetId",
  "createdAt",
  "updatedAt",
  "migration",
]);

/** Every styling value of a record (all systems' fields, plus houseSystem) — used to make independent copies. */
export function chartDesignStyleValues(design: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(design)) {
    if (!NON_STYLE_KEYS.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

/** Stable fingerprint of a record's styling values — used to prove the migration changed no existing values. */
export function chartDesignFingerprint(design: object): string {
  const values = chartDesignStyleValues(design);
  return JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]));
}
