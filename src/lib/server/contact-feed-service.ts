import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveAuthorNames } from "@/lib/server/contact-route-guard";
import { activityCategory, type ActivityCategory } from "@/lib/contacts/activity-categories";
import type {
  ContactActivityItem,
  ContactActivityPage,
  ContactNoteView,
  ContactNotesPage,
} from "@/types/contact-feed";

/**
 * Notes + Activity for the Contact profile (Contacts redesign, 2026-09-25).
 *
 * Both are paginated server reads (cursor = the last row's exact
 * createdAt, "seconds.nanos") so a contact with years of history never
 * loads everything at once — the old timeline subscribed to BOTH full
 * collections unbounded.
 *
 * Notes and Activity stay separate stores (contacts/{id}/notes vs
 * contacts/{id}/activities), exactly as before. The Activity feed
 * represents note-related activity by synthesizing a content-free
 * "Note added by …" row from each note's metadata — no second record is
 * written, so there's nothing to fall out of sync when a note is edited or
 * deleted, and historical notes are represented too.
 */

export const NOTE_MAX_LENGTH = 10_000;
const NOTES_PAGE = 25;
const ACTIVITY_PAGE = 30;
const ACTIVITY_SCAN_BATCH = 60;
const ACTIVITY_SCAN_MAX = 600;

export class ContactFeedError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function tsToCursor(v: unknown): string | null {
  const t = v as { seconds?: number; nanoseconds?: number } | null;
  if (!t || typeof t.seconds !== "number") return null;
  return `${t.seconds}.${t.nanoseconds ?? 0}`;
}

function cursorToTs(cursor: string | null | undefined): Timestamp | null {
  if (!cursor) return null;
  const m = /^(\d{1,12})\.(\d{1,9})$/.exec(cursor);
  if (!m) return null;
  return new Timestamp(Number(m[1]), Number(m[2]));
}

function tsToIso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

/* --------------------------------- Notes -------------------------------- */

function notesCol(contactId: string) {
  return getAdminDb().collection(`contacts/${contactId}/notes`);
}

export async function listContactNotes(opts: {
  subAccountId: string;
  contactId: string;
  cursor?: string | null;
  caller: { uid: string; isAdmin: boolean };
}): Promise<ContactNotesPage> {
  let q = notesCol(opts.contactId).orderBy("createdAt", "desc");
  const before = cursorToTs(opts.cursor);
  if (before) q = q.where("createdAt", "<", before);
  const snap = await q.limit(NOTES_PAGE + 1).get();
  const docs = snap.docs.slice(0, NOTES_PAGE);
  const authors = await resolveAuthorNames(
    opts.subAccountId,
    docs.flatMap((d) => [d.get("createdBy"), d.get("updatedBy")]).filter(Boolean),
  );
  const notes: ContactNoteView[] = docs.map((d) => {
    const createdBy = (d.get("createdBy") as string) ?? "";
    const updatedBy = (d.get("updatedBy") as string | null) ?? null;
    const isAuthor = !!createdBy && createdBy === opts.caller.uid;
    return {
      id: d.id,
      content: (d.get("content") as string) ?? "",
      createdAt: tsToIso(d.get("createdAt")),
      updatedAt: tsToIso(d.get("updatedAt")),
      createdBy,
      authorName: authors.get(createdBy)?.name ?? null,
      editedByName: updatedBy ? (authors.get(updatedBy)?.name ?? null) : null,
      canEdit: isAuthor,
      canDelete: isAuthor || opts.caller.isAdmin,
    };
  });
  return {
    notes,
    nextCursor:
      snap.docs.length > NOTES_PAGE ? tsToCursor(docs[docs.length - 1]?.get("createdAt")) : null,
  };
}

function cleanContent(v: unknown): string {
  const content = typeof v === "string" ? v.trim() : "";
  if (!content) throw new ContactFeedError("A note can't be empty.", 400);
  if (content.length > NOTE_MAX_LENGTH) {
    throw new ContactFeedError(`Keep notes under ${NOTE_MAX_LENGTH} characters.`, 400);
  }
  return content;
}

