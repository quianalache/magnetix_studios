import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { designsCol, loadChartDesignData, setsCol, toDesign, toSet } from "@/lib/server/chart-design-records";
import {
  effectiveAstrologyHouseSystem,
  type AstrologyHouseSystem,
  type HouseSystemSource,
} from "@/lib/energetics/reading-calculation-settings";

/** See src/lib/energetics/reading-calculation-settings.ts — calculation settings live in the reading configuration, not in Chart Designs. */
export async function getAstrologyHouseSystem(
  subAccountId: string,
  config?: { astrologyHouseSystem?: unknown } | null,
): Promise<{ houseSystem: AstrologyHouseSystem; source: HouseSystemSource }> {
  const cfg =
    config === undefined
      ? ((await getAdminDb().doc(`subAccounts/${subAccountId}`).get()).data()?.energeticDecoderReportConfig ?? null)
      : config;
  const data = await loadChartDesignData(subAccountId);
  return effectiveAstrologyHouseSystem({ subAccountId, config: cfg, ...data });
}

/**
 * Saves the CURRENT effective house system as the explicit calculation
 * setting if it isn't saved yet — in one transaction, so it records exactly
 * what new readings use right now. Called before anything that could
 * otherwise move the legacy value (changing the default design). No-op
 * once the setting exists; never touches a design record.
 */
export async function pinAstrologyHouseSystem(subAccountId: string): Promise<AstrologyHouseSystem> {
  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  return db.runTransaction(async (tx) => {
    const [sub, designSnap, setSnap] = await Promise.all([
      tx.get(subRef),
      tx.get(designsCol().where("subAccountId", "==", subAccountId)),
      tx.get(setsCol().where("subAccountId", "==", subAccountId)),
    ]);
    const config = sub.data()?.energeticDecoderReportConfig ?? null;
    const { houseSystem, source } = effectiveAstrologyHouseSystem({
      subAccountId,
      config,
      designs: designSnap.docs.map((d) => toDesign(d.id, d.data())),
      sets: setSnap.docs.map((d) => toSet(d.id, d.data())),
    });
    if (source !== "setting") {
      tx.set(subRef, { energeticDecoderReportConfig: { astrologyHouseSystem: houseSystem } }, { merge: true });
    }
    return houseSystem;
  });
}
