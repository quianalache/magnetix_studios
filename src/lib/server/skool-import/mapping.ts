import "server-only";

import crypto from "node:crypto";
import {
  sanitizeCommunityCommentHtml,
  sanitizeCommunityPostHtml,
} from "@/lib/community/post-html";
import { parseVideoUrl } from "@/lib/community/video-embed";
import type { MediaAttachment } from "@/types/media-attachment";
import type { ResourceLink, VideoProvider } from "@/types/community";
import { mappingKey } from "./import-mappings";
import type {
  SkoolAttachment,
  SkoolComment,
  SkoolCourse,
  SkoolLesson,
  SkoolLessonResource,
  SkoolLessonVideo,
  SkoolPost,
} from "./types";

/**
 * Pure Skool → Magnetix transform functions — no I/O, no Firestore, so
 * every one of these is directly unit-testable and reused identically by
 * both the dry-run plan and the real execute pass (see importer.ts).
 */

/**
 * A Skool @mention target, resolved to its real Magnetix identity — keyed
 * by the stable Skool user id (the id inside `obj://user/<id>`, NOT the
 * display name; never resolved by name, per explicit instruction). Built
 * by `buildMentionResolver` (mention-resolver.ts) from the SAME
 * `community_members` importMappings ledger every other entity already
 * uses — works identically for an active imported Member or a
 * historical-author-only Member, since both get a real mapping entry.
 */
export type SkoolMentionResolver = Map<
  string,
  { memberId: string; displayName: string }
>;

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return escapeHtmlText(s).replace(/"/g, "&quot;");
}

/**
 * Skool's own @mention markdown — `[@Display Name](obj://user/<skoolUserId>)`
 * — confirmed live against the real imported Magnetic Visibility content
 * (206 real occurrences across 14 posts + 161 comments, every single one in
 * exactly this bracketed form; 0 malformed). The generic `[text](url)` link
 * regex below never touches this: it only matches `https?://`, so an
 * `obj://` target always fell through untouched, leaving the raw markdown
 * as broken-looking visible text — the exact bug this closes.
 *
 * Matches ANY `[text](obj://...)` shape (not only the exact well-formed
 * one) so a genuinely malformed/unexpected `obj://` path still gets
 * neutralized to clean plain text rather than left broken — same fallback
 * as a mention whose target user id has no known mapping. Resolved via
 * `mentions` (the stable Skool user id -> real Magnetix Member, NEVER a
 * display-name match) into the exact HTML the live TipTap mention
 * extension itself produces (`community-mention-extensions.ts`):
 * `<span data-type="mention" data-id="{memberId}" data-label="{name}">@{name}</span>` —
 * so an imported mention is indistinguishable, to both the sanitizer and
 * the renderer, from one a member typed by hand. No parallel/import-only
 * mention representation invented.
 */
export function convertSkoolMentions(
  text: string,
  mentions?: SkoolMentionResolver
): string {
  return text.replace(
    /\[([^\]]*)\]\(obj:\/\/([^)]*)\)/g,
    (_full, label: string, objPath: string) => {
      const idMatch = /^user\/([a-zA-Z0-9]+)$/.exec(objPath);
      const resolved = idMatch ? mentions?.get(idMatch[1]) : undefined;
      if (resolved) {
        const name = escapeHtmlText(resolved.displayName);
        return `<span data-type="mention" data-id="${escapeHtmlAttr(resolved.memberId)}" data-label="${escapeHtmlAttr(resolved.displayName)}">@${name}</span>`;
      }
      // Unresolvable (no mapping for this Skool user id, or a malformed
      // obj:// path) -- degrade to the clean plain text Skool's own label
      // already carries ("@Display Name"), per explicit instruction: never
      // leave the raw [label](obj://...) markup, and never invent a Member
      // relationship for someone with no safe mapping.
      return label;
    }
  );
}

