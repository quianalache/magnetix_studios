import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSet } from "@/types/chart-design-set";
import type { EnergeticProfile } from "@/types/energetic-profile";

/**
 * Which chart design renders for a Profile, per system — the ONE shared
 * resolution rule (unified Chart Designs, 2026-10). Pure and client-safe:
 * the server service wraps it, and the migration/report-freeze tooling uses
 * it directly, so every surface agrees.
 *
 * Order (approved):
 *  1. the Profile's unified design (`chartDesignSetId`), when valid;
 *  2. the Profile's legacy per-system override — only during the migration
 *     to unified designs, retired once it's verified;
 *  3. the sub-account's default unified design;
 *  4. the legacy per-system default record;
 *  5. none — the renderer's own built-in fallback colors.
 *
 * "Valid" always includes tenant scope: a set or design from another
 * sub-account never resolves, even if its id is stored on a Profile. A set
 * member also has to really belong to that set (`ownerSetId`) and be the
 * right system, so a damaged reference falls through instead of rendering
 * the wrong chart.
 */

export type ChartDesignProfileRefs = Pick<
  EnergeticProfile,
  "chartDesignSetId" | "hdChartDesignId" | "mandalaChartDesignId" | "astrologyChartDesignId"
>;

export interface ChartDesignResolutionInput {
  subAccountId: string;
  /** This sub-account's chart design records (anything else is ignored). */
  designs: readonly ChartDesign[];
  /** This sub-account's unified designs (anything else is ignored). */
  sets: readonly ChartDesignSet[];
  profile: Partial<ChartDesignProfileRefs> | null;
}

export type ChartDesignResolutionSource = "profileSet" | "legacyOverride" | "defaultSet" | "legacyDefault" | "none";

export interface ResolvedChartDesign {
  design: ChartDesign | null;
  source: ChartDesignResolutionSource;
  /** The unified design it came from (profileSet/defaultSet only). */
  setId: string | null;
}

const LEGACY_OVERRIDE_FIELD: Record<ChartDesignSystem, keyof ChartDesignProfileRefs> = {
  humanDesign: "hdChartDesignId",
  mandala: "mandalaChartDesignId",
  astrology: "astrologyChartDesignId",
};

function byCreatedThenId(a: { createdAt: string | null; id: string }, b: { createdAt: string | null; id: string }) {
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The set's member record for a system, only if it's genuinely that set's, in this sub-account, and the right system. */
export function chartDesignSetMember(
  set: ChartDesignSet,
  system: ChartDesignSystem,
  designs: readonly ChartDesign[],
  subAccountId: string,
): ChartDesign | null {
  if (set.subAccountId !== subAccountId) return null;
  const memberId = set.members?.[system];
  if (!memberId) return null;
  const design = designs.find((d) => d.id === memberId);
  if (!design) return null;
  if (design.subAccountId !== subAccountId || design.system !== system || design.ownerSetId !== set.id) return null;
  return design;
}

/** The sub-account's default unified design (deterministic if — against the invariant — more than one is flagged). */
export function defaultChartDesignSet(sets: readonly ChartDesignSet[], subAccountId: string): ChartDesignSet | null {
  const defaults = sets.filter((s) => s.subAccountId === subAccountId && s.isDefault).sort(byCreatedThenId);
  return defaults[0] ?? null;
}

/** The legacy per-system default record (deterministic if more than one is flagged). */
export function legacyDefaultChartDesign(
  designs: readonly ChartDesign[],
  subAccountId: string,
  system: ChartDesignSystem,
): ChartDesign | null {
  const defaults = designs
    .filter((d) => d.subAccountId === subAccountId && d.system === system && d.isDefault)
    .sort(byCreatedThenId);
  return defaults[0] ?? null;
}

export function resolveChartDesign(input: ChartDesignResolutionInput, system: ChartDesignSystem): ResolvedChartDesign {
  const { subAccountId, designs, sets, profile } = input;

  const profileSetId = profile?.chartDesignSetId;
  if (profileSetId) {
    const set = sets.find((s) => s.id === profileSetId && s.subAccountId === subAccountId);
    const member = set ? chartDesignSetMember(set, system, designs, subAccountId) : null;
    if (set && member) return { design: member, source: "profileSet", setId: set.id };
  }

  const legacyId = profile?.[LEGACY_OVERRIDE_FIELD[system]];
  if (typeof legacyId === "string" && legacyId) {
    const legacy = designs.find((d) => d.id === legacyId);
    if (legacy && legacy.subAccountId === subAccountId && legacy.system === system) {
      return { design: legacy, source: "legacyOverride", setId: null };
    }
  }

  const defaultSet = defaultChartDesignSet(sets, subAccountId);
  if (defaultSet) {
    const member = chartDesignSetMember(defaultSet, system, designs, subAccountId);
    if (member) return { design: member, source: "defaultSet", setId: defaultSet.id };
  }

  const legacyDefault = legacyDefaultChartDesign(designs, subAccountId, system);
  if (legacyDefault) return { design: legacyDefault, source: "legacyDefault", setId: null };

  return { design: null, source: "none", setId: null };
}

export interface ResolvedReadingChartDesigns {
  hdDesign: ChartDesign | null;
  mandalaDesign: ChartDesign | null;
  astroDesign: ChartDesign | null;
  /** The unified design every resolved system came from, or null when they came from legacy/mixed sources. */
  setId: string | null;
  setName: string | null;
}

/**
 * All of a reading's systems at once — Human Design and its Mandala style
 * only when the reading has Human Design, Astrology only when it has
 * Astrology (same presence rule every report surface has always used).
 */
export function resolveReadingChartDesigns(
  input: ChartDesignResolutionInput,
  reading: { humanDesign?: unknown; astrology?: unknown },
): ResolvedReadingChartDesigns {
  const hd = reading.humanDesign ? resolveChartDesign(input, "humanDesign") : null;
  const mandala = reading.humanDesign ? resolveChartDesign(input, "mandala") : null;
  const astro = reading.astrology ? resolveChartDesign(input, "astrology") : null;
  const resolved = [hd, mandala, astro].filter((r): r is ResolvedChartDesign => r !== null);
  const setIds = new Set(resolved.map((r) => r.setId));
  const setId = resolved.length > 0 && setIds.size === 1 ? [...setIds][0] : null;
  const setName = setId ? (input.sets.find((s) => s.id === setId)?.name ?? null) : null;
  return {
    hdDesign: hd?.design ?? null,
    mandalaDesign: mandala?.design ?? null,
    astroDesign: astro?.design ?? null,
    setId,
    setName,
  };
}
