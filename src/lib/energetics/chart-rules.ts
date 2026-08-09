import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart, ZodiacSign } from "./astrology";
import type { CenterKey } from "./human-design-data";

/**
 * Chart Rules — the same "pick a chart property → compare it → get a
 * result" logic found in Bodygraph's real Custom Property Tool (logged
 * into her real account 2026-08-09 and read its actual rule-builder
 * canvas: an "HD API Data" node feeding a "Comparison" node feeding a
 * "Property Result" node). This is that same idea, generalized to two
 * real uses in this app: which report PAGE a reader sees (ReportPage.
 * visibleIf), and which course LESSON an enrolled student can unlock —
 * her original ask, e.g. a 3/6 Profile only unlocking the Line 3 and
 * Line 6 lessons in a "teach the lines" course.
 *
 * v1 is deliberately single-condition, no AND/OR grouping — matches what
 * Bodygraph's own tool does per rule, and covers every real case raised
 * so far (one lesson keyed to one profile line, one type, etc.). Multiple
 * lessons each carry their own single condition rather than one lesson
 * needing a compound rule.
 */

export type ChartRuleAttribute =
  | "type"
  | "authority"
  | "profileLines"
  | "signature"
  | "notSelfTheme"
  | "definedCenters"
  | "openCenters"
  | "activatedGates"
  | "digestion"
  | "sense"
  | "designSense"
  | "motivation"
  | "perspective"
  | "environment"
  | "sunSign"
  | "moonSign"
  | "risingSign"
  | "chironSign";

export const CHART_RULE_ATTRIBUTES: { value: ChartRuleAttribute; label: string; group: "Human Design" | "Astrology" }[] = [
  { value: "type", label: "Type", group: "Human Design" },
  { value: "authority", label: "Authority", group: "Human Design" },
  { value: "profileLines", label: "Profile Line", group: "Human Design" },
  { value: "signature", label: "Signature", group: "Human Design" },
  { value: "notSelfTheme", label: "Not-Self Theme", group: "Human Design" },
  { value: "definedCenters", label: "Defined Center", group: "Human Design" },
  { value: "openCenters", label: "Open Center", group: "Human Design" },
  { value: "activatedGates", label: "Activated Gate", group: "Human Design" },
  // Variables — added 2026-08-09, same "caught the same gap twice" pass as
  // the shortcode tokens. Only resolve when a reading actually has
  // `variables` (Bodygraph API succeeded) — see resolveAttributeValue's
  // null-never-matches rule below, same safety net as an Astrology-only
  // rule evaluated against an HD-only reading.
  { value: "digestion", label: "Digestion", group: "Human Design" },
  { value: "sense", label: "Sense", group: "Human Design" },
  { value: "designSense", label: "Design Sense", group: "Human Design" },
  { value: "motivation", label: "Motivation", group: "Human Design" },
  { value: "perspective", label: "Perspective", group: "Human Design" },
  { value: "environment", label: "Environment", group: "Human Design" },
  { value: "sunSign", label: "Sun Sign", group: "Astrology" },
  { value: "moonSign", label: "Moon Sign", group: "Astrology" },
  { value: "risingSign", label: "Rising Sign", group: "Astrology" },
  { value: "chironSign", label: "Chiron Sign", group: "Astrology" },
];

/**
 * Course-lesson chart-gating specifically (ChartUnlockEditor) evaluates
 * against `computeBirthChart` in standalone-course-service.ts, which calls
 * the free local calculators directly at enrollment time — NOT the
 * Bodygraph API (deliberately: that path fires on every enrollment, a real
 * cost-scaling concern, unlike a reading, which is one deliberate action).
 * So Digestion/Sense/Design Sense/Motivation/Perspective/Environment/
 * Chiron Sign would silently never resolve there — `evaluateChartRule`'s
 * "null never matches" rule means a lesson gated on one of them would just
 * never unlock for anyone, no error, easy to ship by accident. Excluded
 * from this picker specifically; still valid for Report Builder's
 * `ReportPage.visibleIf`, which evaluates against a real generated
 * reading that does have them.
 */
