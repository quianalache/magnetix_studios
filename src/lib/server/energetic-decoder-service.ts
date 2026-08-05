import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createContactServerSide,
  findExistingContactId,
} from "@/lib/server/contacts-service";
import { calculateGeneKeysProfile } from "@/lib/energetics/gene-keys";
import { geocodeBirthPlace } from "@/lib/energetics/geocode";
import type { EnergeticDecoderReading, EnergeticDecoderRequest } from "@/types/energetic-decoder";

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

  const db = getAdminDb();
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
    spheres: profile.spheres,
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
