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

/**
 * Course/Classroom structure.
 *
 * IMPORTANT — Skool's own raw `unitType` field uses INVERTED terminology
 * from what these types (and everyday "course" language) mean. Confirmed
 * live against 5 real courses on the owner's actual "Magnetic Visibility"
 * community (1, 2, 3, 9, and 22 real content units; both published and
 * draft/unpublished courses; both native-hosted and external-link video;
 * courses with grouped sections, flat ungrouped content, and a mix of both):
 *  - what Skool calls a "module" is the LEAF content unit — it's the thing
 *    that actually carries `desc` (rich text), video, and resources. That's
 *    what these types call a `SkoolLesson`.
 *  - what Skool calls a "set" is the GROUPING one level up — a named
 *    section containing a handful of "module"s. That's a
 *    `SkoolCourseSection` below.
 *  - nesting only ever goes course -> section -> lesson, OR course ->
 *    lesson directly (a course can mix ungrouped top-level lessons with
 *    grouped sections in the same course — confirmed live in "YouTube By
 *    Design": 4 flat lessons followed by 9 sections). A section was never
 *    observed containing another section.
 * Do not rename these back to match Skool's own field value without
 * re-confirming against real data — the raw `unitType` string is preserved
 * verbatim in skool-extract.ts's raw parsing step for exactly this reason.
 */
export interface SkoolCourse {
  skoolCourseId: string;
  title: string;
  /** Course-level rich text, parsed the same way as SkoolLesson.bodyRichText
   *  (same "[v2]" + JSON-array format) — shown on the course's own landing
   *  tile. Null when absent or unparseable (see extractCourse's warnings). */
  desc: unknown[] | null;
  coverImageUrl: string | null;
  /** Raw gating-tier number, passed through unchanged. Skool used TWO
   *  different field names for what appears to be the same concept across
   *  the 5 real courses sampled (`minTier` on published courses,
   *  `minAccessLevel` on at least one draft) — both are read defensively,
   *  but neither's exact real-world meaning (which paid tier, if any) was
   *  independently confirmed, so this is reported raw, not interpreted. */
  minTier: number | null;
  /** Raw `privacy` value, passed through unchanged — observed values 0-3,
   *  correlated with (but not confirmed identical to) published/draft
   *  status in every one of the 15 real courses seen; not assumed to mean
   *  anything more specific than that without further confirmation. */
  privacy: number | null;
  /** `state === 2 && public === true` on the root course node — the one
   *  combination confirmed, live, to correspond to a real member-visible
   *  course (10 of all 15 real courses on the source community). The other
   *  combination seen (`state === 1`, `public` absent) corresponded to a
   *  course invisible to real members despite having full real content
   *  already built underneath it in most cases (the other 5 of 15: real
   *  lesson counts of 8, 11, 5, 2, and 2) — so `published: false` does NOT
   *  mean "empty," it means "not yet released." The classroom index's own
   *  `metadata.numModules` is NOT a safe proxy for content count: it read
   *  `0` for every one of those 5 unpublished courses despite their real
   *  lesson counts above — do not use it for reporting or gating; count
   *  real units in the tree instead (see extractCourse in skool-extract.ts,
   *  which does exactly that). */
  published: boolean;
  units: SkoolCourseUnit[];
}

export type SkoolCourseUnit =
  | { type: "section"; section: SkoolCourseSection }
  | { type: "lesson"; lesson: SkoolLesson };

export interface SkoolCourseSection {
  /** Skool's own "set" unit id. */
  skoolSectionId: string;
  title: string;
  order: number;
  lessons: SkoolLesson[];
}

export type SkoolLessonVideo =
  /** Skool-hosted (Mux) video — confirmed live via `metadata.videoId` on
   *  the lesson; actual signed playback (`playbackId`/`playbackToken`) is
   *  only returned for whichever ONE lesson is "selected" via the page's
   *  own `?md=` query param, not embedded per-lesson in the course tree —
   *  fetching a specific lesson's real playback requires its own page
   *  fetch with `?md={skoolLessonId}`, which this extraction pass does not
   *  do (structure/inventory only, no playback resolution — see the task's
   *  own scope). */
  | { kind: "native"; skoolVideoId: string }
  /** An external link (every real example seen was a youtu.be URL) with
   *  its own duration/thumbnail already present in the lesson's metadata —
   *  no extra fetch needed for these three fields. */
  | {
      kind: "external";
      url: string;
      durationMs: number | null;
      thumbnailUrl: string | null;
    }
  | { kind: "none" };

export interface SkoolLesson {
  /** Skool's own "module" unit id. */
  skoolLessonId: string;
  title: string;
  order: number;
  /** `metadata.hasAccess === 1` on the raw lesson — observed `1` on every
   *  real lesson sampled (including ones under draft/unpublished courses);
   *  never seen `0` live, so its real gating behavior (e.g. for a locked
   *  higher-tier lesson) is unconfirmed. Reported as-is, not assumed. */
  hasAccess: boolean;
  video: SkoolLessonVideo;
  /** Raw rich-text body, kept as the parsed JSON node array from Skool's
   *  own "[v2]" + JSON-array format (paragraph/heading/text/unorderedList/
   *  listItem nodes with bold/italic/link marks all confirmed live) —
   *  rendering this into Magnetix's own content format is deliberately left
   *  to the mapping layer, not this one. Null when the raw `desc` field was
   *  absent or failed to parse (both handled — a malformed body must not
   *  fail the whole course's extraction). */
  bodyRichText: unknown[] | null;
  /** Parsed `resources` — confirmed live across all 15 real courses on the
   *  source community (26 real non-empty lessons found, always exactly one
   *  item each): every item was one of two shapes, a plain external link
   *  (`{title, link}`, e.g. a Google Doc) or a Skool-hosted file
   *  (`{title, file_id, file_name, file_content_type}`, every real example
   *  a PDF slide deck). `unrecognized` is a genuine safety net for a third
   *  shape that was never actually seen — reported explicitly (see
   *  skool-extract.ts), never silently coerced into one of the two known
   *  kinds. */
  resources: SkoolLessonResource[];
}

export type SkoolLessonResource =
  | { kind: "external-link"; title: string; url: string }
  | {
      kind: "hosted-file";
      title: string;
      fileId: string;
      fileName: string | null;
      contentType: string | null;
    }
  | { kind: "unrecognized"; raw: unknown };

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
