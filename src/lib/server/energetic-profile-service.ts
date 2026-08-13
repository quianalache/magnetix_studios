import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { EnergeticProfile } from "@/types/energetic-profile";

/**
 * Energetic Profiles — Phase 3 Task 1 (2026-08-13), data layer only.
 * Flat top-level collection, same convention as `generatedReports`/
 * `reportDesigns`/`energeticDecoderReadings` (subAccountId/agencyId
 * fields rather than nested under the sub-account doc).
 *
 * Additive and inert by design: no UI calls any of this yet, and no
 * other service (Reading creation, Contact page) references it yet.
 * That wiring, and giving Reading a `profileId`, is later work — kept
 * separate so this task can ship without changing any existing
 * behavior or touching production Readings.
 */

function col() {
  return getAdminDb().collection("energeticProfiles");
}

/** Same fix/reasoning as report-design-service.ts's / generated-report-service.ts's toIsoString. */
function toIsoString(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return null;
}

function toEnergeticProfile(id: string, data: FirebaseFirestore.DocumentData): EnergeticProfile {
  return {
    id,
    ...(data as Omit<EnergeticProfile, "id" | "createdAt" | "updatedAt">),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

export async function createEnergeticProfile(opts: {
  agencyId: string;
  subAccountId: string;
  contactId: string;
  name: string;
  relationshipLabel?: string | null;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  timeZone: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<EnergeticProfile> {
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    contactId: opts.contactId,
    name: opts.name,
    relationshipLabel: opts.relationshipLabel ?? null,
    birthDate: opts.birthDate,
    birthTime: opts.birthTime,
    birthPlace: opts.birthPlace,
    timeZone: opts.timeZone,
    lat: opts.lat ?? null,
    lng: opts.lng ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  const snap = await ref.get();
  return toEnergeticProfile(ref.id, snap.data()!);
}

export async function getEnergeticProfile(subAccountId: string, id: string): Promise<EnergeticProfile | null> {
  const snap = await col().doc(id).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return toEnergeticProfile(snap.id, snap.data()!);
}

export async function listEnergeticProfilesForContact(
  subAccountId: string,
  contactId: string,
): Promise<EnergeticProfile[]> {
  const snap = await col()
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", contactId)
    .get();
  return snap.docs.map((d) => toEnergeticProfile(d.id, d.data()));
}

export async function updateEnergeticProfile(
  subAccountId: string,
  id: string,
  patch: Partial<Pick<EnergeticProfile, "name" | "relationshipLabel" | "birthDate" | "birthTime" | "birthPlace" | "timeZone" | "lat" | "lng">>,
): Promise<EnergeticProfile> {
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Energetic profile not found");
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const updated = await ref.get();
  return toEnergeticProfile(updated.id, updated.data()!);
}

/**
 * Owner-approved lifecycle rule (Phase 3 correction, 2026-08-13): a
 * Profile with any Readings must NOT be deletable — historical energetic
 * data is cleaned up from the child records upward (GeneratedReport →
 * Reading → Profile → Contact), never cascaded down from here. No
 * archive/soft-delete state is introduced; this blocks or it doesn't.
 *
 * The guard queries `energeticDecoderReadings` by `profileId` — that
 * field doesn't exist on any Reading yet (added in a later task), so
 * today this count is always 0 and every delete call succeeds. That's
 * intentional: the guard is correct code, just not yet exercised, so it
 * activates automatically once Reading creation starts writing
 * `profileId` — no changes needed here when that lands.
 */
export async function deleteEnergeticProfile(subAccountId: string, id: string): Promise<void> {
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Energetic profile not found");

  const readingCount = await getAdminDb()
    .collection("energeticDecoderReadings")
    .where("subAccountId", "==", subAccountId)
    .where("profileId", "==", id)
    .count()
    .get();
  if (readingCount.data().count > 0) {
    throw new Error("This profile has readings and can't be deleted. Delete those first.");
  }

  await ref.delete();
}