/**
 * Skool post/comment `content` is plain text with light Markdown-ish
 * conventions (confirmed live: `**bold**`, `[text](url)` links, `[@Name]
 * (obj://user/<id>)` mentions, blank-line paragraphs) — NOT HTML.
 * Magnetix's `CommunityPost.body`/`CommunityComment.body` are sanitized
 * HTML. This is a deliberately small, dependency-free converter (no
 * markdown library exists in this codebase yet) covering exactly what real
 * Skool content in this Community uses: paragraphs, bold, italic, links,
 * mentions, line breaks. It is NOT a general Markdown engine — anything it
 * doesn't recognize is passed through as escaped plain text, never
 * silently dropped. The result is always run through the existing
 * `sanitizeCommunityPostHtml`/`sanitizeCommunityCommentHtml` afterward, so
 * this function does not need to be trusted for safety, only fidelity.
 *
 * `mentions` is optional (omitted callers get the pre-existing behavior:
 * every `obj://user/...` mention degrades to plain text) so nothing else
 * calling this function needs to change.
 */
export function skoolContentToHtml(
  raw: string,
  mentions?: SkoolMentionResolver
): string {
  if (!raw) return "";
  const escape = escapeHtmlText;

  const paragraphs = raw.split(/\n{2,}/);
  const htmlParagraphs = paragraphs.map((para) => {
    let text = escape(para);
    // Mentions BEFORE the generic link regex below -- both match escaped
    // `[...](...)` text, but mentions target `obj://`, links target
    // `https?://`; resolving mentions first means the two can never
    // contend over the same bracketed span.
    text = convertSkoolMentions(text, mentions);
    // Links: [text](url) -- escape() already ran, so match on the escaped form.
    text = text.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2">$1</a>'
    );
    // Bold / italic.
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
    // Single newlines within a paragraph become <br>.
    text = text.replace(/\n/g, "<br>");
    return `<p>${text}</p>`;
  });
  return htmlParagraphs.join("");
}

export interface MappedPost {
  title: string;
  bodyHtml: string;
  category: string | null;
  pinned: boolean;
  createdAtDate: Date;
  updatedAtDate: Date | null;
}

export function mapSkoolPost(
  post: SkoolPost,
  mentions?: SkoolMentionResolver
): MappedPost {
  return {
    title: post.title.trim().slice(0, 300),
    bodyHtml: sanitizeCommunityPostHtml(
      skoolContentToHtml(post.bodyHtml, mentions)
    ),
    category: post.category,
    pinned: post.pinned,
    createdAtDate: new Date(post.createdAtIso),
    updatedAtDate: post.updatedAtIso ? new Date(post.updatedAtIso) : null,
  };
}

export interface MappedComment {
  skoolCommentId: string;
  bodyHtml: string;
  /** Already flattened to Magnetix's 2-level model — null for a top-level
   *  comment, or the top-level ancestor's Magnetix comment id (resolved by
   *  the caller once it knows the created ids) for anything nested deeper. */
  effectiveParentSkoolId: string | null;
  createdAtDate: Date;
}

/**
 * Flattens Skool's arbitrarily-deep comment threading to Magnetix's real
 * 2-level model, mirroring `resolveCommentParentId`'s own behavior
 * (community-feed-service.ts): a reply-to-a-reply attaches to the ORIGINAL
 * top-level comment, never to another reply. Computed in one pass over the
 * whole post's comment list (already in memory from extraction), so no
 * Firestore round-trip is needed the way the live-service version needs one
 * per reply.
 */
export function flattenSkoolCommentsToTwoLevels(
  postId: string,
  comments: SkoolComment[],
  mentions?: SkoolMentionResolver
): MappedComment[] {
  const byId = new Map(comments.map((c) => [c.skoolCommentId, c]));

  function topLevelAncestorId(comment: SkoolComment): string | null {
    if (comment.rawParentId === postId) return null; // already top-level
    // Walk up until we hit a comment whose parent IS the post itself.
    let current = comment;
    const seen = new Set<string>();
    while (current.rawParentId !== postId) {
      if (seen.has(current.skoolCommentId)) break; // cycle guard, shouldn't happen
      seen.add(current.skoolCommentId);
      const parent = byId.get(current.rawParentId);
      if (!parent) return current.rawParentId; // parent not in this batch; best-effort — attach to whatever id we last saw
      current = parent;
    }
    return current.skoolCommentId;
  }

  return comments.map((c) => ({
    skoolCommentId: c.skoolCommentId,
    bodyHtml: sanitizeCommunityCommentHtml(
      skoolContentToHtml(c.bodyHtml, mentions)
    ),
    effectiveParentSkoolId: topLevelAncestorId(c),
    createdAtDate: new Date(c.createdAtIso),
  }));
}

