import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import { getEnergeticProfile } from "@/lib/server/energetic-profile-service";
import { designsCol, freshDesignFields, loadChartDesignData, toDesign } from "@/lib/server/chart-design-records";
import { pinAstrologyHouseSystem } from "@/lib/server/reading-calculation-settings-service";
import {
  createChartDesignSet,
  ensureDefaultChartDesignSet,
  setDefaultChartDesignSet,
} from "@/lib/server/chart-design-set-service";
import {
  resolveChartDesign,
  resolveReadingChartDesigns,
  type ChartDesignProfileRefs,
  type ResolvedReadingChartDesigns,
} from "@/lib/energetics/chart-design-resolution";

/**
 * Chart Designs — flat top-level collection, same convention as
 * `reportDesigns`/`energeticDecoderReadings` (subAccountId/agencyId fields
 * rather than nested). See src/types/chart-design.ts for the full context.
 */

const col = designsCol;

/**
 * Lists every saved design, seeding one default per system (Human Design,
 * Astrology, Mandala) on first call if a sub-account has none yet — so
 * this always returns at least one design per system instead of an empty
 * list on a brand-new or pre-existing sub-account. The Human Design seed
 * reads the sub-account's pre-existing `energeticDecoderTheme.chartDefinedColor`
 * (not the hardcoded default) so a practitioner who already customized
 * their color via the old single picker doesn't see it silently reset here.
 */
export async function listChartDesigns(subAccountId: string, agencyId: string): Promise<ChartDesign[]> {
  let snap = await col().where("subAccountId", "==", subAccountId).get();
  if (snap.empty) {
    // Unified Chart Designs (2026-10): a brand-new sub-account's defaults
    // are created as one unified design (three owned records), not three
    // loose records. Existing sub-accounts are untouched here — grouping
    // their records is the one-time, separately authorized migration.
    await ensureDefaultChartDesignSet(subAccountId, agencyId);
    snap = await col().where("subAccountId", "==", subAccountId).get();
  }
  const existing = snap.docs.map((d) => toDesign(d.id, d.data()));

  const seeds: Promise<ChartDesign>[] = [];
  if (!existing.some((d) => d.system === "humanDesign")) {
    seeds.push(seedDefault(subAccountId, agencyId, "humanDesign"));
  }
  if (!existing.some((d) => d.system === "astrology")) {
    seeds.push(seedDefault(subAccountId, agencyId, "astrology"));
  }
  if (!existing.some((d) => d.system === "mandala")) {
    seeds.push(seedDefault(subAccountId, agencyId, "mandala"));
  }

  // Backfill — real gap found 2026-08-10, the day after the field-set
  // rebuild shipped: a design created before that rebuild has NO key at
  // all in Firestore for channelsColor/gatesColor/backgroundColor/
  // wheelAccentColor (not seeded, since seeding only ever ran for a
  // missing SYSTEM, never for an existing system's missing FIELDS). That
  // reaches the UI as `undefined`, not a real default — a broken/blank
  // color swatch on exactly the pre-existing designs a real sub-account
  // actually has, while a brand-new design looked fine. Every real
  // sub-account created before today hits this on every existing design.
  const backfills: Promise<ChartDesign>[] = [];
  for (const d of existing) {
    const patch = missingFieldsPatch(d);
    if (Object.keys(patch).length > 0) backfills.push(applyBackfill(d.id, patch));
  }

  if (seeds.length === 0 && backfills.length === 0) return existing;

  const [created, backfilled] = await Promise.all([Promise.all(seeds), Promise.all(backfills)]);
  const backfilledIds = new Set(backfilled.map((d) => d.id));
  const untouched = existing.filter((d) => !backfilledIds.has(d.id));
  return [...untouched, ...backfilled, ...created];
}

