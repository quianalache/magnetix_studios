/**
 * Ready-made Chart Designs — one-time addition of the four ready-made
 * designs (Magnetix Violet, Monochrome, Warm Sunset, Midnight) to existing,
 * already-migrated workspaces (2026-10). New workspaces get them at
 * creation (chart-design-set-service.ts).
 *
 * Same safety model as the earlier migration runners:
 *  - dry run unless `live`; live requires `expect` to equal the plan;
 *  - one transaction per workspace that re-reads and re-plans, and
 *    refuses if anything changed since the dry run;
 *  - only ADDS: new unified designs + their own records, and the
 *    workspace's `chartDesignStarters` marker. Never changes an existing
 *    design, the Default, a Profile, a reading or a report;
 *  - verifies integrity + unchanged existing records afterwards;
 *  - returns a rollback manifest.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { ChartDesignSystem } from "../../src/types/chart-design";
import { CHART_DESIGN_SET_SYSTEMS } from "../../src/types/chart-design-set";
import {
  CHART_DESIGN_STARTERS_VERSION,
  planStarterDesigns,
  type ChartDesignStartersMarker,
  type StarterPlan,
} from "../../src/lib/energetics/chart-design-starters";
import { checkChartDesignSetIntegrity } from "../../src/lib/energetics/chart-design-set-migration";
import { chartDesignFingerprint } from "../../src/lib/energetics/chart-design-fields";
import { loadSubAccountChartData, toPlainDesign, toPlainSet } from "./chart-design-set-migration-runner";

export interface StarterTotals {
  sets: number;
  records: number;
}

export interface StarterManifestEntry {
  subAccountId: string;
  sets: string[];
  records: string[];
  /** The marker before this run (restored on rollback). */
  markerBefore: ChartDesignStartersMarker | null;
}

async function workspacesWithDesigns(db: Firestore): Promise<string[]> {
  const snap = await db.collection("chartDesigns").select("subAccountId").get();
  return [...new Set(snap.docs.map((d) => d.get("subAccountId") as string).filter(Boolean))].sort();
}

export async function planStarterSeeding(db: Firestore, subAccountIds?: string[]) {
  const ids = subAccountIds ?? (await workspacesWithDesigns(db));
  const plans: (StarterPlan & { marker: ChartDesignStartersMarker | null })[] = [];
  for (const subAccountId of ids) {
    const [data, sub] = await Promise.all([loadSubAccountChartData(db, subAccountId), db.doc(`subAccounts/${subAccountId}`).get()]);
    const marker = (sub.get("chartDesignStarters") as ChartDesignStartersMarker | undefined) ?? null;
    plans.push({ ...planStarterDesigns({ subAccountId, designs: data.designs, sets: data.sets, marker }), marker });
  }
  const totals: StarterTotals = {
    sets: plans.reduce((n, p) => n + p.creates.length, 0),
    records: plans.reduce((n, p) => n + p.creates.length * CHART_DESIGN_SET_SYSTEMS.length, 0),
  };
  return { plans, totals };
}