/**
 * Emoji-prefix category label ("🌺 Community Chat") -> {icon, name} for a
 * Magnetix CommunityChannel, matching how Channel.name/icon are already
 * stored separately elsewhere in this codebase.
 *
 * Uses `Intl.Segmenter` grapheme-cluster splitting, NOT a single-codepoint
 * regex — confirmed live why this matters: "🙋🏾‍♀️ Questions" (person
 * raising hand + skin-tone modifier + ZWJ + female sign, 4 real Unicode
 * code points forming ONE visual emoji) fed through a single-codepoint
 * match left the skin-tone/ZWJ/female-sign remainder stuck onto the name
 * ("🏾‍♀️ Questions" instead of "Questions") — caught during the Phase 2
 * controlled-member test, not guessed.
 */
export interface MappedAttachmentsResult {
  attachments: MediaAttachment[];
  /** Skool video URLs deliberately deferred this pass — expiring signed
   *  HLS playlists (stream.video.skool.com), never stored as if they were
   *  permanent Magnetix video references. The caller reports which
   *  post/comment each one belonged to. */
  deferredVideoUrls: string[];
  /** Attachments this importer genuinely cannot represent safely — skipped
   *  EXPLICITLY (surfaced in the report), never silently dropped. Expected
   *  empty in practice: every real "other"-classified Skool attachment this
   *  run turned out to be a voice note or a file Magnetix already supports
   *  (see skool-extract.ts's classifyAttachmentKind) — this stays as an
   *  honest safety net for a genuinely unclassifiable content type, not
   *  dead code. */
  skipped: { url: string; contentType?: string; reason: string }[];
}

function guessImageMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  // Skool's own asset URLs overwhelmingly resolve to this via HEAD sampling;
  // only reached at all if a HEAD request failed (see
  // enrichPostImageAttachments) — an honest fallback, not a claim of fact.
  return "image/jpeg";
}

/**
 * Skool* attachment → real Magnetix `MediaAttachment`. Reuses the EXISTING
 * attachment architecture exactly as-is (no bespoke import-only shape) —
 * see the Gap 1 investigation: rendering (`CommunityImageGrid`) reads
 * `image.url` directly and never touches `storagePath`, and every
 * `storagePath`-consuming code path is a best-effort/fail-silent delete, so
 * an externally-hosted image (never uploaded to Firebase Storage) is safe
 * with `storagePath: ""`.
 */
export function mapSkoolAttachments(
  attachments: SkoolAttachment[],
  authorMemberId: string,
  createdAtMs: number
): MappedAttachmentsResult {
  const out: MediaAttachment[] = [];
  const deferredVideoUrls: string[] = [];
  const skipped: MappedAttachmentsResult["skipped"] = [];

  for (const a of attachments) {
    if (a.kind === "video") {
      deferredVideoUrls.push(a.url);
      continue;
    }
    if (a.kind === "image") {
      out.push({
        kind: "image",
        image: {
          id: crypto.randomUUID(),
          url: a.url,
          storagePath: "",
          mimeType: a.contentType || guessImageMimeType(a.url),
          fileSizeBytes: a.fileSizeBytes ?? 0,
          width: a.width,
          height: a.height,
          authorMemberId,
          createdAt: createdAtMs,
          status: "ready",
        },
      });
      continue;
    }
    if (a.kind === "voice") {
      out.push({
        kind: "voice",
        voice: {
          id: crypto.randomUUID(),
          url: a.url,
          storagePath: "",
          mimeType: a.contentType || "audio/webm",
          // Skool's own attachment metadata never includes playback
          // duration — 0 is an honest "unknown," not a guess. The player
          // resolves the real duration from the audio file itself at
          // playback time regardless of this label.
          durationMs: 0,
          fileSizeBytes: a.fileSizeBytes ?? 0,
          authorMemberId,
          createdAt: createdAtMs,
          status: "ready",
        },
      });
      continue;
    }
    if (a.kind === "file") {
      out.push({
        kind: "file",
        file: {
          id: crypto.randomUUID(),
          url: a.url,
          storagePath: "",
          fileName: a.fileName || "attachment",
          mimeType: a.contentType || "application/octet-stream",
          fileSizeBytes: a.fileSizeBytes ?? 0,
          authorMemberId,
          createdAt: createdAtMs,
          status: "ready",
        },
      });
      continue;
    }
    // kind === "other" — see MappedAttachmentsResult.skipped's comment.
    skipped.push({
      url: a.url,
      contentType: a.contentType,
      reason: "unclassifiable attachment content type",
    });
  }

  return { attachments: out, deferredVideoUrls, skipped };
}

