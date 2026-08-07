import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createContactServerSide,
  findExistingContactId,
} from "@/lib/server/contacts-service";
import { calculateGeneKeysProfile } from "@/lib/energetics/gene-keys";
import { calculateHumanDesignProfile } from "@/lib/energetics/human-design";
import { geocodeBirthPlace } from "@/lib/energetics/geocode";
import { resolveGateContent } from "@/lib/server/energetic-decoder-gate-content-service";
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

  const humanDesign = reportConfig.includeHumanDesign
    ? calculateHumanDesignProfile({ date: birthDate, time: birthTime, timeZone: place.timeZone })
    : null;

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
