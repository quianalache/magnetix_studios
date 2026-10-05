/**
 * Unified Chart Designs — migration RUNNER (2026-10). Executes the pure
 * plan from src/lib/energetics/chart-design-set-migration.ts against a
 * Firestore handle passed in by the caller (the CLI in
 * scripts/migrate-chart-design-sets.ts, or the emulator checks), so this
 * module never picks credentials itself.
 *
 * Safety:
 *  - dry run unless `live: true`; live also requires `expect` totals that
 *    match the plan exactly, or nothing is written;
 *  - each sub-account is written in ONE transaction that re-reads its
 *    records and refuses if the plan changed since the dry run;
 *  - only ADDS: new unified designs, new copy records, `ownerSetId` on
 *    existing records, `chartDesignSetId` on Profiles. No existing value is
 *    changed and nothing is deleted;
 *  - after commit: the integrity checker must pass and every pre-existing
 *    record's styling fingerprint, name and isDefault must be unchanged;
 *  - returns a rollback manifest of exactly what it wrote.
 */
import { FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";
import type { ChartDesign } from "../../src/types/chart-design";
import type { ChartDesignSet } from "../../src/types/chart-design-set";
import {
  checkChartDesignSetIntegrity,
  planChartDesignSetMigration,
  type ChartDesignSetMigrationPlan,
  type MigrationProfile,
} from "../../src/lib/energetics/chart-design-set-migration";
import { chartDesignFingerprint } from "../../src/lib/energetics/chart-design-fields";

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function toPlainDesign(id: string, data: DocumentData): ChartDesign {
  return { id, ...(data as Omit<ChartDesign, "id">), createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) };
}

export function toPlainSet(id: string, data: DocumentData): ChartDesignSet {
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
      frequency: data.members?.frequency ?? null,
    },
    migration: data.migration ?? null,
    starter: data.starter ?? null,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function toProfile(id: string, data: DocumentData): MigrationProfile {
  return {
    id,
    subAccountId: data.subAccountId,
    name: data.name,
    chartDesignSetId: data.chartDesignSetId ?? null,
    hdChartDesignId: data.hdChartDesignId ?? null,
    mandalaChartDesignId: data.mandalaChartDesignId ?? null,
    astrologyChartDesignId: data.astrologyChartDesignId ?? null,
  };
}

export async function loadSubAccountChartData(db: Firestore, subAccountId: string) {
  const [d, s, p] = await Promise.all([
    db.collection("chartDesigns").where("subAccountId", "==", subAccountId).get(),
    db.collection("chartDesignSets").where("subAccountId", "==", subAccountId).get(),
    db.collection("energeticProfiles").where("subAccountId", "==", subAccountId).get(),
  ]);
  return {
    designs: d.docs.map((x) => toPlainDesign(x.id, x.data())),
    sets: s.docs.map((x) => toPlainSet(x.id, x.data())),
    profiles: p.docs.map((x) => toProfile(x.id, x.data())),
  };
}

export interface MigrationTotals {
  sets: number;
  copies: number;
  stamps: number;
  profiles: number;
}

export interface RollbackManifestEntry {
  subAccountId: string;
  sets: string[];
  copies: string[];
  ownerStamps: { designId: string; setId: string }[];
  profileAssignments: { profileId: string; setId: string }[];
}

export interface MigrationRunResult {
  live: boolean;
  plans: ChartDesignSetMigrationPlan[];
  totals: MigrationTotals;
  written: RollbackManifestEntry[];
  verification: { subAccountId: string; problems: string[] }[];
  refused: string | null;
}

function totalsOf(plans: ChartDesignSetMigrationPlan[]): MigrationTotals {
  return plans.reduce(
    (t, p) => ({
      sets: t.sets + p.sets.length,
      copies: t.copies + p.copies.length,
      stamps: t.stamps + p.ownerStamps.length,
      profiles: t.profiles + p.profileAssignments.length,
    }),
    { sets: 0, copies: 0, stamps: 0, profiles: 0 },
  );
}

