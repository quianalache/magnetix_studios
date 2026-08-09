import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import { defaultChartDesignColor } from "@/types/chart-design";

/**
 * Chart Designs — flat top-level collection, same convention as
 * `reportDesigns`/`energeticDecoderReadings` (subAccountId/agencyId fields
 * rather than nested). See src/types/chart-design.ts for the full context.
 */

function col() {
  return getAdminDb().collection("chartDesigns");
}

function toDesign(id: string, data: FirebaseFirestore.DocumentData): ChartDesign {
  return { id, ...(data as Omit<ChartDesign, "id">) };
}

/**
 * Lists every saved design, seeding the two defaults (one Human Design, one
 * Astrology) on first call if a sub-account has none yet — so this always
 * returns at least one design per system instead of an empty list on a
 * brand-new or pre-existing sub-account. The Human Design seed reads the
 * sub-account's pre-existing `energeticDecoderTheme.chartDefinedColor` (not
 * the hardcoded default) so a practitioner who already customized their
 * color via the old single picker doesn't see it silently reset here.
 */
export async function listChartDesigns(subAccountId: string, agencyId: string): Promise<ChartDesign[]> {
  const snap = await col().where("subAccountId", "==", subAccountId).get();
  const existing = snap.docs.map((d) => toDesign(d.id, d.data()));

  const seeds: Promise<ChartDesign>[] = [];
  if (!existing.some((d) => d.system === "humanDesign")) {
    seeds.push(seedDefault(subAccountId, agencyId, "humanDesign"));
  }
  if (!existing.some((d) => d.system === "astrology")) {
    seeds.push(seedDefault(subAccountId, agencyId, "astrology"));
  }
  if (seeds.length === 0) return existing;

  const created = await Promise.all(seeds);
  return [...existing, ...created];
}

async function seedDefault(
  subAccountId: string,
  agencyId: string,
  system: ChartDesignSystem,
): Promise<ChartDesign> {
  let chartDefinedColor = defaultChartDesignColor();
  if (system === "humanDesign") {
    const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
    const existingColor = subSnap.data()?.energeticDecoderTheme?.chartDefinedColor;
    if (typeof existingColor === "string" && existingColor) chartDefinedColor = existingColor;
  }
  const doc = {
    subAccountId,
    agencyId,
    system,
    name: "Default",
    isDefault: true,
    chartDefinedColor,
    houseSystem: "placidus" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  return toDesign(ref.id, doc);
}

export async function getChartDesign(subAccountId: string, designId: string): Promise<ChartDesign | null> {
  const snap = await col().doc(designId).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return toDesign(snap.id, snap.data()!);
}

/** The design actually applied to the public tool/reports for a system — the one used by every existing consumer that isn't design-aware yet. */
export async function getDefaultChartDesign(
  subAccountId: string,
  system: ChartDesignSystem,
): Promise<ChartDesign | null> {
  const snap = await col()
    .where("subAccountId", "==", subAccountId)
    .where("system", "==", system)
    .where("isDefault", "==", true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return toDesign(snap.docs[0].id, snap.docs[0].data());
}

export async function createChartDesign(opts: {
  agencyId: string;
  subAccountId: string;
  system: ChartDesignSystem;
  name: string;
}): Promise<ChartDesign> {
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    system: opts.system,
    name: opts.name.trim() || "Untitled design",
    isDefault: false,
    chartDefinedColor: defaultChartDesignColor(),
    houseSystem: "placidus" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  return toDesign(ref.id, doc);
}

export async function updateChartDesign(
  subAccountId: string,
  designId: string,
  fields: Partial<Pick<ChartDesign, "name" | "chartDefinedColor" | "houseSystem">>,
): Promise<ChartDesign> {
  const ref = col().doc(designId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Chart design not found");
  await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });

  // Write-through: if this is the currently-default Human Design design and
  // its color changed, keep the legacy `energeticDecoderTheme.chartDefinedColor`
  // field in sync — that field is what the public decoder page, saved report
  // page, and internal Readings tab all still read directly.
  const data = snap.data()!;
  if (data.isDefault && data.system === "humanDesign" && fields.chartDefinedColor) {
    await getAdminDb()
      .doc(`subAccounts/${subAccountId}`)
      .set({ energeticDecoderTheme: { chartDefinedColor: fields.chartDefinedColor } }, { merge: true });
  }

  const updated = await ref.get();
  return toDesign(updated.id, updated.data()!);
}

/** Marks `designId` as the default for its system, unsetting every other design of that system, and (Human Design only) write-through syncs the legacy theme field so existing consumers stay correct. */
export async function setDefaultChartDesign(subAccountId: string, designId: string): Promise<ChartDesign> {
  const ref = col().doc(designId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Chart design not found");
  const data = snap.data()!;

  const siblings = await col()
    .where("subAccountId", "==", subAccountId)
    .where("system", "==", data.system)
    .get();
  const batch = getAdminDb().batch();
  for (const doc of siblings.docs) {
    batch.update(doc.ref, { isDefault: doc.id === designId, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();

  if (data.system === "humanDesign") {
    await getAdminDb()
      .doc(`subAccounts/${subAccountId}`)
      .set({ energeticDecoderTheme: { chartDefinedColor: data.chartDefinedColor } }, { merge: true });
  }

  const updated = await ref.get();
  return toDesign(updated.id, updated.data()!);
}

export async function deleteChartDesign(subAccountId: string, designId: string): Promise<void> {
  const ref = col().doc(designId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Chart design not found");
  if (snap.data()?.isDefault) throw new Error("Can't delete the default design — set another one as default first.");
  await ref.delete();
}
