import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSet, ChartDesignSetMigrationInfo } from "@/types/chart-design-set";
import { CHART_DESIGN_SET_SYSTEMS } from "@/types/chart-design-set";
import { chartDesignFingerprint, chartDesignStyleValues } from "./chart-design-fields";
import {
  chartDesignSetMember,
  defaultChartDesignSet,
  resolveChartDesign,
  type ChartDesignProfileRefs,
} from "./chart-design-resolution";

/**
 * Unified Chart Designs — the one-time migration's PURE planner and the
 * integrity checker (2026-10). No I/O here: the runner
 * (scripts/lib/chart-design-set-migration-runner.ts) loads one
 * sub-account's records, asks for a plan, and writes it atomically; the
 * emulator checks call these directly.
 *
 * Deterministic grouping, per sub-account (approved plan):
 *  1. The three per-system default records → the "Default" unified design.
 *  2. Remaining records grouped by exact name (trimmed, case-insensitive),
 *     at most one per system, oldest first; leftovers start further groups.
 *  3. A group missing a system gets an INDEPENDENT COPY of the default's
 *     record for that system (owned by the new design) — never a shared
 *     reference, and no existing record's values are changed.
 *  4. Profiles with legacy per-system overrides get the unified design that
 *     reproduces their current appearance exactly; when none does (the
 *     overrides span several designs), a "<Profile> (migrated)" design made
 *     of copies is created for them.
 *
 * Deterministic ids (`cds_<anchor record id>`, `cds_profile_<profileId>`,
 * `cd_<setId>_<system>`) make a re-run plan the same writes; the runner
 * creates them with create() and the planner skips anything already owned.
 */

export interface MigrationProfile extends Partial<ChartDesignProfileRefs> {
  id: string;
  subAccountId: string;
  name?: string;
}

export interface PlannedSet {
  id: string;
  name: string;
  isDefault: boolean;
  members: Record<ChartDesignSystem, string>;
  migration: Omit<ChartDesignSetMigrationInfo, "migratedAt">;
}

export interface PlannedCopy {
  id: string;
  setId: string;
  system: ChartDesignSystem;
  name: string;
  sourceDesignId: string;
  values: Record<string, unknown>;
}

export interface ChartDesignSetMigrationPlan {
  subAccountId: string;
  agencyId: string;
  status: "ready" | "nothing-to-do" | "blocked";
  blockers: string[];
  warnings: string[];
  sets: PlannedSet[];
  copies: PlannedCopy[];
  /** Existing records gaining `ownerSetId` (no other field touched). */
  ownerStamps: { designId: string; setId: string }[];
  profileAssignments: { profileId: string; setId: string }[];
}

const norm = (name: string | undefined) => (name ?? "").trim().toLowerCase();

