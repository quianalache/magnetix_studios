/**
 * Readings library (2026-10-07) — the pure, client-safe half of the
 * Energetic Decoder → Readings list. The server service
 * (readings-library-service.ts) feeds it projected Firestore rows; this
 * groups, searches, sorts and pages them. No Firestore, no React, so the
 * scale and privacy behavior is testable in isolation.
 *
 * One row = one Energetic Profile (the person identity). Its readings are
 * immutable snapshots; the row shows the LATEST one's Energy Type, Profile
 * and Sun Sign, and opens it. Older snapshots stay reachable from the
 * Reading workspace, never as nested rows here.
 *
 * A legacy reading with no profileId can't join a Profile row, so it gets a
 * row of its own (kind "reading") instead of being hidden. No migration.
 *
 * Privacy: rows carry name + chart summary only. Birth date/time/place,
 * time zone, coordinates and relationship labels are never read into these
 * types, and search only matches the person's name and their Contact's
 * name.
 */
import type { ZodiacSign } from "@/lib/energetics/gate-data";

export const READINGS_LIBRARY_PAGE_SIZE = 25;

export type ReadingsLibrarySort = "recent" | "name_asc" | "name_desc";
export const READINGS_LIBRARY_SORTS: ReadingsLibrarySort[] = ["recent", "name_asc", "name_desc"];

/** A Profile, projected to the fields the library may use. */
export interface LibraryProfileInput {
  id: string;
  name: string;
  contactId: string | null;
}

/** A reading, projected to the fields the library may use. */
export interface LibraryReadingInput {
  id: string;
  profileId: string | null;
  contactId: string | null;
  name: string;
  /** ISO string or null (serverTimestamp not yet resolved). */
  createdAt: string | null;
}

/** Chart summary of one reading, read only for the rows on the page being returned. */
export interface LibraryReadingSummary {
  energyType: string | null;
  hdProfile: string | null;
  sunSign: ZodiacSign | null;
}

export interface ReadingsLibraryRow extends LibraryReadingSummary {
  kind: "profile" | "reading";
  /** profileId for kind "profile", readingId for kind "reading". */
  id: string;
  name: string;
  contactId: string | null;
  /** The reading the row opens; null for a Profile with no reading yet. */
  latestReadingId: string | null;
}

export interface ReadingsLibraryPage {
  rows: ReadingsLibraryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface Candidate {
  kind: "profile" | "reading";
  id: string;
  name: string;
  contactId: string | null;
  latestReadingId: string | null;
  latestAt: string;
  /** Extra names search may match (the Contact's name). */
  searchNames: string[];
}

export function normalizeLibrarySort(value: string | null | undefined): ReadingsLibrarySort {
  return READINGS_LIBRARY_SORTS.includes(value as ReadingsLibrarySort) ? (value as ReadingsLibrarySort) : "recent";
}

export function normalizeLibraryPage(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Group readings under their Profile (latest wins), add one row per legacy
 * profile-less reading, then search + sort + page. Every reading in the
 * sub-account is considered — there is no newest-N cap, so an old Profile
 * never looks like it has no readings.
 */
export function assembleReadingsLibrary(
  profiles: LibraryProfileInput[],
  readings: LibraryReadingInput[],
  contactNames: Map<string, string>,
  opts: { q?: string | null; sort?: ReadingsLibrarySort; page?: number; pageSize?: number } = {},
): Omit<ReadingsLibraryPage, "rows"> & { rows: Omit<ReadingsLibraryRow, keyof LibraryReadingSummary>[] } {
  const pageSize = opts.pageSize ?? READINGS_LIBRARY_PAGE_SIZE;
  const sort = opts.sort ?? "recent";

  const profileIds = new Set(profiles.map((p) => p.id));
  const latestByProfile = new Map<string, LibraryReadingInput>();
  const unlinked: LibraryReadingInput[] = [];
  for (const r of readings) {
    if (r.profileId && profileIds.has(r.profileId)) {
      const cur = latestByProfile.get(r.profileId);
      if (!cur || (r.createdAt ?? "") > (cur.createdAt ?? "")) latestByProfile.set(r.profileId, r);
    } else {
      // No profileId (legacy), or one pointing at a Profile that no longer
      // exists (shouldn't happen — Profile delete is blocked while it has
      // readings). Either way the reading gets its own row, never hidden.
      unlinked.push(r);
    }
  }

  const contactName = (id: string | null) => (id ? (contactNames.get(id) ?? "") : "");

  const candidates: Candidate[] = [
    ...profiles.map((p) => {
      const latest = latestByProfile.get(p.id) ?? null;
      return {
        kind: "profile" as const,
        id: p.id,
        name: p.name,
        contactId: p.contactId,
        latestReadingId: latest?.id ?? null,
        latestAt: latest?.createdAt ?? "",
        searchNames: [contactName(p.contactId)],
      };
    }),
    ...unlinked.map((r) => ({
      kind: "reading" as const,
      id: r.id,
      name: r.name,
      contactId: r.contactId,
      latestReadingId: r.id,
      latestAt: r.createdAt ?? "",
      searchNames: [contactName(r.contactId)],
    })),
  ];

  const q = (opts.q ?? "").trim().toLowerCase();
  const matched = q
    ? candidates.filter((c) => [c.name, ...c.searchNames].some((n) => n.toLowerCase().includes(q)))
    : candidates;

  const byName = (a: Candidate, b: Candidate) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
  matched.sort((a, b) => {
    if (sort === "name_asc") return byName(a, b);
    if (sort === "name_desc") return byName(b, a);
    // "recent": most recent reading first; Profiles with no reading yet last, by name.
    if (a.latestAt && b.latestAt) return b.latestAt.localeCompare(a.latestAt) || byName(a, b);
    if (a.latestAt) return -1;
    if (b.latestAt) return 1;
    return byName(a, b);
  });

  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);
  const slice = matched.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: slice.map(({ kind, id, name, contactId, latestReadingId }) => ({ kind, id, name, contactId, latestReadingId })),
    total,
    page,
    pageSize,
    pageCount,
  };
}

/** Sun sign of an astrology chart's placements — null when the reading has no astrology. */
export function sunSignOf(placements: { body: string; sign: ZodiacSign }[] | null | undefined): ZodiacSign | null {
  return placements?.find((p) => p.body === "sun")?.sign ?? null;
}

/** The page numbers to show (a window of up to 5 around the current page). */
export function libraryPageWindow(page: number, pageCount: number, size = 5): number[] {
  const half = Math.floor(size / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(pageCount, start + size - 1);
  start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
