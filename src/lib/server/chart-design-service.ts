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

/**
 * Firestore Timestamps aren't plain-serializable — passed as-is, they
 * throw the moment a ChartDesign crosses a Server → Client Component
 * boundary (the public decoder form, the report design viewer both do).
 * Real Timestamp → ISO string; a still-in-flight FieldValue sentinel (the
 * immediate return of a create, before any re-read) → null, same "don't
 * fabricate a client-side date" convention already used for reading
 * createdAt in energetic-decoder-service.ts. Fixed 2026-08-11.
 */
function toIsoString(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return null;
}

function toDesign(id: string, data: FirebaseFirestore.DocumentData): ChartDesign {
  return {
    id,
    ...(data as Omit<ChartDesign, "id">),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

/** Real, working defaults for the fields with no legacy value to inherit — everything a fresh design needs to render correctly with zero configuration. */
function freshDesignFields() {
  return {
    chartDefinedColor: defaultChartDesignColor(),
    channelsColor: "#52525b", // zinc-600 — matches the traditional defined-channel line color already used
    gatesColor: "#18181b", // zinc-900 — matches the traditional Personality gate-text color
    // 2026-08-10 — full-chart-layout fields, see chart-design.ts's header
    // comment. Defaults match human-design-chart.tsx's current hardcoded
    // PERSONALITY_FILL/DESIGN_FILL exactly, so the moment the full-chart
    // component reads these, a design nobody has touched yet renders
    // identically to what the BodyGraph already shows today — no visual
    // jump on first load.
    personalityActivationColor: "#18181b", // zinc-900 — same as gatesColor/PERSONALITY_FILL
    designActivationColor: "#9a3412", // rust/brown — same as human-design-chart.tsx's DESIGN_FILL
    arrowColor: "#3f3f46", // zinc-700 — neutral ink, matches WHEEL_TEXT already used elsewhere (astrology wheel, PDF)
    arrowStyle: "solid" as const,
    planetBoxColor: "#f4f4f5", // zinc-100 — currently unused by the renderer, see chart-design.ts's header comment
    // "fullBox" as the default rather than "iconOnly": the full-chart
    // component has always rendered a filled row (planetBoxColor, before
    // this field existed) — fullBox is the closest continuity with that,
    // even though the fill source changes to the activation color per
    // side. Border radius default (6) matches the Tailwind `rounded-md`
    // class the renderer already hardcoded before this field existed.
    planetBoxMode: "fullBox" as const,
    planetBoxBorderRadius: 6,
    // "uniform" preserves current behavior exactly — every existing
    // design keeps rendering every defined center in chartDefinedColor
    // until someone explicitly switches to traditional. The 9 colors
    // below are still given real defaults (not blank) so switching to
    // traditional works correctly with zero further configuration —
    // real values read directly off Bodygraph's own traditional-mode
    // fields, 2026-08-10.
    centersMode: "uniform" as const,
    headCenterColor: "#e49e4b",
    ajnaCenterColor: "#a19a5c",
    throatCenterColor: "#bf5a0f",
    gCenterColor: "#e49e4b",
    heartCenterColor: "#a23423",
    spleenCenterColor: "#bf5a0f",
    sacralCenterColor: "#a23423",
    solarPlexusCenterColor: "#bf5a0f",
    rootCenterColor: "#bf5a0f",
    backgroundColor: "#ffffff",
    houseSystem: "placidus" as const,
    wheelAccentColor: "#5E2574", // the real theme-magnetix primary purple, not an invented color
  };
}

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
  const snap = await col().where("subAccountId", "==", subAccountId).get();
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