export function splitCategoryLabel(label: string): {
  icon: string;
  name: string;
} {
  const trimmed = label.trim();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const graphemes = [...segmenter.segment(trimmed)].map((s) => s.segment);
  const first = graphemes[0] ?? "";
  const isEmoji = /\p{Extended_Pictographic}/u.test(first);
  if (isEmoji) {
    const rest = graphemes.slice(1).join("").trim();
    if (rest) return { icon: first, name: rest };
  }
  return { icon: "💬", name: trimmed };
}

// ---------------------------------------------------------------------------
// Courses (Skool Course -> Standalone Product mapping — PLANNING only, see
// course-import-plan callers: nothing in this section performs I/O or
// Firestore writes. Every function is reused unmodified by whatever real
// executor comes next, same "one code path, no drift" principle as the
// member/post/comment mapping above.)
// ---------------------------------------------------------------------------

export interface RichTextMappingResult {
  html: string;
  /** Distinct node/mark "type" strings this converter didn't recognize —
   *  their content is safely dropped (children are still walked, so real
   *  text inside an unrecognized wrapper isn't silently lost), never
   *  thrown on. Empty on every real body across all 169 real lessons + 15
   *  real course-level `desc` fields on the source community, confirmed by
   *  running this over all of them: paragraph, heading, orderedList,
   *  unorderedList, listItem, hardBreak, text with bold/italic/link marks —
   *  nothing else appeared. (The first, smaller 5-course sample this
   *  converter was originally written against had only seen unorderedList,
   *  not orderedList/hardBreak — both added after the real full 15-course
   *  run surfaced them, exactly the kind of thing this field exists to
   *  catch instead of silently dropping.) */
  unsupportedTypes: string[];
}

interface RichTextNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichTextNode[];
}

function renderRichTextChildren(
  node: RichTextNode,
  unsupported: Set<string>
): string {
  return (node.content ?? [])
    .map((c) => renderRichTextNode(c, unsupported))
    .join("");
}

function renderRichTextMarks(
  node: RichTextNode,
  unsupported: Set<string>
): string {
  let html = escapeHtmlText(node.text ?? "");
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") html = `<strong>${html}</strong>`;
    else if (mark.type === "italic") html = `<em>${html}</em>`;
    else if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      html = href ? `<a href="${escapeHtmlAttr(href)}">${html}</a>` : html;
    } else {
      unsupported.add(`mark:${mark.type}`);
    }
  }
  return html;
}

