import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createContactServerSide,
  findExistingContactId,
} from "@/lib/server/contacts-service";
import { calculateGeneKeysProfile } from "@/lib/energetics/gene-keys";
import { calculateHumanDesignProfile } from "@/lib/energetics/human-design";
import { calculateAstrologyChart } from "@/lib/energetics/astrology";
import { geocodeBirthPlace } from "@/lib/energetics/geocode";
import { resolveGateContent } from "@/lib/server/energetic-decoder-gate-content-service";
import {
  resolveReadingContent,
  resolveVariableContent,
  type VariableCategory,
} from "@/lib/server/energetic-decoder-chart-content-service";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { computeHumanDesignVariables, type HumanDesignVariables } from "@/lib/energetics/human-design-variables";
import { computeLocalSkills } from "@/lib/server/human-design-skills-service";
import { chironPlacement } from "@/lib/energetics/swiss-ephemeris";
import { parseBirthToUtc } from "@/lib/energetics/gate-wheel";
import {
  ACTIVATION_SEQUENCE_SPHERES,
  PEARL_SEQUENCE_SPHERES,
  VENUS_SEQUENCE_SPHERES,
  GENE_KEYS_CANONICAL_SPHERE_ORDER,
  defaultEnergeticDecoderReportConfig,
  type EnergeticDecoderReading,
  type EnergeticDecoderRequest,
} from "@/types/energetic-decoder";
import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";

export interface CreateReadingInput extends EnergeticDecoderRequest {
  subAccountId: string;
  agencyId: string;
  /** Whoever triggered the calculation — a sub-account admin from the
   *  internal tool today; the public embeddable tool (not built yet)
   *  will pass a fixed placeholder, matching the Forms submit pattern. */
  createdByUid: string;
}

export interface CreateReadingResult {
  reading: EnergeticDecoderReading;
  contactId: string;
}

/**
 * The real save path — geocodes, calculates, matches-or-creates a Contact
 * (email is the identity key, same dedup rule Forms/imports already use),
 * and writes the reading linked to that contact. This is what makes a
 * reading a "saved client chart" instead of a one-off calculation.
 */
