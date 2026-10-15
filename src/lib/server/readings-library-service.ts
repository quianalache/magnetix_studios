import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  assembleReadingsLibrary,
  sunSignOf,
  type LibraryProfileInput,
  type LibraryReadingInput,
  type ReadingsLibraryPage,
  type ReadingsLibrarySort,
} from "@/lib/energetic-decoder/readings-library";
import type { ZodiacSign } from "@/lib/energetics/gate-data";

/**
 * Readings library (2026-10-07) — server side of Energetic Decoder →
 * Readings. Same model as the Contacts list (contacts-query-service.ts):
 * the server evaluates search/sort/paging over the sub-account's records
 * and returns exactly one page; the browser never loads every Profile,
 * reading or Contact.
 *
 * Reads are field-projected (`select` / `fieldMask`), so birth data,
 * coordinates and relationship labels are never even fetched for the list:
 *   - Profiles: name, contactId
 *   - readings: profileId, contactId, name, createdAt (no limit — this is
 *     the fix for the old newest-50 cap that made older Profiles look empty)
 *   - Contact names: only when searching, only for the Contacts involved
 *   - chart summary (HD type/profile, Sun sign): only for the page's rows
 *
 * Queries are single-field equality on subAccountId plus document gets, so
 * no Firestore composite index is needed.
 */
export async function listReadingsLibrary(
  subAccountId: string,
  opts: { q?: string | null; sort?: ReadingsLibrarySort; page?: number; pageSize?: number },
  db: FirebaseFirestore.Firestore = getAdminDb(),
): Promise<ReadingsLibraryPage> {
  const [profilesSnap, readingsSnap] = await Promise.all([
    db.collection("energeticProfiles").where("subAccountId", "==", subAccountId).select("name", "contactId").get(),
    db
      .collection("energeticDecoderReadings")
      .where("subAccountId", "==", subAccountId)
      .select("profileId", "contactId", "name", "createdAt")
      .get(),
  ]);

  const profiles: LibraryProfileInput[] = profilesSnap.docs.map((d) => ({
    id: d.id,
    name: str(d.get("name")) || "Unnamed",
    contactId: str(d.get("contactId")) || null,
  }));
  const readings: LibraryReadingInput[] = readingsSnap.docs.map((d) => ({
    id: d.id,
    profileId: str(d.get("profileId")) || null,
    contactId: str(d.get("contactId")) || null,
    name: str(d.get("name")) || "Unnamed",
    createdAt: toIso(d.get("createdAt")),
  }));

  const q = (opts.q ?? "").trim();
  const contactNames = q ? await loadContactNames(db, subAccountId, [...profiles, ...readings]) : new Map<string, string>();

  const assembled = assembleReadingsLibrary(profiles, readings, contactNames, { ...opts, q });

  const readingIds = assembled.rows.map((r) => r.latestReadingId).filter((id): id is string => !!id);
  const summaries = new Map<string, { energyType: string | null; hdProfile: string | null; sunSign: ZodiacSign | null }>();
  if (readingIds.length > 0) {
    const docs = await db.getAll(
      ...readingIds.map((id) => db.collection("energeticDecoderReadings").doc(id)),
      { fieldMask: ["subAccountId", "humanDesign.type", "humanDesign.profile", "astrology.placements"] },
    );
    for (const d of docs) {
      if (!d.exists || d.get("subAccountId") !== subAccountId) continue;
      const placements = d.get("astrology.placements") as { body: string; sign: ZodiacSign }[] | undefined;
      summaries.set(d.id, {
        energyType: str(d.get("humanDesign.type")) || null,
        hdProfile: str(d.get("humanDesign.profile")) || null,
        sunSign: sunSignOf(Array.isArray(placements) ? placements : null),
      });
    }
  }

  return {
    ...assembled,
    rows: assembled.rows.map((r) => ({
      ...r,
      ...(summaries.get(r.latestReadingId ?? "") ?? { energyType: null, hdProfile: null, sunSign: null }),
    })),
  };
}