/** Only fills keys genuinely absent from the stored doc — never overwrites a real value the sub-account (or the old single-field picker) already saved, chartDefinedColor and pre-existing houseSystem included. */
function missingFieldsPatch(d: ChartDesign): Record<string, string | number> {
  const fresh = freshDesignFields();
  const patch: Record<string, string | number> = {};
  if (d.channelsColor === undefined) patch.channelsColor = fresh.channelsColor;
  if (d.gatesColor === undefined) patch.gatesColor = fresh.gatesColor;
  if (d.backgroundColor === undefined) patch.backgroundColor = fresh.backgroundColor;
  if (d.wheelAccentColor === undefined) patch.wheelAccentColor = fresh.wheelAccentColor;
  if (d.houseSystem === undefined) patch.houseSystem = fresh.houseSystem;
  // 2026-08-10 — same backfill treatment for the new full-chart-layout
  // fields, so a design saved before today doesn't reach the UI with
  // these keys simply missing (the exact bug this whole function exists
  // to prevent, see the real gap noted above).
  if (d.personalityActivationColor === undefined) patch.personalityActivationColor = fresh.personalityActivationColor;
  if (d.designActivationColor === undefined) patch.designActivationColor = fresh.designActivationColor;
  if (d.arrowColor === undefined) patch.arrowColor = fresh.arrowColor;
  if (d.arrowStyle === undefined) patch.arrowStyle = fresh.arrowStyle;
  if (d.planetBoxColor === undefined) patch.planetBoxColor = fresh.planetBoxColor;
  // Planet Boxes mode — same day, same backfill reasoning.
  if (d.planetBoxMode === undefined) patch.planetBoxMode = fresh.planetBoxMode;
  if (d.planetBoxBorderRadius === undefined) patch.planetBoxBorderRadius = fresh.planetBoxBorderRadius;
  // Traditional Centers Colors — same day, same backfill reasoning. Every
  // pre-existing design gets "uniform" (its real current behavior,
  // unchanged) plus real traditional-color defaults ready to go the
  // moment someone switches the mode.
  if (d.centersMode === undefined) patch.centersMode = fresh.centersMode;
  if (d.headCenterColor === undefined) patch.headCenterColor = fresh.headCenterColor;
  if (d.ajnaCenterColor === undefined) patch.ajnaCenterColor = fresh.ajnaCenterColor;
  if (d.throatCenterColor === undefined) patch.throatCenterColor = fresh.throatCenterColor;
  if (d.gCenterColor === undefined) patch.gCenterColor = fresh.gCenterColor;
  if (d.heartCenterColor === undefined) patch.heartCenterColor = fresh.heartCenterColor;
  if (d.spleenCenterColor === undefined) patch.spleenCenterColor = fresh.spleenCenterColor;
  if (d.sacralCenterColor === undefined) patch.sacralCenterColor = fresh.sacralCenterColor;
  if (d.solarPlexusCenterColor === undefined) patch.solarPlexusCenterColor = fresh.solarPlexusCenterColor;
  if (d.rootCenterColor === undefined) patch.rootCenterColor = fresh.rootCenterColor;
  // Mandala fields — same backfill reasoning, 2026-08-15.
  if (d.mandalaZodiacColor === undefined) patch.mandalaZodiacColor = fresh.mandalaZodiacColor;
  if (d.mandalaGateRingColor === undefined) patch.mandalaGateRingColor = fresh.mandalaGateRingColor;
  if (d.mandalaQuadrantColor === undefined) patch.mandalaQuadrantColor = fresh.mandalaQuadrantColor;
  return patch;
}

async function applyBackfill(id: string, patch: Record<string, string | number>): Promise<ChartDesign> {
  await col().doc(id).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  const snap = await col().doc(id).get();
  return toDesign(snap.id, snap.data()!);
}