export async function runStarterSeeding(opts: {
  db: Firestore;
  live?: boolean;
  expect?: StarterTotals;
  subAccountIds?: string[];
}) {
  const { db } = opts;
  const live = opts.live === true;
  const { plans, totals } = await planStarterSeeding(db, opts.subAccountIds);
  const result = {
    live,
    plans,
    totals,
    written: [] as StarterManifestEntry[],
    verification: [] as { subAccountId: string; problems: string[] }[],
    refused: null as string | null,
  };
  if (!live) return result;
  const blocked = plans.filter((p) => p.status === "blocked");
  if (blocked.length > 0) {
    result.refused = `Blocked: ${blocked.map((p) => `${p.subAccountId} — ${p.blockers.join("; ")}`).join(" | ")}`;
    return result;
  }
  if (!opts.expect || opts.expect.sets !== totals.sets || opts.expect.records !== totals.records) {
    result.refused = `Expected ${JSON.stringify(opts.expect ?? null)} doesn't match the plan ${JSON.stringify(totals)} — nothing written.`;
    return result;
  }

  for (const dry of plans) {
    if (dry.status !== "ready") continue;
    const { subAccountId } = dry;
    const before = await loadSubAccountChartData(db, subAccountId);
    const subRef = db.doc(`subAccounts/${subAccountId}`);
    await db.runTransaction(async (tx) => {
      const [d, s, sub] = await Promise.all([
        tx.get(db.collection("chartDesigns").where("subAccountId", "==", subAccountId)),
        tx.get(db.collection("chartDesignSets").where("subAccountId", "==", subAccountId)),
        tx.get(subRef),
      ]);
      const marker = (sub.get("chartDesignStarters") as ChartDesignStartersMarker | undefined) ?? null;
      const fresh = planStarterDesigns({
        subAccountId,
        designs: d.docs.map((x) => toPlainDesign(x.id, x.data())),
        sets: s.docs.map((x) => toPlainSet(x.id, x.data())),
        marker,
      });
      const { marker: _m, ...dryPlan } = dry;
      void _m;
      if (JSON.stringify(fresh) !== JSON.stringify(dryPlan)) {
        throw new Error(`${subAccountId}: chart designs changed since the dry run — re-run the dry run first.`);
      }
      const agencyId = (sub.get("agencyId") as string) ?? "";
      for (const create of fresh.creates) {
        const members = {} as Record<ChartDesignSystem, string>;
        for (const system of CHART_DESIGN_SET_SYSTEMS) {
          const m = create.members[system];
          members[system] = m.id;
          tx.create(db.collection("chartDesigns").doc(m.id), {
            ...m.values,
            subAccountId,
            agencyId,
            system,
            name: create.name,
            isDefault: false,
            ownerSetId: create.setId,
            starterCopiedFrom: m.copiedFrom,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        tx.create(db.collection("chartDesignSets").doc(create.setId), {
          subAccountId,
          agencyId,
          name: create.name,
          isDefault: false,
          members: { ...members, frequency: null },
          starter: { key: create.key, version: CHART_DESIGN_STARTERS_VERSION },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      const seeded = [...new Set([...(marker?.seeded ?? []), ...fresh.creates.map((c) => c.key), ...fresh.skipped.map((x) => x.key)])];
      tx.set(subRef, { chartDesignStarters: { version: CHART_DESIGN_STARTERS_VERSION, seeded, seededAt: new Date().toISOString() } }, { merge: true });
    });
    result.written.push({
      subAccountId,
      sets: dry.creates.map((c) => c.setId),
      records: dry.creates.flatMap((c) => CHART_DESIGN_SET_SYSTEMS.map((sys) => c.members[sys].id)),
      markerBefore: dry.marker,
    });

    // Verify: integrity, and every pre-existing record/design untouched.
    const after = await loadSubAccountChartData(db, subAccountId);
    const problems = checkChartDesignSetIntegrity({ subAccountId, ...after });
    for (const d of before.designs) {
      const now = after.designs.find((x) => x.id === d.id);
      if (!now || chartDesignFingerprint(now) !== chartDesignFingerprint(d) || now.name !== d.name || now.isDefault !== d.isDefault || now.ownerSetId !== d.ownerSetId) {
        problems.push(`existing record ${d.id} changed`);
      }
    }
    for (const s of before.sets) {
      const now = after.sets.find((x) => x.id === s.id);
      if (!now || now.name !== s.name || now.isDefault !== s.isDefault || JSON.stringify(now.members) !== JSON.stringify(s.members)) problems.push(`existing design ${s.id} changed`);
    }
    if (JSON.stringify(after.profiles) !== JSON.stringify(before.profiles)) problems.push("profiles changed");
    result.verification.push({ subAccountId, problems });
  }
  return result;
}

/** Removes exactly what a live run created and restores the marker. Skips any design that became the default or is used by a Profile. Dry run unless live. */
export async function rollbackStarterSeeding(opts: { db: Firestore; manifest: StarterManifestEntry[]; live?: boolean }) {
  const { db } = opts;
  const actions: string[] = [];
  const skipped: string[] = [];
  for (const entry of opts.manifest) {
    const profiles = await db.collection("energeticProfiles").where("subAccountId", "==", entry.subAccountId).get();
    const batch = db.batch();
    for (const setId of entry.sets) {
      const snap = await db.collection("chartDesignSets").doc(setId).get();
      if (!snap.exists || !snap.get("starter")) { skipped.push(`${setId}: missing or not a ready-made design`); continue; }
      if (snap.get("isDefault")) { skipped.push(`${setId}: is now the default`); continue; }
      if (profiles.docs.some((p) => p.get("chartDesignSetId") === setId)) { skipped.push(`${setId}: used by a profile`); continue; }
      const members = snap.get("members") ?? {};
      for (const sys of CHART_DESIGN_SET_SYSTEMS) {
        if (entry.records.includes(members[sys])) { actions.push(`delete record ${members[sys]}`); batch.delete(db.collection("chartDesigns").doc(members[sys])); }
      }
      actions.push(`delete unified design ${setId}`);
      batch.delete(snap.ref);
    }
    actions.push(`restore chartDesignStarters marker on ${entry.subAccountId} to ${JSON.stringify(entry.markerBefore)}`);
    batch.update(db.doc(`subAccounts/${entry.subAccountId}`), { chartDesignStarters: entry.markerBefore ?? FieldValue.delete() });
    if (opts.live) await batch.commit();
  }
  return { live: opts.live === true, actions, skipped };
}