/** Contact display names for search — name fields only, tenancy re-checked. */
async function loadContactNames(
  db: FirebaseFirestore.Firestore,
  subAccountId: string,
  records: { contactId: string | null }[],
): Promise<Map<string, string>> {
  const ids = [...new Set(records.map((r) => r.contactId).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const docs = await db.getAll(...chunk.map((id) => db.collection("contacts").doc(id)), {
      fieldMask: ["subAccountId", "name", "firstName", "lastName"],
    });
    for (const d of docs) {
      if (!d.exists || d.get("subAccountId") !== subAccountId) continue;
      const composed = [str(d.get("firstName")), str(d.get("lastName"))].filter(Boolean).join(" ");
      names.set(d.id, [str(d.get("name")), composed].filter(Boolean).join(" "));
    }
  }
  return names;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toIso(v: unknown): string | null {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return typeof v === "string" ? v : null;
}

/** One person on a Contact's Energetic Decoding card (Wave 2 follow-up). */
export interface ContactDecoderSummary {
  kind: "profile" | "reading";
  /** profileId for kind "profile", readingId for kind "reading" (legacy, no Profile). */
  id: string;
  name: string;
  relationshipLabel: string | null;
  latestReadingId: string | null;
  /** All read from the latest reading's stored chart — null when that system wasn't calculated. Never derived. */
  energyType: string | null;
  authority: string | null;
  hdProfile: string | null;
  sunSign: ZodiacSign | null;
}

/**
 * Contact profile → Energetic Decoding card (Wave 2 follow-up, 2026-10-15).
 * Same assembly as the Readings library (assembleReadingsLibrary), scoped to
 * ONE contact: their Profiles plus any legacy reading without a Profile, each
 * with the latest reading's Type / Authority / Profile / Sun sign. Equality
 * queries only (no composite index); tenancy re-checked on every reading.
 */
export async function listContactDecoderSummaries(
  subAccountId: string,
  contactId: string,
  db: FirebaseFirestore.Firestore = getAdminDb(),
): Promise<ContactDecoderSummary[]> {
  const [profilesSnap, readingsSnap] = await Promise.all([
    db
      .collection("energeticProfiles")
      .where("subAccountId", "==", subAccountId)
      .where("contactId", "==", contactId)
      .select("name", "contactId", "relationshipLabel")
      .get(),
    db
      .collection("energeticDecoderReadings")
      .where("subAccountId", "==", subAccountId)
      .where("contactId", "==", contactId)
      .select("profileId", "contactId", "name", "createdAt")
      .get(),
  ]);
  const labels = new Map(profilesSnap.docs.map((d) => [d.id, str(d.get("relationshipLabel")) || null]));
  const profiles: LibraryProfileInput[] = profilesSnap.docs.map((d) => ({
    id: d.id,
    name: str(d.get("name")) || "Unnamed",
    contactId: str(d.get("contactId")) || null,
  }));
  const readings: LibraryReadingInput[] = readingsSnap.docs.map((d) => ({
    id: d.id,
    profileId: str(d.get("profileId")) || null,
    contactId: str(d.get("contactId")) || null,
    name: str(d.get("name")) || "Unnamed",
    createdAt: toIso(d.get("createdAt")),
  }));
  const rows = assembleReadingsLibrary(profiles, readings, new Map(), { sort: "recent", page: 1, pageSize: 50 }).rows;

  const ids = rows.map((r) => r.latestReadingId).filter((id): id is string => !!id);
  const facts = new Map<string, Pick<ContactDecoderSummary, "energyType" | "authority" | "hdProfile" | "sunSign">>();
  if (ids.length > 0) {
    const docs = await db.getAll(...ids.map((id) => db.collection("energeticDecoderReadings").doc(id)), {
      fieldMask: ["subAccountId", "humanDesign.type", "humanDesign.authority", "humanDesign.profile", "astrology.placements"],
    });
    for (const d of docs) {
      if (!d.exists || d.get("subAccountId") !== subAccountId) continue;
      const placements = d.get("astrology.placements") as { body: string; sign: ZodiacSign }[] | undefined;
      facts.set(d.id, {
        energyType: str(d.get("humanDesign.type")) || null,
        authority: str(d.get("humanDesign.authority")) || null,
        hdProfile: str(d.get("humanDesign.profile")) || null,
        sunSign: sunSignOf(Array.isArray(placements) ? placements : null),
      });
    }
  }
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    name: r.name,
    relationshipLabel: r.kind === "profile" ? (labels.get(r.id) ?? null) : null,
    latestReadingId: r.latestReadingId,
    ...(facts.get(r.latestReadingId ?? "") ?? { energyType: null, authority: null, hdProfile: null, sunSign: null }),
  }));
}