export async function createEnergeticDecoderReading(
  input: CreateReadingInput,
): Promise<CreateReadingResult | { error: string }> {
  const { name, email, birthDate, birthTime, birthPlace, lat, lng, timeZone } = input;
  if (!name.trim() || !email.trim() || !birthDate.trim() || !birthTime.trim() || !birthPlace.trim()) {
    return { error: "Name, email, birth date, birth time, and birth place are all required." };
  }

  const place =
    typeof lat === "number" && typeof lng === "number" && timeZone
      ? { lat, lng, displayName: birthPlace, timeZone }
      : await geocodeBirthPlace(birthPlace);
  if (!place) {
    return { error: `Couldn't find "${birthPlace}" — try a more specific place (city, state/country).` };
  }

  const profile = calculateGeneKeysProfile({
    date: birthDate,
    time: birthTime,
    timeZone: place.timeZone,
  });

  // Merge in the sub-account's own interpretive text per gate (their
  // rewrite, or the shipped default when they haven't customized that
  // gate yet) — the calculator itself has no Firestore access, so this
  // enrichment happens here, not inside calculateGeneKeysProfile.
  const spheresWithContent = await Promise.all(
    profile.spheres.map(async (sphere) => {
      const content = await resolveGateContent(input.subAccountId, sphere.gate);
      return { ...sphere, ...content };
    }),
  );

  const db = getAdminDb();

  // Filter to only the sequences this sub-account has chosen to include
  // (Reports tab checkboxes) — merged over the defaults (not just a
  // whole-object fallback) so a sub-account whose config was saved BEFORE
  // includeHumanDesign existed still gets it on, matching every other
  // toggle's "on by default" behavior, instead of a missing field reading
  // as silently off.
  const subSnap = await db.doc(`subAccounts/${input.subAccountId}`).get();
  const reportConfig = {
    ...defaultEnergeticDecoderReportConfig(),
    ...(subSnap.data()?.energeticDecoderReportConfig ?? {}),
  };
  const includedSpheres = new Set<string>([
    ...(reportConfig.includeActivation ? ACTIVATION_SEQUENCE_SPHERES : []),
    ...(reportConfig.includeVenus ? VENUS_SEQUENCE_SPHERES : []),
    ...(reportConfig.includePearl ? PEARL_SEQUENCE_SPHERES : []),
  ]);
  const filteredSpheres: GeneKeysSphereResult[] = spheresWithContent.filter((s) =>
    includedSpheres.has(s.sphere),
  );

  const rawHumanDesign = reportConfig.includeHumanDesign
    ? calculateHumanDesignProfile({ date: birthDate, time: birthTime, timeZone: place.timeZone })
    : null;

  // The 6 Variables (Digestion/Sense/Design Sense/Motivation/Perspective/
  // Environment) — free and local, values since 2026-08-10, descriptions
  // since 2026-08-11 (all 42 real value/description pairs backfilled from
  // Bodygraph's own API into the local content cache before that live
  // call was ever removed — see energetic-decoder-chart-content-service.ts
  // and human-design-content-data.ts). No paid API involved in generating
  // a reading anymore for any of this.
  //
  // Skills & Attributes is local too as of 2026-08-11 — Magnetix's own
  // interpretation (human-design-skills-service.ts), replacing Bodygraph's
  // paid, proprietary BusinessCompetencesAndQualities field entirely, not
  // reproducing its algorithm or wording. Decision-Making Strategy text
  // was dropped a day earlier, once found unused — that guidance already
  // comes from real local content, TYPE_CONTENT[type].strategy +
  // AUTHORITY_CONTENT[authority].description (human-design-content-data.ts).
  //
  // fetchBodygraphVariables() and the rest of bodygraph-api.ts are gone
  // (2026-08-11) — nothing in this pipeline calls Bodygraph anymore.
  if (rawHumanDesign) {
    const localVariables = await computeHumanDesignVariables({ date: birthDate, time: birthTime, timeZone: place.timeZone });

    const fieldEntries: { category: VariableCategory; local: string }[] = [
      { category: "digestion", local: localVariables.digestion },
      { category: "sense", local: localVariables.sense },
      { category: "designSense", local: localVariables.designSense },
      { category: "motivation", local: localVariables.motivation },
      { category: "perspective", local: localVariables.perspective },
      { category: "environment", local: localVariables.environment },
    ];
    const resolvedFields = await Promise.all(
      fieldEntries.map(async ({ category, local }) => {
        const override = await resolveVariableContent(input.subAccountId, category, local);
        return [category, { value: local, description: override.description }] as const;
      }),
    );
    rawHumanDesign.variables = Object.fromEntries(resolvedFields) as unknown as HumanDesignVariables;

    rawHumanDesign.skills = await computeLocalSkills(input.subAccountId, rawHumanDesign);

    // The 4 Variable arrow directions (+ their underlying Color/Tone) —
    // verified 2026-08-10 against the same 5 real reference charts used
    // for the word fields above (see human-design-variables.ts). Purely
    // additive: doesn't touch any existing field, just exposes data the
    // local calculation was already producing.
    rawHumanDesign.variableArrows = localVariables.arrows;
  }

  // Which house system this sub-account's default Astrology chart design
  // uses (Chart Designs tab, 2026-08-09) — falls back to Placidus (the
  // calculator's own default) when no design is saved yet, so this never
  // blocks a reading from calculating.
  const defaultAstroDesign = reportConfig.includeAstrology
    ? await getDefaultChartDesign(input.subAccountId, "astrology")
    : null;

  // Chiron (2026-08-09, local since 2026-08-11) — was Bodygraph's API,
  // now the free local Swiss Ephemeris calc (swiss-ephemeris.ts's
  // chironPlacement, verified against Bodygraph's live values first, back
  // when there still was a Bodygraph integration to verify against — see
  // that function's doc). Same best-effort contract as before: any
  // failure here (WASM init, etc.) just means the chart has no Chiron
  // placement, not a broken reading, same "real field or absent" rule as
  // the Variables above.
  const chiron = reportConfig.includeAstrology
    ? await chironPlacement(parseBirthToUtc({ date: birthDate, time: birthTime, timeZone: place.timeZone })).catch(() => null)
    : null;

  const rawAstrology = reportConfig.includeAstrology
    ? calculateAstrologyChart({
        date: birthDate,
        time: birthTime,
        timeZone: place.timeZone,
        lat: place.lat,
        lng: place.lng,
        houseSystem: defaultAstroDesign?.houseSystem,
        chironLongitude: chiron?.longitude,
        chironRetrograde: chiron?.retrograde,
      })
    : null;

  // Same reasoning as spheresWithContent above — the calculators themselves
  // have no Firestore access, so the sub-account's own wording (or the
  // shipped default) gets merged in here, once, and snapshotted onto the
  // reading. One query covers both systems' content at once.
  const { humanDesign: hdContent, astrology: astroContent } = await resolveReadingContent(
    input.subAccountId,
    { type: rawHumanDesign?.type, authority: rawHumanDesign?.authority },
  );
  const humanDesign = rawHumanDesign ? { ...rawHumanDesign, content: hdContent } : null;
  const astrology = rawAstrology ? { ...rawAstrology, content: astroContent } : null;

  let contactId = await findExistingContactId(db, input.subAccountId, { email });
  if (!contactId) {
    const { id } = await createContactServerSide({
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      createdByUid: input.createdByUid,
      mode: "live",
      name: name.trim(),
      email: email.trim(),
      phone: "",
      company: "",
      address: "",
      source: "Energetic Decoder",
      tags: ["energetic-decoder"],
    });
    contactId = id;
  }

  const readingRef = db.collection("energeticDecoderReadings").doc();
  const doc = {
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    contactId,
    system: "geneKeys" as const,
    name: name.trim(),
    birthDate,
    birthTime,
    birthPlace: place.displayName,
    timeZone: place.timeZone,
    spheres: filteredSpheres,
    humanDesign,
    astrology,
    createdAt: FieldValue.serverTimestamp(),
  };
  await readingRef.set(doc);

  // createdAt is a serverTimestamp sentinel, not a real value, until the
  // doc is re-read — honest to return null here rather than fabricate a
  // client-side Date that might drift from what the server actually wrote.
  return {
    reading: { id: readingRef.id, ...doc, createdAt: null },
    contactId,
  };
}

