import "server-only";

import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentPerson } from "@/lib/server/person-session";
import { getStaffForSubAccount } from "@/lib/auth/current-staff";
import { passGrants, readingPassCookieName, verifyReadingResultPass, type ReadingResultPass } from "@/lib/server/reading-result-pass";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";

/**
 * Who may see a saved Reading (2026-10-21). The Reading's id is NOT a key
 * any more — every customer-facing Reading surface (Reading Report, Report
 * Design delivery, PDF, Reading Result Page, MyMagnetix) asks this one
 * question, and access comes from exactly one of:
 *
 *   pass  — this browser holds a valid 24-hour result pass for THIS Reading
 *           in THIS business (the person who just submitted the Reading Tool)
 *   owner — signed into MyMagnetix with a verified email that is the
 *           Reading's Contact email (Readings a practitioner made for them
 *           included). `reading.personId` is a discovery index only and is
 *           deliberately NOT trusted here.
 *   staff — a signed-in member of the Reading's own business
 *
 * Anything else gets the "open it in MyMagnetix" gate, never the Reading.
 */
export type ReadingAccess =
  | { kind: "pass"; pass: ReadingResultPass }
  | { kind: "owner"; personId: string }
  | { kind: "staff"; uid: string };

const normalize = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** The email a Reading belongs to — its Contact's email. */
export async function readingOwnerEmail(reading: Pick<EnergeticDecoderReading, "contactId">): Promise<string | null> {
  if (!reading.contactId) return null;
  const snap = await getAdminDb().doc(`contacts/${reading.contactId}`).get();
  const email = normalize(snap.get("email") as string | undefined);
  return email || null;
}

/** True when the signed-in MyMagnetix person owns this Reading. */
export async function personOwnsReading(
  person: { id: string; primaryEmail: string; emailVerified: boolean } | null,
  reading: Pick<EnergeticDecoderReading, "contactId">,
): Promise<boolean> {
  // A session created before its email was proven never sees Readings —
  // the same rule MyMagnetix's Readings list already follows.
  if (!person || !person.emailVerified) return false;
  const owner = await readingOwnerEmail(reading);
  return !!owner && owner === normalize(person.primaryEmail);
}

export async function authorizeReadingAccess(
  subAccountId: string,
  reading: EnergeticDecoderReading,
): Promise<ReadingAccess | null> {
  if (reading.subAccountId !== subAccountId) return null;

  const cookieStore = await cookies();
  const pass = verifyReadingResultPass(cookieStore.get(readingPassCookieName(reading.id))?.value);
  if (passGrants(pass, { readingId: reading.id, subAccountId })) return { kind: "pass", pass: pass! };

  const person = await getCurrentPerson();
  if (await personOwnsReading(person, reading)) return { kind: "owner", personId: person!.id };

  const staff = await getStaffForSubAccount(subAccountId);
  if (staff) return { kind: "staff", uid: staff.uid };

  return null;
}

/** "q•••@gmail.com" — enough to recognize your own inbox, not to harvest it. */
export function maskEmail(email: string | null | undefined): string | null {
  const e = normalize(email);
  const at = e.indexOf("@");
  if (at < 1) return null;
  return `${e[0]}•••${e.slice(at)}`;
}