async function subAccountsWithDesigns(db: Firestore): Promise<string[]> {
  const snap = await db.collection("chartDesigns").select("subAccountId").get();
  return [...new Set(snap.docs.map((d) => d.get("subAccountId") as string).filter(Boolean))].sort();
}

async function agencyIdFor(db: Firestore, subAccountId: string, designs: ChartDesign[]): Promise<string> {
  const fromDesign = designs.find((d) => d.agencyId)?.agencyId;
  if (fromDesign) return fromDesign;
  const sub = await db.doc(`subAccounts/${subAccountId}`).get();
  return (sub.get("agencyId") as string) ?? "";
}

export async function runChartDesignSetMigration(opts: {
  db: Firestore;
  live?: boolean;
  expect?: MigrationTotals;
  subAccountIds?: string[];
}): Promise<MigrationRunResult> {
  const { db } = opts;
  const live = opts.live === true;
  const subAccountIds = opts.subAccountIds ?? (await subAccountsWithDesigns(db));

  const plans: ChartDesignSetMigrationPlan[] = [];
  const before = new Map<string, Map<string, { fingerprint: string; name: string; isDefault: boolean }>>();
  for (const subAccountId of subAccountIds) {
    const data = await loadSubAccountChartData(db, subAccountId);
    const agencyId = await agencyIdFor(db, subAccountId, data.designs);
    plans.push(planChartDesignSetMigration({ subAccountId, agencyId, ...data }));
    before.set(
      subAccountId,
      new Map(data.designs.map((d) => [d.id, { fingerprint: chartDesignFingerprint(d), name: d.name, isDefault: d.isDefault }])),
    );
  }
  const totals = totalsOf(plans);
  const result: MigrationRunResult = { live, plans, totals, written: [], verification: [], refused: null };

  if (!live) return result;

  const blocked = plans.filter((p) => p.status === "blocked");
  if (blocked.length > 0) {
    result.refused = `Blocked: ${blocked.map((p) => `${p.subAccountId} — ${p.blockers.join("; ")}`).join(" | ")}`;
    return result;
  }
  if (
    !opts.expect ||
    opts.expect.sets !== totals.sets ||
    opts.expect.copies !== totals.copies ||
    opts.expect.stamps !== totals.stamps ||
    opts.expect.profiles !== totals.profiles
  ) {
    result.refused = `Expected totals ${JSON.stringify(opts.expect ?? null)} don't match the plan ${JSON.stringify(totals)} — nothing written.`;
    return result;
  }

  const migratedAt = new Date().toISOString();
  for (const dryPlan of plans) {
    if (dryPlan.status !== "ready") continue;
    const { subAccountId } = dryPlan;
    await db.runTransaction(async (tx) => {
      const [d, s, p] = await Promise.all([
        tx.get(db.collection("chartDesigns").where("subAccountId", "==", subAccountId)),
        tx.get(db.collection("chartDesignSets").where("subAccountId", "==", subAccountId)),
        tx.get(db.collection("energeticProfiles").where("subAccountId", "==", subAccountId)),
      ]);
      const fresh = planChartDesignSetMigration({
        subAccountId,
        agencyId: dryPlan.agencyId,
        designs: d.docs.map((x) => toPlainDesign(x.id, x.data())),
        sets: s.docs.map((x) => toPlainSet(x.id, x.data())),
        profiles: p.docs.map((x) => toProfile(x.id, x.data())),
      });
      if (JSON.stringify(fresh) !== JSON.stringify(dryPlan)) {
        throw new Error(`${subAccountId}: records changed since the dry run — re-run the dry run first.`);
      }
      const { agencyId } = dryPlan;
      for (const set of dryPlan.sets) {
        tx.create(db.collection("chartDesignSets").doc(set.id), {
          subAccountId,
          agencyId,
          name: set.name,
          isDefault: set.isDefault,
          members: { ...set.members, frequency: null },
          migration: { ...set.migration, migratedAt },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const copy of dryPlan.copies) {
        tx.create(db.collection("chartDesigns").doc(copy.id), {
          ...copy.values,
          subAccountId,
          agencyId,
          system: copy.system,
          name: copy.name,
          isDefault: false,
          ownerSetId: copy.setId,
          migration: { version: 1, copiedFrom: copy.sourceDesignId, migratedAt },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const stamp of dryPlan.ownerStamps) {
        tx.update(db.collection("chartDesigns").doc(stamp.designId), { ownerSetId: stamp.setId });
      }
      for (const a of dryPlan.profileAssignments) {
        tx.update(db.collection("energeticProfiles").doc(a.profileId), { chartDesignSetId: a.setId });
      }
    });
    result.written.push({
      subAccountId,
      sets: dryPlan.sets.map((x) => x.id),
      copies: dryPlan.copies.map((x) => x.id),
      ownerStamps: dryPlan.ownerStamps,
      profileAssignments: dryPlan.profileAssignments,
    });
  }

  // Verify every sub-account after the writes.
  for (const subAccountId of subAccountIds) {
    const after = await loadSubAccountChartData(db, subAccountId);
    const problems = checkChartDesignSetIntegrity({ subAccountId, ...after });
    for (const [id, was] of before.get(subAccountId) ?? []) {
      const now = after.designs.find((x) => x.id === id);
      if (!now) problems.push(`record ${id} disappeared`);
      else {
        if (chartDesignFingerprint(now) !== was.fingerprint) problems.push(`record ${id}: styling values changed`);
        if (now.name !== was.name) problems.push(`record ${id}: name changed`);
        if (now.isDefault !== was.isDefault) problems.push(`record ${id}: isDefault changed`);
      }
    }
    result.verification.push({ subAccountId, problems });
  }
  return result;
}

/**
 * Undo a live run from its manifest — only for an immediate rollback (e.g.
 * verification failed), before anyone edits designs in the new UI. Removes
 * exactly what the manifest lists, each item only if it still carries this
 * migration's markers; never touches anything else.
 */
export async function rollbackChartDesignSetMigration(opts: {
  db: Firestore;
  manifest: RollbackManifestEntry[];
  live?: boolean;
}): Promise<{ live: boolean; actions: string[]; skipped: string[] }> {
  const { db, manifest } = opts;
  const live = opts.live === true;
  const actions: string[] = [];
  const skipped: string[] = [];
  for (const entry of manifest) {
    const batch = db.batch();
    for (const a of entry.profileAssignments) {
      const ref = db.collection("energeticProfiles").doc(a.profileId);
      const snap = await ref.get();
      if (snap.exists && snap.get("chartDesignSetId") === a.setId) {
        actions.push(`unset chartDesignSetId on profile ${a.profileId}`);
        batch.update(ref, { chartDesignSetId: FieldValue.delete() });
      } else skipped.push(`profile ${a.profileId} no longer points at ${a.setId}`);
    }
    for (const stamp of entry.ownerStamps) {
      const ref = db.collection("chartDesigns").doc(stamp.designId);
      const snap = await ref.get();
      if (snap.exists && snap.get("ownerSetId") === stamp.setId) {
        actions.push(`unset ownerSetId on record ${stamp.designId}`);
        batch.update(ref, { ownerSetId: FieldValue.delete() });
      } else skipped.push(`record ${stamp.designId} no longer owned by ${stamp.setId}`);
    }
    for (const id of entry.copies) {
      const ref = db.collection("chartDesigns").doc(id);
      const snap = await ref.get();
      if (snap.exists && snap.get("migration.version") === 1) {
        actions.push(`delete copy record ${id}`);
        batch.delete(ref);
      } else skipped.push(`copy ${id} missing or not a migration copy`);
    }
    for (const id of entry.sets) {
      const ref = db.collection("chartDesignSets").doc(id);
      const snap = await ref.get();
      if (snap.exists && snap.get("migration.version") === 1) {
        actions.push(`delete unified design ${id}`);
        batch.delete(ref);
      } else skipped.push(`unified design ${id} missing or not created by the migration`);
    }
    if (live) await batch.commit();
  }
  return { live, actions, skipped };
}