function renderRichTextNode(
  node: RichTextNode,
  unsupported: Set<string>
): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderRichTextChildren(node, unsupported)}</p>`;
    case "heading": {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level) || 2));
      return `<h${level}>${renderRichTextChildren(node, unsupported)}</h${level}>`;
    }
    case "unorderedList":
      return `<ul>${renderRichTextChildren(node, unsupported)}</ul>`;
    case "orderedList":
      return `<ol>${renderRichTextChildren(node, unsupported)}</ol>`;
    case "listItem":
      return `<li>${renderRichTextChildren(node, unsupported)}</li>`;
    case "hardBreak":
      return "<br>";
    case "text":
      return renderRichTextMarks(node, unsupported);
    case undefined:
      return "";
    default:
      unsupported.add(node.type);
      // Walk children anyway — an unrecognized wrapper's own tag is
      // dropped, but real text nested inside it must not silently vanish.
      return renderRichTextChildren(node, unsupported);
  }
}

/**
 * Skool's "[v2]" rich-text node array (already parsed by skool-extract.ts,
 * for both course-level `desc` and lesson-level `bodyRichText`) ->
 * sanitizeLessonHtml-compatible HTML. Every node/mark type actually observed
 * across all 15 real courses on the source community — paragraph, heading,
 * text, unorderedList, listItem, and bold/italic/link marks — maps onto a
 * tag `sanitizeLessonHtml` (lesson-html.ts) already allows
 * (p/h1-4/strong/em/a/ul/li), so this output is ready to store as
 * `aboutHtml`/`bodyHtml` as-is; the existing render-time sanitizer is still
 * the real security boundary, unchanged and untouched here.
 */
export function mapSkoolRichTextToHtml(
  nodes: unknown[] | null
): RichTextMappingResult {
  if (!nodes) return { html: "", unsupportedTypes: [] };
  const unsupported = new Set<string>();
  const html = nodes
    .map((n) => renderRichTextNode(n as RichTextNode, unsupported))
    .join("");
  return { html, unsupportedTypes: [...unsupported] };
}

export type LessonVideoPlan =
  | { readiness: "importable"; videoUrl: string; videoProvider: VideoProvider }
  | { readiness: "requires-video-migration"; skoolVideoId: string }
  | { readiness: "unsupported-external-video"; url: string }
  | { readiness: "none" };

/**
 * Confirmed live: every one of the 16 real external-video lessons on the
 * source community was a `youtu.be` link, and `parseVideoUrl` (video-embed.ts
 * — the SAME parser the real lesson editor/player already uses) accepts that
 * format directly, no URL normalization needed. `unsupported-external-video`
 * is a genuine safety net for a link format this run never actually hit, not
 * something observed in real data.
 */
export function planSkoolLessonVideo(video: SkoolLessonVideo): LessonVideoPlan {
  if (video.kind === "none") return { readiness: "none" };
  if (video.kind === "native") {
    return {
      readiness: "requires-video-migration",
      skoolVideoId: video.skoolVideoId,
    };
  }
  const parsed = parseVideoUrl(video.url);
  if (parsed)
    return {
      readiness: "importable",
      videoUrl: video.url,
      videoProvider: parsed.provider,
    };
  return { readiness: "unsupported-external-video", url: video.url };
}

export interface LessonResourcePlan {
  /** Ready to pass straight to updateStandaloneLessonServerSide's
   *  `resourceLinks` patch field, unmodified. */
  resourceLinks: ResourceLink[];
  /** Skool-hosted files — no permanent URL was ever extracted (Skool never
   *  exposed one; only file_id/file_name/content_type), so these can NOT
   *  become a resourceLink yet. A later media-migration step resolves each
   *  by file_id, downloads it, and rehosts it before it can be linked. */
  rehostRequired: {
    title: string;
    fileId: string;
    fileName: string | null;
    contentType: string | null;
  }[];
  /** A resource item matching neither known shape — real count, expected 0
   *  on every real lesson sampled this run (see skool-extract.ts). */
  unrecognizedCount: number;
}

export function planSkoolLessonResources(
  resources: SkoolLessonResource[]
): LessonResourcePlan {
  const resourceLinks: ResourceLink[] = [];
  const rehostRequired: LessonResourcePlan["rehostRequired"] = [];
  let unrecognizedCount = 0;
  for (const r of resources) {
    if (r.kind === "external-link") {
      resourceLinks.push({ label: r.title || r.url, url: r.url });
    } else if (r.kind === "hosted-file") {
      rehostRequired.push({
        title: r.title,
        fileId: r.fileId,
        fileName: r.fileName,
        contentType: r.contentType,
      });
    } else {
      unrecognizedCount += 1;
    }
  }
  return { resourceLinks, rehostRequired, unrecognizedCount };
}

/**
 * assets.skool.com cover/thumbnail URLs were confirmed live (original Skool
 * extraction investigation) to be permanent, unsigned static-asset URLs — no
 * query string at all in every real example, unlike Skool's own genuinely
 * expiring Mux playback tokens. Still checked defensively rather than
 * trusted by hostname alone: any URL carrying what looks like a
 * signing/expiry query param is flagged for rehosting instead of assumed
 * permanent.
 */
function classifyAssetUrl(
  url: string | null
): "direct" | "requires-rehost" | "none" {
  if (!url) return "none";
  if (/[?&](token|signature|expires|exp|X-Amz-)/i.test(url))
    return "requires-rehost";
  return "direct";
}

export interface LessonImportPlan {
  skoolLessonId: string;
  title: string;
  /** Null = a flat/ungrouped lesson directly under the course. */
  sectionSkoolId: string | null;
  /**
   * 0-based position in the EXACT sequence createStandaloneLessonServerSide
   * must be called in for this course to reproduce real source ordering.
   * Real, load-bearing finding: that function assigns `order` from a live
   * COUNT of the course's entire lessons subcollection at call time — one
   * counter shared across every section AND flat lessons, not per-section —
   * so a future executor MUST create lessons in exactly this sequence
   * (never in "each section's lessons, then the next section's" batches
   *  independent of where flat lessons fall) or real relative order
   * between sections and flat lessons is lost.
   */
  createSequence: number;
  bodyHtml: string;
  bodyUnsupportedTypes: string[];
  video: LessonVideoPlan;
  resources: LessonResourcePlan;
  mappingKey: string;
}

function planLesson(
  lesson: SkoolLesson,
  sectionSkoolId: string | null,
  createSequence: number
): LessonImportPlan {
  const body = mapSkoolRichTextToHtml(lesson.bodyRichText);
  return {
    skoolLessonId: lesson.skoolLessonId,
    title: lesson.title,
    sectionSkoolId,
    createSequence,
    bodyHtml: body.html,
    bodyUnsupportedTypes: body.unsupportedTypes,
    video: planSkoolLessonVideo(lesson.video),
    resources: planSkoolLessonResources(lesson.resources),
    mappingKey: mappingKey("standalone_course_lessons", lesson.skoolLessonId),
  };
}

export interface SectionImportPlan {
  skoolSectionId: string;
  title: string;
  /** 0-based position in the sequence createStandaloneSectionServerSide
   *  must be called in — that function also assigns `order` from a live
   *  count, but of the course's `sections` subcollection alone, a separate
   *  counter from lessons'. */
  createSequence: number;
  mappingKey: string;
}

export type CourseReadiness =
  | "ready-for-content-import"
  | "ready-except-media"
  | "needs-manual-access-decision"
  | "blocked";

export interface CourseImportPlan {
  skoolCourseId: string;
  title: string;
  aboutHtml: string;
  aboutUnsupportedTypes: string[];
  coverUrl: string | null;
  coverUrlClassification: "direct" | "requires-rehost" | "none";
  sourcePublished: boolean;
  /** Always "open" — see this function's own doc comment for why a
   *  price/access mapping is never invented from minTier/privacy. */
  plannedAccess: "open";
  /** Always false — see this function's own doc comment. */
  plannedPublished: boolean;
  minTierSourceSignal: number | null;
  privacySourceSignal: number | null;
  linkedCommunityGroupIds: string[];
  sections: SectionImportPlan[];
  /** Every lesson in the course, flattened, in the exact createSequence
   *  order a future executor must use (see LessonImportPlan.createSequence). */
  lessons: LessonImportPlan[];
  /** What createCourseOfferServerSide will produce automatically once the
   *  course itself is created — this plan never creates the Offer, only
   *  documents what the canonical flow already guarantees. */
  expectedOffer: { type: "free"; visibility: "draft" };
  mappingKey: string;
  readiness: CourseReadiness;
  warnings: string[];
}

/**
 * Skool Course -> Standalone Product import PLAN. Pure — no Firestore
 * access, no side effects — so it's exactly what a future executor would
 * call to decide what to create, and exactly what this task's own dry-run
 * calls to report what WOULD happen. Never creates anything itself.
 *
 * Access/publish policy (the two decisions this task explicitly asked not
 * to be assumed):
 *  - `plannedAccess` is ALWAYS "open". Skool's `minTier`/`privacy` gating
 *    can't be safely turned into a real price: no price data exists in the
 *    source at all, and neither field's exact real-world meaning (a genuine
 *    paid tier vs. a non-monetary engagement-level gate — Skool exposes
 *    both concepts, and this run never disambiguated which one `minTier`
 *    is) was independently confirmed. Inventing a price would misrepresent
 *    the source, which this task explicitly ruled out.
 *  - `plannedPublished` is ALWAYS false, regardless of the source course's
 *    own published state. This is a deliberate recommendation, not the
 *    default because no other option was considered: real readiness varies
 *    per course (video migration, PDF rehosting, and the access decision
 *    above are all still open), so no imported course should reach real
 *    members without an explicit human decision. This also matches (and
 *    extends one level up) a safety default the canonical flow ALREADY
 *    enforces on its own: createStandaloneCourseServerSide's companion
 *    Offer always starts `visibility: "draft"` no matter what access/price
 *    the course was given (course-offer-service.ts) — so an imported course
 *    is never actually PURCHASABLE regardless; keeping the course itself
 *    unpublished closes the other half of that gap (an "open"/free course
 *    can still be BROWSED with no Offer involved at all).
 * `linkedCommunityGroupIds` is set at creation time regardless (not held
 * back for the later publish decision) — since the course starts
 * unpublished, linking the Community carries no exposure risk, and it
 * avoids a fragile "remember to run a second step later."
 */
export function planStandaloneCourseImport(
  course: SkoolCourse,
  opts: { targetGroupId: string }
): CourseImportPlan {
  const warnings: string[] = [];
  const about = mapSkoolRichTextToHtml(course.desc);

  const sections: SectionImportPlan[] = [];
  const lessons: LessonImportPlan[] = [];
  let lessonSequence = 0;
  let sectionSequence = 0;

  for (const unit of course.units) {
    if (unit.type === "lesson") {
      lessons.push(planLesson(unit.lesson, null, lessonSequence));
      lessonSequence += 1;
    } else {
      const section = unit.section;
      sections.push({
        skoolSectionId: section.skoolSectionId,
        title: section.title,
        createSequence: sectionSequence,
        mappingKey: mappingKey(
          "standalone_course_sections",
          section.skoolSectionId
        ),
      });
      sectionSequence += 1;
      for (const lesson of section.lessons) {
        lessons.push(
          planLesson(lesson, section.skoolSectionId, lessonSequence)
        );
        lessonSequence += 1;
      }
    }
  }

  const requiresVideoMigration = lessons.some(
    (l) => l.video.readiness === "requires-video-migration"
  );
  const requiresFileRehost = lessons.some(
    (l) => l.resources.rehostRequired.length > 0
  );
  const hasUnsupportedVideo = lessons.some(
    (l) => l.video.readiness === "unsupported-external-video"
  );

  for (const l of lessons) {
    if (l.bodyUnsupportedTypes.length > 0) {
      warnings.push(
        `Lesson ${l.skoolLessonId} ("${l.title}"): body has unsupported rich-text node/mark type(s) ` +
          `${l.bodyUnsupportedTypes.join(", ")} — that content was dropped, review before import.`
      );
    }
    if (l.resources.unrecognizedCount > 0) {
      warnings.push(
        `Lesson ${l.skoolLessonId} ("${l.title}"): ${l.resources.unrecognizedCount} resource(s) matched neither known shape — review before import.`
      );
    }
    if (l.video.readiness === "unsupported-external-video") {
      warnings.push(
        `Lesson ${l.skoolLessonId} ("${l.title}"): external video link did not match any known provider format (${l.video.url}) — review before import.`
      );
    }
  }
  if (about.unsupportedTypes.length > 0) {
    warnings.push(
      `Course ${course.skoolCourseId}: about-text has unsupported rich-text node/mark type(s) ${about.unsupportedTypes.join(", ")}.`
    );
  }
  if (course.minTier !== null) {
    warnings.push(
      `Course ${course.skoolCourseId}: source minTier=${course.minTier} — real gating meaning unconfirmed (paid tier vs. engagement level); needs a manual access decision before publish.`
    );
  }

  let readiness: CourseReadiness;
  if (course.minTier !== null) {
    readiness = "needs-manual-access-decision";
  } else if (
    requiresVideoMigration ||
    requiresFileRehost ||
    hasUnsupportedVideo
  ) {
    readiness = "ready-except-media";
  } else {
    readiness = "ready-for-content-import";
  }

  return {
    skoolCourseId: course.skoolCourseId,
    title: course.title,
    aboutHtml: about.html,
    aboutUnsupportedTypes: about.unsupportedTypes,
    coverUrl: course.coverImageUrl,
    coverUrlClassification: classifyAssetUrl(course.coverImageUrl),
    sourcePublished: course.published,
    plannedAccess: "open",
    plannedPublished: false,
    minTierSourceSignal: course.minTier,
    privacySourceSignal: course.privacy,
    linkedCommunityGroupIds: [opts.targetGroupId],
    sections,
    lessons,
    expectedOffer: { type: "free", visibility: "draft" },
    mappingKey: mappingKey("standalone_courses", course.skoolCourseId),
    readiness,
    warnings,
  };
}