function byCreatedThenId(a: ChartDesign, b: ChartDesign) {
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function planChartDesignSetMigration(input: {
  subAccountId: string;
  agencyId: string;
  designs: readonly ChartDesign[];
  sets: readonly ChartDesignSet[];
  profiles: readonly MigrationProfile[];
}): ChartDesignSetMigrationPlan {
  const { subAccountId, agencyId } = input;
  const designs = input.designs.filter((d) => d.subAccountId === subAccountId);
  const sets = input.sets.filter((s) => s.subAccountId === subAccountId);
  const profiles = input.profiles.filter((p) => p.subAccountId === subAccountId);
  const plan: ChartDesignSetMigrationPlan = {
    subAccountId,
    agencyId,
    status: "ready",
    blockers: [],
    warnings: [],
    sets: [],
    copies: [],
    ownerStamps: [],
    profileAssignments: [],
  };

  const unowned = designs.filter((d) => !d.ownerSetId).sort(byCreatedThenId);
  for (const d of designs) {
    if (d.ownerSetId && !sets.some((s) => s.id === d.ownerSetId)) {
      plan.blockers.push(`Record ${d.id} claims unified design ${d.ownerSetId}, which doesn't exist.`);
    }
  }

  // ── 1. The default group ────────────────────────────────────────────
  // Either the existing default unified design, or (first run) the three
  // legacy default records.
  const existingDefault = defaultChartDesignSet(sets, subAccountId);
  const defaultSource = {} as Record<ChartDesignSystem, ChartDesign | null>;
  let defaultSetId: string;
  if (existingDefault) {
    defaultSetId = existingDefault.id;
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      defaultSource[system] = chartDesignSetMember(existingDefault, system, designs, subAccountId);
      if (!defaultSource[system]) plan.blockers.push(`The default unified design is missing its ${system} record.`);
    }
    for (const d of unowned) {
      if (d.isDefault) {
        plan.blockers.push(`Record ${d.id} ("${d.name}") is flagged default but isn't part of the default unified design.`);
      }
    }
  } else {
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      const flagged = unowned.filter((d) => d.system === system && d.isDefault);
      if (flagged.length !== 1) {
        plan.blockers.push(
          flagged.length === 0
            ? `No default ${system} record — needs a decision before it can be grouped.`
            : `${flagged.length} records are flagged as the default ${system} design — needs a decision.`,
        );
        defaultSource[system] = flagged[0] ?? null;
      } else {
        defaultSource[system] = flagged[0];
      }
    }
    const anchor = CHART_DESIGN_SET_SYSTEMS.map((s) => defaultSource[s]).find(Boolean);
    defaultSetId = anchor ? `cds_${anchor.id}` : `cds_default_${subAccountId}`;
  }

  if (plan.blockers.length > 0) {
    plan.status = "blocked";
    return plan;
  }

  const copyOfDefault = (setId: string, system: ChartDesignSystem, name: string): PlannedCopy => {
    const source = defaultSource[system]!;
    return {
      id: `cd_${setId}_${system}`,
      setId,
      system,
      name,
      sourceDesignId: source.id,
      values: chartDesignStyleValues(source),
    };
  };

  /** Final record per system for every set (existing + planned) — used to match Profiles to designs. */
  const setMembersBySet = new Map<string, Record<ChartDesignSystem, { id: string; fingerprint: string }>>();
  const fingerprintOf = (id: string) => {
    const d = designs.find((x) => x.id === id);
    if (d) return chartDesignFingerprint(d);
    const copy = plan.copies.find((c) => c.id === id);
    return copy ? chartDesignFingerprint(copy.values) : "";
  };
  for (const s of sets) {
    const m = {} as Record<ChartDesignSystem, { id: string; fingerprint: string }>;
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      const member = chartDesignSetMember(s, system, designs, subAccountId);
      m[system] = { id: member?.id ?? "", fingerprint: member ? chartDesignFingerprint(member) : "" };
    }
    setMembersBySet.set(s.id, m);
  }

  const addSet = (
    id: string,
    name: string,
    isDefault: boolean,
    originals: Partial<Record<ChartDesignSystem, ChartDesign>>,
    source: ChartDesignSetMigrationInfo["source"],
    copySources?: Partial<Record<ChartDesignSystem, ChartDesign>>,
  ) => {
    const members = {} as Record<ChartDesignSystem, string>;
    const copied: ChartDesignSystem[] = [];
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      const original = originals[system];
      if (original) {
        members[system] = original.id;
        plan.ownerStamps.push({ designId: original.id, setId: id });
      } else {
        const fromRecord = copySources?.[system];
        const copy = fromRecord
          ? {
              id: `cd_${id}_${system}`,
              setId: id,
              system,
              name,
              sourceDesignId: fromRecord.id,
              values: chartDesignStyleValues(fromRecord),
            }
          : copyOfDefault(id, system, name);
        plan.copies.push(copy);
        members[system] = copy.id;
        copied.push(system);
      }
    }
    plan.sets.push({ id, name, isDefault, members, migration: { version: 1, source, copiedSystems: copied } });
    const m = {} as Record<ChartDesignSystem, { id: string; fingerprint: string }>;
    for (const system of CHART_DESIGN_SET_SYSTEMS) m[system] = { id: members[system], fingerprint: fingerprintOf(members[system]) };
    setMembersBySet.set(id, m);
  };

  if (!existingDefault) {
    addSet(
      defaultSetId,
      "Default",
      true,
      { humanDesign: defaultSource.humanDesign!, mandala: defaultSource.mandala!, astrology: defaultSource.astrology! },
      "default",
    );
  }

  // ── 2/3. Remaining records, grouped by name ─────────────────────────
  const claimed = new Set(plan.ownerStamps.map((o) => o.designId));
  const rest = unowned.filter((d) => !claimed.has(d.id));
  const groups: Partial<Record<ChartDesignSystem, ChartDesign>>[] = [];
  const nameOrder: string[] = [];
  const byName = new Map<string, Partial<Record<ChartDesignSystem, ChartDesign>>[]>();
  for (const d of rest) {
    const key = norm(d.name);
    if (!byName.has(key)) {
      byName.set(key, []);
      nameOrder.push(key);
    }
    const list = byName.get(key)!;
    let group = list.find((g) => !g[d.system]);
    if (!group) {
      group = {};
      list.push(group);
    }
    group[d.system] = d;
  }
  for (const key of nameOrder) groups.push(...byName.get(key)!);
  for (const group of groups) {
    const anchor = CHART_DESIGN_SET_SYSTEMS.map((s) => group[s]).find(Boolean)!;
    const name = anchor.name?.trim() || "Untitled design";
    addSet(`cds_${anchor.id}`, name, false, group, "named");
  }

  // ── 4. Profiles with legacy overrides ───────────────────────────────
  const overrideKey: Record<ChartDesignSystem, keyof ChartDesignProfileRefs> = {
    humanDesign: "hdChartDesignId",
    mandala: "mandalaChartDesignId",
    astrology: "astrologyChartDesignId",
  };
  for (const profile of profiles) {
    if (profile.chartDesignSetId) continue;
    const hasLegacy = CHART_DESIGN_SET_SYSTEMS.some((s) => profile[overrideKey[s]]);
    if (!hasLegacy) continue;

    // What this Profile renders today, per system (the live rule, before any change).
    const target = {} as Record<ChartDesignSystem, ChartDesign | null>;
    let anyValidOverride = false;
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      const r = resolveChartDesign({ subAccountId, designs, sets, profile }, system);
      target[system] = r.design;
      if (r.source === "legacyOverride") anyValidOverride = true;
      const raw = profile[overrideKey[system]];
      if (raw && r.source !== "legacyOverride") {
        plan.warnings.push(
          `Profile ${profile.id}: ${system} override ${raw} doesn't resolve (missing, other workspace or wrong system) — it already renders the default and keeps doing so.`,
        );
      }
    }
    if (!anyValidOverride) continue; // renders exactly the default today → nothing to assign

    const targetPrints = CHART_DESIGN_SET_SYSTEMS.map((s) => (target[s] ? chartDesignFingerprint(target[s]!) : ""));
    const overriddenIds = new Set(
      CHART_DESIGN_SET_SYSTEMS.map((s) => profile[overrideKey[s]]).filter((x): x is string => typeof x === "string"),
    );
    // Prefer a design that contains one of the override records itself and
    // looks identical in every system; otherwise build one from copies.
    const candidate = [...setMembersBySet.entries()].find(
      ([, m]) =>
        CHART_DESIGN_SET_SYSTEMS.some((s) => overriddenIds.has(m[s].id)) &&
        CHART_DESIGN_SET_SYSTEMS.every((s, i) => m[s].fingerprint === targetPrints[i]),
    );
    if (candidate) {
      plan.profileAssignments.push({ profileId: profile.id, setId: candidate[0] });
      continue;
    }
    const setId = `cds_profile_${profile.id}`;
    const copySources: Partial<Record<ChartDesignSystem, ChartDesign>> = {};
    for (const s of CHART_DESIGN_SET_SYSTEMS) if (target[s]) copySources[s] = target[s]!;
    addSet(setId, `${profile.name?.trim() || "Profile"} (migrated)`, false, {}, "profile-mix", copySources);
    plan.profileAssignments.push({ profileId: profile.id, setId });
  }

  if (plan.sets.length === 0 && plan.ownerStamps.length === 0 && plan.profileAssignments.length === 0) {
    plan.status = "nothing-to-do";
  }
  return plan;
}

