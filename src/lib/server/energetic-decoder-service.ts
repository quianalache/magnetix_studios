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
  cacheVariableDefault,
  resolveVariableContent,
  type VariableCategory,
} from "@/lib/server/energetic-decoder-chart-content-service";
import { getDefaultChartDesign } from "@/lib/server/chart-design-service";
import { fetchBodygraphVariables, fetchBodygraphChiron } from "@/lib/energetics/bodygraph-api";
import {
  ACTIVATION_SEQUENCE_SPHERES,
  PEARL_SEQUENCE_SPHERES,
  VENUS_SEQUENCE_SPHERES,
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

  // Bodygraph's paid API (2026-08-09) — the 6 Variables + Skills/Attributes,
  // the one thing the free local engine genuinely can't compute (see
  // bodygraph-api.ts for why). Best-effort: `variables` stays undefined
  // and the reading still saves normally if the API key is unset, the
  // call fails, or times out — never blocks a reading over this.
  if (rawHumanDesign) {
    const variables = await fetchBodygraphVariables({ date: birthDate, time: birthTime, timeZone: place.timeZone });
    if (variables) {
      // Real rendered chart from Bodygraph's own renderer, not this app's
      // hand-drawn HumanDesignChart — her direct ask (2026-08-09): "I don't
      // need to worry about you drawing something... not generating an
      // aesthetically pleasing bodygraph."
      if (variables.chartSvg) rawHumanDesign.bodygraphSvg = variables.chartSvg;

      // Cache Bodygraph's real default description for each value the first
      // time it's actually seen (platform-wide — the same value always has
      // the same Bodygraph text), then let the sub-account's own Content-tab
      // rewrite override it on THIS reading, same "own the wording, not
      // just resell theirs" promise every other field already keeps.
      const fieldEntries: { category: VariableCategory; field: keyof typeof variables }[] = [
        { category: "digestion", field: "digestion" },
        { category: "sense", field: "sense" },
        { category: "designSense", field: "designSense" },
        { category: "motivation", field: "motivation" },
        { category: "perspective", field: "perspective" },
        { category: "environment", field: "environment" },
      ];
      await Promise.all(
        fieldEntries.map(async ({ category, field: key }) => {
          const f = variables[key] as { value: string; description: string };
          await cacheVariableDefault(category, f.value, f.description);
          const override = await resolveVariableContent(input.subAccountId, category, f.value);
          if (override.description) f.description = override.description;
        }),
      );
      await Promise.all(
        variables.skills.map(async (skill) => {
          await cacheVariableDefault("skill", skill.name, skill.description);
          const override = await resolveVariableContent(input.subAccountId, "skill", skill.name);
          if (override.description) skill.description = override.description;
        }),
      );

      rawHumanDesign.variables = variables;
    }
  }

  // Which house system this sub-account's default Astrology chart design
  // uses (Chart Designs tab, 2026-08-09) — falls back to Placidus (the
  // calculator's own default) when no design is saved yet, so this never
  // blocks a reading from calculating.
  const defaultAstroDesign = reportConfig.includeAstrology
    ? await getDefaultChartDesign(input.subAccountId, "astrology")
    : null;

  // Chiron (2026-08-09) — also from Bodygraph's API, also best-effort; a
  // failed/skipped call just means the chart has no Chiron placement, same
  // "real field or absent" rule as the Variables above.
  const chiron = reportConfig.includeAstrology
    ? await fetchBodygraphChiron({ date: birthDate, time: birthTime, timeZone: place.timeZone, lat: place.lat, lng: place.lng })
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
      })
    : null;
  // Real rendered natal wheel from Bodygraph's own renderer — same reasoning as the HD chart above.
  if (rawAstrology && chiron?.chartSvg) rawAstrology.bodygraphSvg = chiron.chartSvg;

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
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as EnergeticDecoderReading,
  );
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
  return reading.subAccountId === subAccountId ? reading : null;
}
