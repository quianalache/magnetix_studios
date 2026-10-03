/**
 * Unified Chart Designs — one-time copy of each workspace's CURRENT
 * Astrology house system into the reading calculation setting
 * (`energeticDecoderReportConfig.astrologyHouseSystem`), so it no longer
 * depends on any Chart Design (2026-10).
 *
 * Same safety model as the design migration runner: dry run unless live;
 * live requires `expect` to equal the plan; each write is a transaction
 * that re-derives the value and refuses if it changed since the dry run;
 * only adds that one field (never touches a design record or a reading);
 * returns a rollback manifest.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { effectiveAstrologyHouseSystem, type AstrologyHouseSystem } from "../../src/lib/energetics/reading-calculation-settings";
import { toPlainDesign, toPlainSet } from "./chart-design-set-migration-runner";

export interface HouseSettingPlanItem {
  subAccountId: string;
  houseSystem: AstrologyHouseSystem;
  /** Where the value comes from today: the default Astrology design, or Placidus (nothing saved). */
  from: "defaultDesign" | "fallback";
}

async function derive(db: Firestore, subAccountId: string) {
  const [sub, d, s] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}`).get(),
    db.collection("chartDesigns").where("subAccountId", "==", subAccountId).get(),
    db.collection("chartDesignSets").where("subAccountId", "==", subAccountId).get(),
  ]);
  return effectiveAstrologyHouseSystem({
    subAccountId,
    config: sub.get("energeticDecoderReportConfig") ?? null,
    designs: d.docs.map((x) => toPlainDesign(x.id, x.data())),
    sets: s.docs.map((x) => toPlainSet(x.id, x.data())),
  });
}

/** Every workspace whose house system still comes from a design (or the default) rather than a saved setting. */
export async function planHouseSystemSetting(db: Firestore, subAccountIds?: string[]): Promise<HouseSettingPlanItem[]> {
  const ids =
    subAccountIds ??
    [...new Set((await db.collection("chartDesigns").select("subAccountId").get()).docs.map((x) => x.get("subAccountId") as string))].sort();
  const plan: HouseSettingPlanItem[] = [];
  for (const subAccountId of ids) {
    const { houseSystem, source } = await derive(db, subAccountId);
    if (source !== "setting") plan.push({ subAccountId, houseSystem, from: source });
  }
  return plan;
}

export async function runHouseSystemSetting(opts: {
  db: Firestore;
  live?: boolean;
  expect?: number;
  subAccountIds?: string[];
}): Promise<{ live: boolean; plan: HouseSettingPlanItem[]; written: HouseSettingPlanItem[]; refused: string | null }> {
  const { db } = opts;
  const live = opts.live === true;
  const plan = await planHouseSystemSetting(db, opts.subAccountIds);
  const out = { live, plan, written: [] as HouseSettingPlanItem[], refused: null as string | null };
  if (!live) return out;
  if (opts.expect !== plan.length) {
    out.refused = `Expected ${opts.expect ?? "(none)"} workspaces but the plan has ${plan.length} — nothing written.`;
    return out;
  }
  for (const item of plan) {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`subAccounts/${item.subAccountId}`);
      const [sub, d, s] = await Promise.all([
        tx.get(ref),
        tx.get(db.collection("chartDesigns").where("subAccountId", "==", item.subAccountId)),
        tx.get(db.collection("chartDesignSets").where("subAccountId", "==", item.subAccountId)),
      ]);
      const now = effectiveAstrologyHouseSystem({
        subAccountId: item.subAccountId,
        config: sub.get("energeticDecoderReportConfig") ?? null,
        designs: d.docs.map((x) => toPlainDesign(x.id, x.data())),
        sets: s.docs.map((x) => toPlainSet(x.id, x.data())),
      });
      if (now.source === "setting") return; // saved meanwhile — leave it
      if (now.houseSystem !== item.houseSystem) {
        throw new Error(`${item.subAccountId}: house system changed since the dry run (${item.houseSystem} → ${now.houseSystem}).`);
      }
      tx.set(ref, { energeticDecoderReportConfig: { astrologyHouseSystem: item.houseSystem } }, { merge: true });
    });
    out.written.push(item);
  }
  return out;
}

/** Removes exactly the settings a live run wrote (only where still equal to what it wrote). Dry run unless live. */
export async function rollbackHouseSystemSetting(opts: { db: Firestore; manifest: HouseSettingPlanItem[]; live?: boolean }) {
  const actions: string[] = [];
  const skipped: string[] = [];
  for (const item of opts.manifest) {
    const ref = opts.db.doc(`subAccounts/${item.subAccountId}`);
    const snap = await ref.get();
    if (snap.get("energeticDecoderReportConfig.astrologyHouseSystem") === item.houseSystem) {
      actions.push(`remove house-system setting on ${item.subAccountId}`);
      if (opts.live) await ref.update({ "energeticDecoderReportConfig.astrologyHouseSystem": FieldValue.delete() });
    } else skipped.push(`${item.subAccountId}: setting no longer equals ${item.houseSystem}`);
  }
  return { live: opts.live === true, actions, skipped };
}