/**
 * Every invariant of a migrated sub-account. Empty list = consistent. Used
 * after every live run (and by the emulator checks); an unmigrated
 * sub-account (no unified designs yet) is reported as such, not as broken.
 */
export function checkChartDesignSetIntegrity(input: {
  subAccountId: string;
  designs: readonly ChartDesign[];
  sets: readonly ChartDesignSet[];
  profiles: readonly MigrationProfile[];
}): string[] {
  const { subAccountId } = input;
  const designs = input.designs.filter((d) => d.subAccountId === subAccountId);
  const sets = input.sets.filter((s) => s.subAccountId === subAccountId);
  const profiles = input.profiles.filter((p) => p.subAccountId === subAccountId);
  const problems: string[] = [];
  if (sets.length === 0) return designs.length > 0 ? ["not migrated: no unified designs yet"] : [];

  const defaults = sets.filter((s) => s.isDefault);
  if (defaults.length !== 1) problems.push(`${defaults.length} default unified designs (expected exactly 1)`);
  const defaultId = defaults[0]?.id;

  const memberOf = new Map<string, string>();
  for (const set of sets) {
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      const memberId = set.members?.[system];
      const member = designs.find((d) => d.id === memberId);
      if (!member) {
        problems.push(`set ${set.id}: ${system} record ${memberId || "(none)"} is missing`);
        continue;
      }
      if (member.system !== system) problems.push(`set ${set.id}: ${system} slot holds a ${member.system} record (${member.id})`);
      if (member.ownerSetId !== set.id) problems.push(`set ${set.id}: record ${member.id} is owned by ${member.ownerSetId ?? "nobody"}`);
      if (memberOf.has(member.id)) problems.push(`record ${member.id} is shared by sets ${memberOf.get(member.id)} and ${set.id}`);
      memberOf.set(member.id, set.id);
    }
    if (set.members?.frequency !== null) problems.push(`set ${set.id}: frequency slot must be empty`);
  }
  for (const d of designs) {
    if (!d.ownerSetId) problems.push(`record ${d.id} ("${d.name}", ${d.system}) belongs to no unified design`);
    else if (memberOf.get(d.id) !== d.ownerSetId) problems.push(`record ${d.id} claims set ${d.ownerSetId} but isn't its member`);
    const shouldBeDefault = d.ownerSetId === defaultId;
    if (d.isDefault !== shouldBeDefault) problems.push(`record ${d.id}: isDefault=${d.isDefault} but its set ${shouldBeDefault ? "is" : "isn't"} the default`);
  }
  for (const p of profiles) {
    if (p.chartDesignSetId && !sets.some((s) => s.id === p.chartDesignSetId)) {
      problems.push(`profile ${p.id}: chartDesignSetId ${p.chartDesignSetId} doesn't exist in this workspace`);
    }
  }
  return problems;
}