export interface EnergeticDecoderHomeStats {
  totalReadings: number;
  readingsToday: number;
  reportDesignCount: number;
  chartDesignCount: number;
  embedCount: number;
  recent: { id: string; name: string; system: "geneKeys" | "humanDesign" | "astrology" | "mixed"; createdAt: string | null }[];
}

/**
 * Home tab (2026-08-09) — real counts, not placeholders. `readingsToday`
 * compares against the server's own UTC midnight (same simple convention
 * as the rest of the app; no per-sub-account timezone handling yet).
 * View/purchase-of-report money stats aren't included — that requires
 * Stripe purchase records this collection doesn't have yet, so the Home
 * tab only shows what's genuinely countable today rather than a
 * plausible-looking fake number.
 */
export async function getHomeStats(subAccountId: string): Promise<EnergeticDecoderHomeStats> {
  const db = getAdminDb();
  const readingsCol = db.collection("energeticDecoderReadings").where("subAccountId", "==", subAccountId);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [totalSnap, recentSnap, reportDesignsSnap, chartDesignsSnap, embedsSnap] = await Promise.all([
    readingsCol.count().get(),
    readingsCol.orderBy("createdAt", "desc").limit(5).get(),
    db.collection("reportDesigns").where("subAccountId", "==", subAccountId).count().get(),
    db.collection("chartDesigns").where("subAccountId", "==", subAccountId).count().get(),
    db.collection("embedConfigs").where("subAccountId", "==", subAccountId).count().get(),
  ]);

  const recent = recentSnap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate ? (data.createdAt.toDate() as Date) : null;
    const system: EnergeticDecoderHomeStats["recent"][number]["system"] =
      data.humanDesign && data.astrology ? "mixed" : data.humanDesign ? "humanDesign" : data.astrology ? "astrology" : "geneKeys";
    return { id: d.id, name: data.name ?? "Unknown", system, createdAt: createdAt ? createdAt.toISOString() : null };
  });
  // recentSnap only covers the 5 newest, not necessarily every reading from
  // today — a dedicated count query on the same (subAccountId, createdAt)
  // index gets the true figure instead.
  const todaySnap = await readingsCol.where("createdAt", ">=", todayStart).count().get();
  const readingsToday = todaySnap.data().count;

  return {
    totalReadings: totalSnap.data().count,
    readingsToday,
    reportDesignCount: reportDesignsSnap.data().count,
    chartDesignCount: chartDesignsSnap.data().count,
    embedCount: embedsSnap.data().count,
    recent,
  };
}

