import "server-only";

import crypto from "node:crypto";
import { sanitizeCommunityCommentHtml, sanitizeCommunityPostHtml } from "@/lib/community/post-html";
import type { MediaAttachment } from "@/types/media-attachment";
import type { SkoolAttachment, SkoolComment, SkoolPost } from "./types";

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
export type SkoolMentionResolver = Map<string, { memberId: string; displayName: string }>;

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
export function convertSkoolMentions(text: string, mentions?: SkoolMentionResolver): string {
  return text.replace(/\[([^\]]*)\]\(obj:\/\/([^)]*)\)/g, (_full, label: string, objPath: string) => {
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
  });
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
export function skoolContentToHtml(raw: string, mentions?: SkoolMentionResolver): string {
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
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
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

export function mapSkoolPost(post: SkoolPost, mentions?: SkoolMentionResolver): MappedPost {
  return {
    title: post.title.trim().slice(0, 300),
    bodyHtml: sanitizeCommunityPostHtml(skoolContentToHtml(post.bodyHtml, mentions)),
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
  mentions?: SkoolMentionResolver,
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
    bodyHtml: sanitizeCommunityCommentHtml(skoolContentToHtml(c.bodyHtml, mentions)),
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
  createdAtMs: number,
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
    skipped.push({ url: a.url, contentType: a.contentType, reason: "unclassifiable attachment content type" });
  }

  return { attachments: out, deferredVideoUrls, skipped };
}

export function splitCategoryLabel(label: string): { icon: string; name: string } {
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