export const COURSE_GATE_CHART_RULE_ATTRIBUTES = CHART_RULE_ATTRIBUTES.filter(
  (a) => !["digestion", "sense", "designSense", "motivation", "perspective", "environment", "chironSign"].includes(a.value),
);

export type ChartRuleOperator = "equals" | "notEquals" | "contains" | "notContains";

export const CHART_RULE_OPERATORS: { value: ChartRuleOperator; label: string }[] = [
  { value: "equals", label: "is" },
  { value: "notEquals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
];

export interface ChartRuleCondition {
  attribute: ChartRuleAttribute;
  operator: ChartRuleOperator;
  /** Always a plain string on the condition itself (what an editor UI collects) — compared against the resolved value below, which may be an array. */
  value: string;
}

/** What a reading needs to evaluate rules against — a subset of EnergeticDecoderReading, so callers don't need the full Firestore doc shape. */
export interface ChartRuleReadingInput {
  humanDesign?: HumanDesignProfile | null;
  astrology?: AstrologyChart | null;
}

function resolveAttributeValue(
  attribute: ChartRuleAttribute,
  reading: ChartRuleReadingInput,
): string | string[] | number[] | null {
  const hd = reading.humanDesign;
  const astro = reading.astrology;
  switch (attribute) {
    case "type":
      return hd?.type ?? null;
    case "authority":
      return hd?.authority ?? null;
    case "signature":
      return hd?.signature ?? null;
    case "notSelfTheme":
      return hd?.notSelfTheme ?? null;
    case "profileLines":
      if (!hd?.profile) return null;
      return hd.profile.split("/").map((s) => s.trim());
    case "definedCenters":
      return (hd?.definedCenters as CenterKey[] | undefined) ?? null;
    case "openCenters":
      return (hd?.openCenters as CenterKey[] | undefined) ?? null;
    case "activatedGates":
      return hd?.activatedGates ?? null;
    case "digestion":
      return hd?.variables?.digestion.value ?? null;
    case "sense":
      return hd?.variables?.sense.value ?? null;
    case "designSense":
      return hd?.variables?.designSense.value ?? null;
    case "motivation":
      return hd?.variables?.motivation.value ?? null;
    case "perspective":
      return hd?.variables?.perspective.value ?? null;
    case "environment":
      return hd?.variables?.environment.value ?? null;
    case "sunSign":
      return signOf(astro, "sun");
    case "moonSign":
      return signOf(astro, "moon");
    case "risingSign":
      // Ascendant isn't a placement — it's a chart angle, sign lives on `angles.ascendant`.
      return astro?.angles.ascendant.sign ?? null;
    case "chironSign":
      return signOf(astro, "chiron");
    default:
      return null;
  }
}

function signOf(astro: AstrologyChart | null | undefined, body: string): ZodiacSign | null {
  return astro?.placements.find((p) => p.body === body)?.sign ?? null;
}

/** Evaluates one condition against one reading. `null`/unresolvable attributes never match — a lesson gated on Astrology never unlocks for a reading that only has Human Design, rather than throwing. */
export function evaluateChartRule(condition: ChartRuleCondition, reading: ChartRuleReadingInput): boolean {
  const resolved = resolveAttributeValue(condition.attribute, reading);
  if (resolved === null) return false;

  const target = condition.value.trim().toLowerCase();
  if (Array.isArray(resolved)) {
    const values = resolved.map((v) => String(v).trim().toLowerCase());
    const has = values.includes(target);
    return condition.operator === "contains" || condition.operator === "equals" ? has : !has;
  }

  const value = String(resolved).trim().toLowerCase();
  switch (condition.operator) {
    case "equals":
      return value === target;
    case "notEquals":
      return value !== target;
    case "contains":
      return value.includes(target);
    case "notContains":
      return !value.includes(target);
  }
}