/**
 * Read-time fallback for readings saved before 2026-08-10's Variable-
 * arrow plumbing — her direct ask: "I want old readings to display the
 * correct 4 Variable arrows without manually recreating each reading."
 * Derives them from the reading's own already-saved birth data using the
 * same free, local, already-verified computeHumanDesignVariables()
 * engine — never Bodygraph, per her explicit instruction. Never writes
 * anything back to Firestore: the recompute is cheap (no network call,
 * no API cost) and this is a read path, so there's no real cost to just
 * deriving it fresh on every read instead of migrating stored docs —
 * "do not overwrite or mutate old readings unless necessary," and
 * recomputing on read means it's never necessary. Returns the reading
 * completely unchanged (zero-cost no-op) when variableArrows is already
 * saved — every reading created after 2026-08-10 — or when the reading
 * has no Human Design system at all, so this can't touch any
 * already-saved value, only fill in what's genuinely absent.
 *
 * Best-effort like every other derived field in this file: a failed
 * recompute (malformed legacy birth data, etc.) just leaves the reading
 * exactly as it renders today — arrows absent, never a broken page.
 */
async function withDerivedVariableArrows(
  reading: EnergeticDecoderReading,
): Promise<EnergeticDecoderReading> {
  if (!reading.humanDesign || reading.humanDesign.variableArrows) return reading;
  try {
    const { arrows } = await computeHumanDesignVariables({
      date: reading.birthDate,
      time: reading.birthTime,
      timeZone: reading.timeZone,
    });
    return { ...reading, humanDesign: { ...reading.humanDesign, variableArrows: arrows } };
  } catch {
    return reading;
  }
}

/**
 * Read-time fallback for readings saved before 2026-08-10's Pearl
 * Sequence reorder (gene-keys.ts's `raw` array, and the
 * PEARL_SEQUENCE_SPHERES constant it's built from, both used to produce
 * Vocation/Brand/Culture/Pearl — an arbitrary order, not a deliberate
 * one — fixed to the real canonical Vocation/Culture/Brand/Pearl,
 * verified against genekeys.com). Same pattern and same reasoning as
 * withDerivedVariableArrows just above: a pure, cheap, local
 * presentation-layer fix, not a recompute — this only reorders the
 * array positions of the sub-account's own already-saved sphere
 * objects (unchanged object references, so every Gate.Line, Shadow,
 * Gift, Siddhi, showsUp, and giftText stays byte-identical), it never
 * touches Firestore, and it's a complete no-op (same object returned)
 * for every reading already in canonical order — every reading created
 * after 2026-08-10.
 *
 * Any sphere name not found in GENE_KEYS_CANONICAL_SPHERE_ORDER (should
 * never happen — the 12 names are fixed) is appended at the end
 * unchanged rather than silently dropped, so a genuinely malformed
 * reading still renders everything it has instead of losing data.
 */
function withCanonicalSphereOrder(
  reading: EnergeticDecoderReading,
): EnergeticDecoderReading {
  if (!reading.spheres || reading.spheres.length === 0) return reading;
  const bySphere = new Map(reading.spheres.map((s) => [s.sphere, s]));
  const known = GENE_KEYS_CANONICAL_SPHERE_ORDER.map((name) => bySphere.get(name)).filter(
    (s): s is GeneKeysSphereResult => s !== undefined,
  );
  const extras = reading.spheres.filter((s) => !(GENE_KEYS_CANONICAL_SPHERE_ORDER as readonly string[]).includes(s.sphere));
  const sorted = [...known, ...extras];
  const alreadyCanonical = reading.spheres.length === sorted.length && reading.spheres.every((s, i) => s.sphere === sorted[i].sphere);
  if (alreadyCanonical) return reading;
  return { ...reading, spheres: sorted };
}

export async function listReadingsForSubAccount(
  subAccountId: string,
  limit = 50,
): Promise<EnergeticDecoderReading[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("energeticDecoderReadings")
    .where("subAccountId", "==", subAccountId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  const readings = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as EnergeticDecoderReading,
  );
  return Promise.all(readings.map((r) => withDerivedVariableArrows(r).then(withCanonicalSphereOrder)));
}

/**
 * Powers the public, shareable report page — the actual deliverable a
 * client opens (mirrors bodygraph.com's emailed "download link to your
 * report": a durable link instead of a one-time in-browser view). No auth;
 * the reading ID itself (an unguessable Firestore doc ID) is the access
 * key, same convention this app already uses for other opaque public
 * links. Scoped to subAccountId so a reading ID can't be used to peek at
 * a different sub-account's client chart even if somehow guessed.
 */
export async function getReadingById(
  subAccountId: string,
  readingId: string,
): Promise<EnergeticDecoderReading | null> {
  const snap = await getAdminDb().doc(`energeticDecoderReadings/${readingId}`).get();
  if (!snap.exists) return null;
  const reading = { id: snap.id, ...snap.data() } as EnergeticDecoderReading;
  if (reading.subAccountId !== subAccountId) return null;
  return withCanonicalSphereOrder(await withDerivedVariableArrows(reading));
}
