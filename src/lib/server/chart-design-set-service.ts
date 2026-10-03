import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ChartDesignSet, ChartDesignSetWithMembers } from "@/types/chart-design-set";
import { CHART_DESIGN_SET_SYSTEMS } from "@/types/chart-design-set";
import {
  designsCol,
  freshDesignFields,
  loadChartDesignData,
  setsCol,
  toDesign,
  toSet,
} from "@/lib/server/chart-design-records";
import {
  chartDesignStyleValues,
  sanitizeChartDesignSystemPatch,
  type ChartDesignSystemPatch,
} from "@/lib/energetics/chart-design-fields";
import { chartDesignSetMember, defaultChartDesignSet } from "@/lib/energetics/chart-design-resolution";

/**
 * Unified Chart Designs (2026-10) — one named design per look, grouping one
 * record per chart system (see src/types/chart-design-set.ts for the
 * invariants). Every write here keeps them: members are created for and
 * owned by exactly one set, and the per-system `isDefault` flags always
 * mirror the default set so legacy readers stay correct.
 */

export class ChartDesignSetError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_NAME = 80;

function cleanName(raw: unknown, fallback: string): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_NAME) : "";
  return name || fallback;
}

function withMembers(set: ChartDesignSet, designs: readonly ChartDesign[]): ChartDesignSetWithMembers {
  const out = { humanDesign: null, mandala: null, astrology: null } as Record<ChartDesignSystem, ChartDesign | null>;
  for (const system of CHART_DESIGN_SET_SYSTEMS) {
    out[system] = chartDesignSetMember(set, system, designs, set.subAccountId);
  }
  return { ...set, designs: out };
}

function sortSets(sets: ChartDesignSetWithMembers[]): ChartDesignSetWithMembers[] {
  return [...sets].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
  });
}

/** Deterministic ids for a brand-new sub-account's default design, so concurrent first loads can't create two. */
export function freshDefaultSetId(subAccountId: string): string {
  return `cds_default_${subAccountId}`;
}
export function setMemberId(setId: string, system: ChartDesignSystem): string {
  return `cd_${setId}_${system}`;
}

/**
 * Makes sure a sub-account has its default unified design.
 *  - Already has unified designs → returns the default one.
 *  - Brand-new sub-account (no chart designs at all) → creates the default
 *    design and its three records in one transaction (idempotent:
 *    deterministic ids + create()).
 *  - Has legacy per-system records but no unified designs yet → returns
 *    null and creates NOTHING: grouping existing records is the one-time
 *    migration's job (scripts/migrate-chart-design-sets.ts), run only with
 *    explicit authorization. Until then everything resolves exactly as
 *    before through the legacy defaults.
 */
