import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSet } from "@/types/chart-design-set";
import { CHART_DESIGN_SET_SYSTEMS } from "@/types/chart-design-set";
import { CHART_DESIGN_SYSTEM_FIELDS, chartDesignStyleValues } from "./chart-design-fields";
import { CHART_DESIGN_PRESETS } from "./chart-design-presets";
import { chartDesignSetMember, defaultChartDesignSet } from "./chart-design-resolution";

/**
 * Ready-made Chart Designs (2026-10). The four former editor color presets
 * become ordinary, independently editable unified Chart Designs in every
 * workspace's library. Pure + client-safe: used by new-workspace seeding,
 * the one-time script for existing workspaces, and the checks.
 *
 * How each design is built, per chart system:
 *  1. an independent copy of that workspace's CURRENT Default record for
 *     that system (every styling value, house system included), then
 *  2. that system's own existing preset values on top — only fields the
 *     preset already defined for that system, so Human Design colors are
 *     never copied onto Mandala or Astrology, and nothing is invented.
 */

export const CHART_DESIGN_STARTERS = [
  { key: "magnetix-violet", name: "Magnetix Violet" },
  { key: "monochrome", name: "Monochrome" },
  { key: "warm-sunset", name: "Warm Sunset" },
  { key: "midnight", name: "Midnight" },
] as const;
export type ChartDesignStarterKey = (typeof CHART_DESIGN_STARTERS)[number]["key"];
export const CHART_DESIGN_STARTERS_VERSION = 1 as const;

/** Workspace marker (`subAccount.chartDesignStarters`): which ready-made designs were already added, so a re-run — or a design the workspace deleted — never brings one back. */
export interface ChartDesignStartersMarker {
  version: number;
  seeded: string[];
  seededAt?: string | null;
}

export function starterSetId(subAccountId: string, key: ChartDesignStarterKey): string {
  return `cds_starter_${subAccountId}_${key}`;
}
export function starterMemberId(setId: string, system: ChartDesignSystem): string {
  return `cd_${setId}_${system}`;
}

/** The preset values for one system of one starter — only that system's own fields. */
export function starterPresetValues(key: ChartDesignStarterKey, system: ChartDesignSystem): Record<string, string | number> {
  const starter = CHART_DESIGN_STARTERS.find((s) => s.key === key)!;
  const preset = CHART_DESIGN_PRESETS[system].find((p) => p.name === starter.name);
  if (!preset) return {};
  const allowed = CHART_DESIGN_SYSTEM_FIELDS[system] as readonly string[];
  const out: Record<string, string | number> = {};
  for (const [field, value] of Object.entries(preset.values)) {
    if (allowed.includes(field) && (typeof value === "string" || typeof value === "number")) out[field] = value;
  }
  return out;
}

/** A complete styling record for one system: the Default's values, then this starter's preset values for that system. */
export function starterSystemValues(
  base: object,
  key: ChartDesignStarterKey,
  system: ChartDesignSystem,
): Record<string, unknown> {
  return { ...chartDesignStyleValues(base), ...starterPresetValues(key, system) };
}

export interface PlannedStarterDesign {
  key: ChartDesignStarterKey;
  setId: string;
  name: string;
  /** Set when the plain name was already taken by one of the workspace's own designs. */
  renamedBecauseTaken: string | null;
  members: Record<ChartDesignSystem, { id: string; values: Record<string, unknown>; copiedFrom: string | null }>;
}

export interface StarterPlan {
  subAccountId: string;
  status: "ready" | "nothing-to-do" | "not-migrated" | "blocked";
  creates: PlannedStarterDesign[];
  skipped: { key: ChartDesignStarterKey; reason: string }[];
  blockers: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/** A name no other design in the workspace uses (case-insensitive): "X", else "X (ready-made)", "X (ready-made 2)", … */
function freeName(base: string, taken: Set<string>): string {
  if (!taken.has(norm(base))) return base;
  for (let i = 1; ; i += 1) {
    const candidate = i === 1 ? `${base} (ready-made)` : `${base} (ready-made ${i})`;
    if (!taken.has(norm(candidate))) return candidate;
  }
}

export function planStarterDesigns(input: {
  subAccountId: string;
  designs: readonly ChartDesign[];
  sets: readonly ChartDesignSet[];
  marker: ChartDesignStartersMarker | null | undefined;
}): StarterPlan {
  const { subAccountId } = input;
  const designs = input.designs.filter((d) => d.subAccountId === subAccountId);
  const sets = input.sets.filter((s) => s.subAccountId === subAccountId);
  const plan: StarterPlan = { subAccountId, status: "ready", creates: [], skipped: [], blockers: [] };

  if (sets.length === 0) {
    plan.status = designs.length > 0 ? "not-migrated" : "nothing-to-do";
    return plan;
  }
  const def = defaultChartDesignSet(sets, subAccountId);
  const base = {} as Record<ChartDesignSystem, ChartDesign | null>;
  for (const system of CHART_DESIGN_SET_SYSTEMS) base[system] = def ? chartDesignSetMember(def, system, designs, subAccountId) : null;
  if (!def || CHART_DESIGN_SET_SYSTEMS.some((s) => !base[s])) {
    plan.status = "blocked";
    plan.blockers.push("The workspace's Default design is missing or incomplete — the ready-made designs copy from it.");
    return plan;
  }

  const seeded = new Set(input.marker?.seeded ?? []);
  const taken = new Set(sets.map((s) => norm(s.name)));
  for (const starter of CHART_DESIGN_STARTERS) {
    if (seeded.has(starter.key)) {
      plan.skipped.push({ key: starter.key, reason: "already added to this workspace before (kept as is, even if renamed, edited or deleted)" });
      continue;
    }
    const existing = sets.find((s) => s.starter?.key === starter.key);
    if (existing) {
      plan.skipped.push({ key: starter.key, reason: `already exists as "${existing.name}"` });
      continue;
    }
    const setId = starterSetId(subAccountId, starter.key);
    if (sets.some((s) => s.id === setId) || designs.some((d) => d.ownerSetId === setId)) {
      plan.blockers.push(`${starter.name}: id ${setId} is already in use`);
      continue;
    }
    const name = freeName(starter.name, taken);
    taken.add(norm(name));
    const members = {} as PlannedStarterDesign["members"];
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      members[system] = {
        id: starterMemberId(setId, system),
        values: starterSystemValues(base[system]!, starter.key, system),
        copiedFrom: base[system]!.id,
      };
    }
    plan.creates.push({ key: starter.key, setId, name, renamedBecauseTaken: name === starter.name ? null : starter.name, members });
  }
  if (plan.blockers.length > 0) plan.status = "blocked";
  else if (plan.creates.length === 0) plan.status = "nothing-to-do";
  return plan;
}