/** Author is ALWAYS the authenticated caller — never client-supplied. */
export async function createContactNote(opts: {
  contactId: string;
  uid: string;
  content: unknown;
}): Promise<string> {
  const ref = await notesCol(opts.contactId).add({
    content: cleanContent(opts.content),
    createdBy: opts.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Edit: author only. Preserves `createdBy` + `createdAt` (the original
 * authorship) and stamps `updatedAt` / `updatedBy`.
 */
export async function updateContactNote(opts: {
  contactId: string;
  noteId: string;
  uid: string;
  content: unknown;
}): Promise<void> {
  const ref = notesCol(opts.contactId).doc(opts.noteId);
  const snap = await ref.get();
  if (!snap.exists) throw new ContactFeedError("Note not found.", 404);
  if (snap.get("createdBy") !== opts.uid) {
    throw new ContactFeedError("Only the person who wrote a note can edit it.", 403);
  }
  await ref.update({
    content: cleanContent(opts.content),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: opts.uid,
  });
}

/** Delete: the author, or a sub-account admin / agency owner. */
export async function deleteContactNote(opts: {
  contactId: string;
  noteId: string;
  caller: { uid: string; isAdmin: boolean };
}): Promise<void> {
  const ref = notesCol(opts.contactId).doc(opts.noteId);
  const snap = await ref.get();
  if (!snap.exists) throw new ContactFeedError("Note not found.", 404);
  if (snap.get("createdBy") !== opts.caller.uid && !opts.caller.isAdmin) {
    throw new ContactFeedError(
      "Only the note's author or a workspace admin can delete it.",
      403,
    );
  }
  await ref.delete();
}

/* ------------------------------- Activity ------------------------------- */

export function parseActivityFilter(v: string | null): "all" | ActivityCategory {
  const allowed: ("all" | ActivityCategory)[] = [
    "all",
    "messages",
    "meetings",
    "sales",
    "pipeline",
    "forms",
    "automation",
    "access",
    "notes",
    "other",
  ];
  return allowed.includes(v as ActivityCategory) ? (v as ActivityCategory) : "all";
}

interface RawRow {
  item: ContactActivityItem;
  ts: Timestamp;
}

/**
 * One page of the Activity tab. Scans activities newest-first in batches
 * (filtering by category in memory — no per-type composite index needed),
 * merges synthesized note rows from the same time window, and returns up
 * to ACTIVITY_PAGE items.
 */
export async function listContactActivity(opts: {
  subAccountId: string;
  contactId: string;
  cursor?: string | null;
  filter: "all" | ActivityCategory;
}): Promise<ContactActivityPage> {
  const db = getAdminDb();
  const before = cursorToTs(opts.cursor);
  const rows: RawRow[] = [];
  let activitiesExhausted = false;
  // Oldest activity timestamp examined so far — where a narrow filter's
  // next page resumes when a scan fills its budget without filling a page.
  let lastTs: Timestamp | null = before;

  if (opts.filter !== "notes") {
    let scanned = 0;
    while (rows.length < ACTIVITY_PAGE && scanned < ACTIVITY_SCAN_MAX) {
      let q = db
        .collection(`contacts/${opts.contactId}/activities`)
        .orderBy("createdAt", "desc");
      if (lastTs) q = q.where("createdAt", "<", lastTs);
      const snap = await q.limit(ACTIVITY_SCAN_BATCH).get();
      scanned += snap.size;
      for (const d of snap.docs) {
        const ts = d.get("createdAt") as Timestamp | null;
        if (!ts) continue;
        const type = (d.get("type") as string) ?? "";
        const meta = (d.get("meta") as Record<string, unknown> | null) ?? null;
        if (opts.filter !== "all" && activityCategory(type, meta) !== opts.filter) continue;
        rows.push({
          ts,
          item: {
            id: d.id,
            kind: "activity",
            type,
            content: (d.get("content") as string) ?? "",
            createdAt: ts.toDate().toISOString(),
            createdBy: (d.get("createdBy") as string) ?? "",
            actorName: null,
            meta,
          },
        });
      }
      if (snap.size < ACTIVITY_SCAN_BATCH) {
        activitiesExhausted = true;
        break;
      }
      lastTs = (snap.docs[snap.docs.length - 1].get("createdAt") as Timestamp) ?? null;
      if (!lastTs) break;
    }
  } else {
    activitiesExhausted = true;
  }

  // Note markers from the same window (content-free — the note itself
  // lives in the Notes tab).
  if (opts.filter === "all" || opts.filter === "notes") {
    let q = db
      .collection(`contacts/${opts.contactId}/notes`)
      .orderBy("createdAt", "desc")
      .select("createdAt", "createdBy");
    if (before) q = q.where("createdAt", "<", before);
    const snap = await q.limit(ACTIVITY_PAGE + 1).get();
    for (const d of snap.docs) {
      const ts = d.get("createdAt") as Timestamp | null;
      if (!ts) continue;
      rows.push({
        ts,
        item: {
          id: `note-${d.id}`,
          kind: "note",
          type: "note_added",
          content: "",
          createdAt: ts.toDate().toISOString(),
          createdBy: (d.get("createdBy") as string) ?? "",
          actorName: null,
          meta: { noteId: d.id },
        },
      });
    }
  }

  rows.sort((a, b) => b.ts.toMillis() - a.ts.toMillis() || (a.item.id < b.item.id ? 1 : -1));
  const page = rows.slice(0, ACTIVITY_PAGE);
  const hasMore = rows.length > ACTIVITY_PAGE || !activitiesExhausted;

  const authors = await resolveAuthorNames(
    opts.subAccountId,
    page.map((r) => r.item.createdBy),
  );
  for (const r of page) {
    r.item.actorName = authors.get(r.item.createdBy)?.name ?? null;
  }

  let nextCursor: string | null = null;
  if (hasMore) {
    const pageEnd = page.length > 0 ? page[page.length - 1].ts : null;
    // Short page from a budget-limited scan: resume below everything
    // scanned (the skipped rows didn't match the filter anyway).
    const resumeAt =
      page.length < ACTIVITY_PAGE && !activitiesExhausted && lastTs
        ? lastTs
        : pageEnd;
    nextCursor = resumeAt ? tsToCursor(resumeAt) : null;
  }
  return { items: page.map((r) => r.item), nextCursor };
}