export async function ensureDefaultChartDesignSet(
  subAccountId: string,
  agencyId: string,
): Promise<ChartDesignSet | null> {
  const db = getAdminDb();
  return db.runTransaction(async (tx) => {
    const [designSnap, setSnap] = await Promise.all([
      tx.get(designsCol().where("subAccountId", "==", subAccountId)),
      tx.get(setsCol().where("subAccountId", "==", subAccountId)),
    ]);
    if (!setSnap.empty) {
      return defaultChartDesignSet(
        setSnap.docs.map((d) => toSet(d.id, d.data())),
        subAccountId,
      );
    }
    if (!designSnap.empty) return null;

    const setId = freshDefaultSetId(subAccountId);
    const fresh = freshDesignFields();
    // Same carry-over the legacy seed has always done: a color the
    // practitioner set through the old single picker isn't reset.
    const subSnap = await tx.get(db.doc(`subAccounts/${subAccountId}`));
    const legacyColor = subSnap.data()?.energeticDecoderTheme?.chartDefinedColor;
    const members = {} as Record<ChartDesignSystem, string>;
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      const id = setMemberId(setId, system);
      members[system] = id;
      tx.create(designsCol().doc(id), {
        subAccountId,
        agencyId,
        system,
        name: "Default",
        isDefault: true,
        ownerSetId: setId,
        ...fresh,
        ...(system === "humanDesign" && typeof legacyColor === "string" && legacyColor
          ? { chartDefinedColor: legacyColor }
          : {}),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    const setDoc = {
      subAccountId,
      agencyId,
      name: "Default",
      isDefault: true,
      members: { ...members, frequency: null },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.create(setsCol().doc(setId), setDoc);
    return toSet(setId, setDoc);
  });
}

export interface ChartDesignSetList {
  sets: ChartDesignSetWithMembers[];
  /** True while this sub-account still has legacy records that haven't been grouped by the migration. */
  migrationRequired: boolean;
}

export async function listChartDesignSets(subAccountId: string, agencyId: string): Promise<ChartDesignSetList> {
  await ensureDefaultChartDesignSet(subAccountId, agencyId);
  const { designs, sets } = await loadChartDesignData(subAccountId);
  return {
    sets: sortSets(sets.map((s) => withMembers(s, designs))),
    migrationRequired: sets.length === 0 && designs.length > 0,
  };
}

export async function getChartDesignSet(subAccountId: string, setId: string): Promise<ChartDesignSetWithMembers | null> {
  const snap = await setsCol().doc(setId).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  const { designs } = await loadChartDesignData(subAccountId);
  return withMembers(toSet(snap.id, snap.data()!), designs);
}

/**
 * Creates a new unified design as an independent deep copy of another one
 * (the sub-account default when no source is given) — never shared member
 * records. Used by "New Chart Design", "Duplicate", and legacy single-record
 * creation in a migrated sub-account.
 */
export async function createChartDesignSet(opts: {
  subAccountId: string;
  agencyId: string;
  name?: unknown;
  sourceSetId?: string | null;
}): Promise<ChartDesignSetWithMembers> {
  const { subAccountId, agencyId } = opts;
  await ensureDefaultChartDesignSet(subAccountId, agencyId);
  const { designs, sets } = await loadChartDesignData(subAccountId);
  if (sets.length === 0) {
    throw new ChartDesignSetError(
      409,
      "This workspace's chart designs haven't been converted to unified Chart Designs yet.",
    );
  }
  const source = opts.sourceSetId
    ? sets.find((s) => s.id === opts.sourceSetId)
    : defaultChartDesignSet(sets, subAccountId);
  if (!source) throw new ChartDesignSetError(404, "Chart design not found");

  const name = cleanName(opts.name, opts.sourceSetId ? `Copy of ${source.name}` : "Untitled design");
  const setRef = setsCol().doc();
  const batch = getAdminDb().batch();
  const members = {} as Record<ChartDesignSystem, string>;
  for (const system of CHART_DESIGN_SET_SYSTEMS) {
    const sourceMember = chartDesignSetMember(source, system, designs, subAccountId);
    const values = sourceMember ? chartDesignStyleValues(sourceMember) : freshDesignFields();
    const memberRef = designsCol().doc();
    members[system] = memberRef.id;
    batch.create(memberRef, {
      ...values,
      subAccountId,
      agencyId,
      system,
      name,
      isDefault: false,
      ownerSetId: setRef.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.create(setRef, {
    subAccountId,
    agencyId,
    name,
    isDefault: false,
    members: { ...members, frequency: null },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  const created = await getChartDesignSet(subAccountId, setRef.id);
  if (!created) throw new ChartDesignSetError(500, "Couldn't load the new chart design.");
  return created;
}

export function duplicateChartDesignSet(opts: { subAccountId: string; agencyId: string; setId: string; name?: unknown }) {
  return createChartDesignSet({ ...opts, sourceSetId: opts.setId });
}

/** Parses a PATCH body's per-system objects through the shared allow-list. */
const HOUSE_SYSTEMS = ["placidus", "whole", "equal"] as const;
export type ChartDesignHouseSystem = (typeof HOUSE_SYSTEMS)[number];

export function readChartDesignSetPatch(body: Record<string, unknown>): {
  name?: string;
  systems: Partial<Record<ChartDesignSystem, ChartDesignSystemPatch>>;
  houseSystem?: ChartDesignHouseSystem;
  errors: string[];
} {
  const errors: string[] = [];
  const systems: Partial<Record<ChartDesignSystem, ChartDesignSystemPatch>> = {};
  for (const system of CHART_DESIGN_SET_SYSTEMS) {
    if (body[system] === undefined) continue;
    const { patch, errors: e } = sanitizeChartDesignSystemPatch(system, body[system]);
    errors.push(...e);
    if (Object.keys(patch).length > 0) systems[system] = patch;
  }
  // The Astrology house system is a CALCULATION setting, not styling (it
  // decides how new readings are calculated). It's kept apart from the
  // visual fields and only accepted for the default design — the one new
  // readings use — until it moves to the reading calculation settings.
  let houseSystem: ChartDesignHouseSystem | undefined;
  if (body.astrologyCalculation !== undefined) {
    const raw = (body.astrologyCalculation as Record<string, unknown> | null)?.houseSystem;
    const keys = body.astrologyCalculation && typeof body.astrologyCalculation === "object" ? Object.keys(body.astrologyCalculation) : [];
    if (keys.length !== 1 || !HOUSE_SYSTEMS.includes(raw as ChartDesignHouseSystem)) {
      errors.push(`astrologyCalculation: houseSystem must be one of ${HOUSE_SYSTEMS.join(", ")}`);
    } else houseSystem = raw as ChartDesignHouseSystem;
  }
  let name: string | undefined;
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) errors.push("Name can't be empty.");
    else name = cleanName(body.name, "Untitled design");
  }
  return { name, systems, houseSystem, errors };
}

/**
 * One save for the whole unified design: the name and any systems' fields,
 * written in a single batch to this set's OWN records only.
 */
export async function updateChartDesignSet(
  subAccountId: string,
  setId: string,
  update: {
    name?: string;
    systems: Partial<Record<ChartDesignSystem, ChartDesignSystemPatch>>;
    houseSystem?: ChartDesignHouseSystem;
  },
): Promise<ChartDesignSetWithMembers> {
  const set = await getChartDesignSet(subAccountId, setId);
  if (!set) throw new ChartDesignSetError(404, "Chart design not found");
  if (update.houseSystem !== undefined && !set.isDefault) {
    throw new ChartDesignSetError(
      409,
      "The house system is a calculation setting — it can only be changed on the default chart design.",
    );
  }

  const batch = getAdminDb().batch();
  for (const system of CHART_DESIGN_SET_SYSTEMS) {
    const patch = update.systems[system];
    if (!patch || Object.keys(patch).length === 0) continue;
    const member = set.designs[system];
    if (!member) throw new ChartDesignSetError(409, "This chart design is incomplete — it can't be edited until it's repaired.");
    batch.update(designsCol().doc(member.id), { ...patch, updatedAt: FieldValue.serverTimestamp() });
  }
  if (update.houseSystem !== undefined) {
    const astro = set.designs.astrology;
    if (!astro) throw new ChartDesignSetError(409, "This chart design is incomplete — it can't be edited until it's repaired.");
    batch.update(designsCol().doc(astro.id), { houseSystem: update.houseSystem, updatedAt: FieldValue.serverTimestamp() });
  }
  if (update.name !== undefined) {
    batch.update(setsCol().doc(set.id), { name: update.name, updatedAt: FieldValue.serverTimestamp() });
    for (const system of CHART_DESIGN_SET_SYSTEMS) {
      const member = set.designs[system];
      if (member) batch.update(designsCol().doc(member.id), { name: update.name });
    }
  } else {
    batch.update(setsCol().doc(set.id), { updatedAt: FieldValue.serverTimestamp() });
  }
  // Legacy write-through, same as updateChartDesign: the public pages still
  // read energeticDecoderTheme.chartDefinedColor directly in places.
  const hdColor = update.systems.humanDesign?.chartDefinedColor;
  if (set.isDefault && hdColor) {
    batch.set(
      getAdminDb().doc(`subAccounts/${subAccountId}`),
      { energeticDecoderTheme: { chartDefinedColor: hdColor } },
      { merge: true },
    );
  }
  await batch.commit();
  const updated = await getChartDesignSet(subAccountId, setId);
  if (!updated) throw new ChartDesignSetError(404, "Chart design not found");
  return updated;
}

/** Makes one unified design the default, and mirrors that onto every record's per-system `isDefault` flag. */
export async function setDefaultChartDesignSet(subAccountId: string, setId: string): Promise<ChartDesignSetWithMembers> {
  const set = await getChartDesignSet(subAccountId, setId);
  if (!set) throw new ChartDesignSetError(404, "Chart design not found");
  if (CHART_DESIGN_SET_SYSTEMS.some((s) => !set.designs[s])) {
    throw new ChartDesignSetError(409, "An incomplete chart design can't be the default.");
  }
  const [setSnap, designSnap] = await Promise.all([
    setsCol().where("subAccountId", "==", subAccountId).get(),
    designsCol().where("subAccountId", "==", subAccountId).get(),
  ]);
  const batch = getAdminDb().batch();
  for (const doc of setSnap.docs) {
    batch.update(doc.ref, { isDefault: doc.id === setId, updatedAt: FieldValue.serverTimestamp() });
  }
  // New readings are calculated with the default design's house system.
  // Changing which design is the default is a STYLING choice, so the
  // current calculation setting carries over instead of silently changing.
  const previousDefault = setSnap.docs.find((d) => d.data().isDefault === true && d.id !== setId);
  const previousAstroId = previousDefault?.data().members?.astrology;
  const previousHouse = designSnap.docs.find((d) => d.id === previousAstroId)?.data().houseSystem;
  const newAstro = set.designs.astrology;
  if (newAstro && typeof previousHouse === "string" && previousHouse !== newAstro.houseSystem) {
    batch.update(designsCol().doc(newAstro.id), { houseSystem: previousHouse });
  }
  for (const doc of designSnap.docs) {
    const shouldBeDefault = doc.data().ownerSetId === setId;
    if (doc.data().isDefault !== shouldBeDefault) batch.update(doc.ref, { isDefault: shouldBeDefault });
  }
  const hdColor = set.designs.humanDesign?.chartDefinedColor;
  if (hdColor) {
    batch.set(
      getAdminDb().doc(`subAccounts/${subAccountId}`),
      { energeticDecoderTheme: { chartDefinedColor: hdColor } },
      { merge: true },
    );
  }
  await batch.commit();
  const updated = await getChartDesignSet(subAccountId, setId);
  if (!updated) throw new ChartDesignSetError(404, "Chart design not found");
  return updated;
}

/** How many Profiles currently use a unified design — directly, or through a legacy override pointing at one of its records. */
export async function countProfilesUsingChartDesignSet(
  subAccountId: string,
  set: Pick<ChartDesignSet, "id" | "members">,
): Promise<number> {
  const snap = await getAdminDb().collection("energeticProfiles").where("subAccountId", "==", subAccountId).get();
  const memberIds = new Set([set.members.humanDesign, set.members.mandala, set.members.astrology].filter(Boolean));
  return snap.docs.filter((d) => {
    const p = d.data();
    return (
      p.chartDesignSetId === set.id ||
      memberIds.has(p.hdChartDesignId) ||
      memberIds.has(p.mandalaChartDesignId) ||
      memberIds.has(p.astrologyChartDesignId)
    );
  }).length;
}

/**
 * Safe delete: never the default, never while any Profile uses it. Removes
 * the set and its own member records together. Generated reports keep
 * their frozen copies of the styling, so they're unaffected.
 */
export async function deleteChartDesignSet(subAccountId: string, setId: string): Promise<void> {
  const set = await getChartDesignSet(subAccountId, setId);
  if (!set) throw new ChartDesignSetError(404, "Chart design not found");
  if (set.isDefault) {
    throw new ChartDesignSetError(409, "The default chart design can't be deleted — make another design the default first.");
  }
  const inUse = await countProfilesUsingChartDesignSet(subAccountId, set);
  if (inUse > 0) {
    throw new ChartDesignSetError(
      409,
      `This chart design is used by ${inUse} profile${inUse === 1 ? "" : "s"}. Choose a different design for ${inUse === 1 ? "it" : "them"} first.`,
    );
  }
  const batch = getAdminDb().batch();
  for (const system of CHART_DESIGN_SET_SYSTEMS) {
    const member = set.designs[system];
    if (member) batch.delete(designsCol().doc(member.id));
  }
  batch.delete(setsCol().doc(set.id));
  await batch.commit();
}

/** Re-reads a just-written record as a plain ChartDesign. */
export async function readChartDesignRecord(id: string): Promise<ChartDesign | null> {
  const snap = await designsCol().doc(id).get();
  return snap.exists ? toDesign(snap.id, snap.data()!) : null;
}