async function seedDefault(
  subAccountId: string,
  agencyId: string,
  system: ChartDesignSystem,
): Promise<ChartDesign> {
  const fresh = freshDesignFields();
  if (system === "humanDesign") {
    const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
    const existingColor = subSnap.data()?.energeticDecoderTheme?.chartDefinedColor;
    if (typeof existingColor === "string" && existingColor) fresh.chartDefinedColor = existingColor;
  }
  const doc = {
    subAccountId,
    agencyId,
    system,
    name: "Default",
    isDefault: true,
    ...fresh,
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

/**
 * The design applied to the public tool / template previews for a system
 * when no Profile is involved — the default unified design's record, or
 * (unmigrated sub-account) the legacy per-system default.
 */
export async function getDefaultChartDesign(
  subAccountId: string,
  system: ChartDesignSystem,
): Promise<ChartDesign | null> {
  const { designs, sets } = await loadChartDesignData(subAccountId);
  return resolveChartDesign({ subAccountId, designs, sets, profile: null }, system).design;
}

/**
 * The design that renders for THIS Profile's chart, for a given system.
 * Thin wrapper over the one shared rule in
 * src/lib/energetics/chart-design-resolution.ts (Profile's unified design →
 * legacy override during the migration → default unified design → legacy
 * default → none), always tenant-scoped: a set or record from another
 * sub-account never resolves.
 */
export async function resolveChartDesignForProfile(
  subAccountId: string,
  profile: Partial<ChartDesignProfileRefs> | null,
  system: ChartDesignSystem,
): Promise<ChartDesign | null> {
  const { designs, sets } = await loadChartDesignData(subAccountId);
  return resolveChartDesign({ subAccountId, designs, sets, profile }, system).design;
}

/**
 * Every system's design for a Reading (resolved through its Profile) — the
 * single resolution point every client-facing/PDF surface uses. Also
 * reports which unified design they came from, for generated-report
 * style snapshots.
 */
export async function resolveChartDesignsForReading(
  subAccountId: string,
  reading: Pick<EnergeticDecoderReading, "profileId" | "humanDesign" | "astrology">,
): Promise<ResolvedReadingChartDesigns> {
  const [profile, data] = await Promise.all([
    reading.profileId ? getEnergeticProfile(subAccountId, reading.profileId) : Promise.resolve(null),
    loadChartDesignData(subAccountId),
  ]);
  return resolveReadingChartDesigns({ subAccountId, ...data, profile }, reading);
}

export async function createChartDesign(opts: {
  agencyId: string;
  subAccountId: string;
  system: ChartDesignSystem;
  name: string;
}): Promise<ChartDesign> {
  // Migrated sub-account: a record must belong to a unified design, so the
  // legacy single-record create makes a whole new unified design (copied
  // from the default) and returns its record for the requested system.
  const { sets } = await loadChartDesignData(opts.subAccountId);
  if (sets.length > 0) {
    const set = await createChartDesignSet({ subAccountId: opts.subAccountId, agencyId: opts.agencyId, name: opts.name });
    const member = set.designs[opts.system];
    if (!member) throw new Error("Couldn't create chart design");
    return member;
  }
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    system: opts.system,
    name: opts.name.trim() || "Untitled design",
    isDefault: false,
    ...freshDesignFields(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  return toDesign(ref.id, doc);
}

export async function updateChartDesign(
  subAccountId: string,
  designId: string,
  fields: Partial<
    Pick<
      ChartDesign,
      | "name"
      | "chartDefinedColor"
      | "channelsColor"
      | "gatesColor"
      | "personalityActivationColor"
      | "designActivationColor"
      | "arrowColor"
      | "arrowStyle"
      | "planetBoxColor"
      | "planetBoxMode"
      | "planetBoxBorderRadius"
      | "centersMode"
      | "headCenterColor"
      | "ajnaCenterColor"
      | "throatCenterColor"
      | "gCenterColor"
      | "heartCenterColor"
      | "spleenCenterColor"
      | "sacralCenterColor"
      | "solarPlexusCenterColor"
      | "rootCenterColor"
      | "backgroundColor"
      | "houseSystem"
      | "wheelAccentColor"
    >
  >,
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

  // A record that belongs to a unified design can only become the default
  // together with its design — never on its own, which would split the
  // default across designs.
  if (typeof data.ownerSetId === "string" && data.ownerSetId) {
    await setDefaultChartDesignSet(subAccountId, data.ownerSetId);
    const updated = await ref.get();
    return toDesign(updated.id, updated.data()!);
  }
  // A new default Astrology record must not change how readings are
  // calculated: save the current house system as the reading setting first.
  if (data.system === "astrology") await pinAstrologyHouseSystem(subAccountId);

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
  if (snap.data()?.ownerSetId) {
    throw new Error("This design is part of a unified Chart Design — delete the unified design instead.");
  }
  await ref.delete();
}
