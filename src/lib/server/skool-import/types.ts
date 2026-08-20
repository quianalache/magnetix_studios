/**
 * Skool → Magnetix Community importer — shared types.
 *
 * Layered architecture (see module comments in each file for the "why"):
 *   skool-session   → how we're authenticated to Skool right now
 *   skool-client    → raw HTTP calls against Skool's own authenticated
 *                     surfaces (embedded __NEXT_DATA__ pages + api2.skool.com)
 *   skool-extract   → turns those raw responses into the Skool* types below
 *   csv-enrichment  → optional supplemental email recovery (THIS run only —
 *                     see its own module comment for why this is not the
 *                     permanent architecture)
 *   mapping         → PURE functions: Skool* → Magnetix write-shapes
 *   import-mappings → the existing generic `importMappings` idempotency
 *                     ledger (src/types/import.ts), reused, not reinvented
 *   importer        → orchestrates a dry-run PLAN or a real EXECUTE pass
 *     over the same plan, so "what would happen" and "what happened" can
 *     never drift apart from each other
 *
 * None of this is Quiana-specific — every function takes the Skool group
 * slug / Magnetix subAccountId+groupId as parameters, so a future
 * self-service "Import from Skool" UI can call the exact same layers with a
 * different customer's session and target community.
 */

/** Raw Skool member as recovered from the authenticated Members page's
 *  embedded __NEXT_DATA__. `email` is almost always "" — see csv-enrichment. */
export interface SkoolMember {
  skoolUserId: string;
  name: string;
  handle: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  joinedAtIso: string | null;
  points: number | null;
  level: number | null;
  role: number | null;
  /** Which Skool member tab this was found under. "active" gets a real
   *  GroupMembership; "churned" only gets Member+Contact+Person identity
   *  (so their historical posts/comments keep real authorship) — they
   *  cancelled/left, so a live active Magnetix community membership for
   *  them would misrepresent their real relationship to the Community.
   *  Skool exposes no "banned" members in this Community (0 found), so
   *  that case never reaches the importer this run. */
  membershipTab: "active" | "churned";
}

export interface SkoolAttachment {
  /** "video" is always DEFERRED downstream (mapping.ts) — Skool's video
   *  URLs are signed, expiring HLS playlists, never a permanent Magnetix
   *  reference. "voice"/"file" map onto Magnetix's existing MediaAttachment
   *  kinds of the same name; "other" is a genuine safety-net for a content
   *  type this importer can't classify at all — reported and skipped
   *  EXPLICITLY, never silently (see mapSkoolAttachments). */
  kind: "image" | "video" | "voice" | "file" | "other";
  url: string;
  fileName?: string;
  contentType?: string;
  /** Only ever populated for comment attachments directly from Skool's own
   *  `attachments_data` metadata, or for post images via a best-effort HEAD
   *  request to assets.skool.com (see skool-extract.ts's
   *  enrichPostImageAttachments) — absent, never guessed, otherwise. */
  fileSizeBytes?: number;
  width?: number;
  height?: number;
}

export interface SkoolPost {
  skoolPostId: string;
  /** The short id used in the post's own URL (`?p=...`) — kept for
   *  traceability/debugging, not used as the mapping key (skoolPostId is). */
  shortId: string;
  title: string;
  bodyHtml: string;
  authorSkoolUserId: string;
  category: string | null;
  pinned: boolean;
  upvotes: number;
  createdAtIso: string;
  updatedAtIso: string | null;
  attachments: SkoolAttachment[];
}

export interface SkoolComment {
  skoolCommentId: string;
  postId: string;
  /** Skool's own `parent_id` — the post if top-level, another comment if a
   *  reply, arbitrarily deep. Flattening to Magnetix's 2-level model happens
   *  in mapping.ts, not here — this is the raw shape. */
  rawParentId: string;
  authorSkoolUserId: string;
  bodyHtml: string;
  upvotes: number;
  createdAtIso: string;
  updatedAtIso: string | null;
  attachments: SkoolAttachment[];
}

export interface SkoolCourse {
  skoolCourseId: string;
  title: string;
  modules: SkoolCourseModule[];
}

export interface SkoolCourseModule {
  skoolModuleId: string;
  title: string;
  order: number;
  lessons: SkoolLesson[];
}

export interface SkoolLesson {
  skoolLessonId: string;
  title: string;
  order: number;
  /** Structure/metadata only this pass — no video download (Part: Classroom
   *  is a separate migration track). */
  hasVideo: boolean;
}

/** One CSV row from Skool's owner-verified Members export — see
 *  csv-enrichment.ts for the exact parsing/normalization rules. */
export interface SkoolCsvMemberRow {
  firstName: string;
  lastName: string;
  email: string;
  invitedBy: string;
  joinedDateIso: string | null;
  answers: { question: string; answer: string }[];
  price: string;
  recurringInterval: string;
  tier: string;
  ltv: string;
}

/** A Skool member merged with whatever email source resolved it. */
export interface EnrichedSkoolMember extends SkoolMember {
  resolvedEmail: string | null;
  emailSource: "skool-payload" | "csv" | "unresolved";
  csvRow: SkoolCsvMemberRow | null;
}
