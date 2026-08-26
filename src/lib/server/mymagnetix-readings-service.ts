import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";

/**
 * Reading Ready loop (2026-08-26) — MyMagnetix's "Readings" discovery
 * surface. Kept in its own small file rather than added to
 * mymagnetix-service.ts (that file has substantial unrelated work already
 * in progress uncommitted on disk as of this pass — safer not to touch
 * it) and rather than reusing the Member-fan-out pattern every other
 * MyMagnetix list uses: a reading has no Member relationship at all
 * (it's tied to a CRM Contact), so this queries `energeticDecoderReadings`
 * directly by the `personId` field notifyReadingReady lazily writes back
 * — the reading-level equivalent of Member.personId.
 *
 * Historical readings (created before this feature shipped, or created
 * via the staff tool, which never links personId — see notification-
 * producers.ts) have no personId and simply don't appear here. That's
 * intentional, not a bug: this index only exists because notifyReadingReady
 * wrote it, so it inherently only covers what that producer has actually
 * touched. No backfill migration — matches the explicit "don't backfill"
 * instruction for the notification/email side, applied consistently here.
 */
export interface PersonReadingItem {
  readingId: string;
  subAccountId: string;
  businessName: string;
  readingName: string;
  personName: string;
  completedAt: string | null;
  viewHref: string;
}

function deriveReadingName(r: Pick<EnergeticDecoderReading, "spheres" | "humanDesign" | "astrology">): string {
  const count = [r.spheres.length > 0, !!r.humanDesign, !!r.astrology].filter(Boolean).length;
  if (count >= 3) return "Energetic Blueprint";
  if (r.humanDesign && count === 1) return "Human Design Reading";
  if (r.astrology && count === 1) return "Astrology Reading";
  if (r.spheres.length > 0 && count === 1) return "Gene Keys Reading";
  return "Energetic Reading";
}

/** Newest first, bounded — same "no infinite archive" convention the
 *  notification list uses. */
export async function listReadingsForPerson(personId: string, limit = 30): Promise<PersonReadingItem[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("energeticDecoderReadings")
    .where("personId", "==", personId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  if (snap.empty) return [];

  const subAccountIds = [...new Set(snap.docs.map((d) => d.data().subAccountId as string))];
  const subSnaps = await Promise.all(subAccountIds.map((id) => db.doc(`subAccounts/${id}`).get()));
  const businessNames = new Map(subSnaps.map((s) => [s.id, (s.data()?.name as string) || "Magnetix"]));

  return snap.docs.map((d) => {
    const data = d.data() as Omit<EnergeticDecoderReading, "id">;
    const createdAt = (data.createdAt as { toDate?: () => Date } | null)?.toDate?.() ?? null;
    return {
      readingId: d.id,
      subAccountId: data.subAccountId,
      businessName: businessNames.get(data.subAccountId) ?? "Magnetix",
      readingName: deriveReadingName(data),
      personName: data.name,
      completedAt: createdAt ? createdAt.toISOString() : null,
      viewHref: `/decoder/${data.subAccountId}/report/${d.id}`,
    };
  });
}
