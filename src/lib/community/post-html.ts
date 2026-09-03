import sanitizeHtml from "sanitize-html";
import {
  lessonBodyToEditorHtml,
  linkifyBareUrls,
} from "@/lib/community/lesson-html-shared";

export {
  isHtml,
  plainTextToHtml,
  lessonBodyToEditorHtml,
  linkifyBareUrls,
} from "@/lib/community/lesson-html-shared";

/**
 * Community post body sanitization — deliberately a TIGHTER allowlist than
 * `sanitizeLessonHtml` (lesson-html.ts), not a copy of it. Lesson content
 * is staff-authored for their own students; Community posts are
 * member-authored, often for strangers in a shared community — a
 * meaningfully lower trust level. No <iframe>, no <img>, no headings, no
 * code blocks, no div/span/class attributes — only the markup the Phase B
 * text-formatting toolbar can actually produce (bold/italic/underline/
 * strike/lists/blockquote/links). Scripts, event handlers, and unsafe
 * link schemes (e.g. `javascript:`) are always stripped regardless.
 *
 * This module pulls in sanitize-html (a Node HTML parser) — keep it OFF
 * the client import path, same discipline as lesson-html.ts. Client
 * components use the re-exported `lesson-html-shared` helpers above
 * instead (no sanitizer dependency).
 *
 * Phase D adds exactly one more tag — `span` — and ONLY for the two
 * structured node types the shared editor's @ mention / # channel-ref
 * extensions produce (community-mention-extensions.ts). `data-type` is the
 * discriminator; anything else is stripped down to a bare, harmless
 * `<span>` (still allowed, since a member's post text having a genuinely
 * ordinary reason to contain `<span>` is impossible from this editor's own
 * schema — but degrading rather than deleting the tag preserves the
 * member's visible text either way).
 *
 * Comments & Replies (2026-08-19) add `sanitizeCommunityCommentHtml` —
 * deliberately a SEPARATE, TIGHTER allowlist, not a reuse of the post one.
 * Comments intentionally have no formatting toolbar at all (no bold/
 * italic/underline/strike/lists/blockquote — see the CommentComposer
 * report), so a comment body legitimately can never contain those tags;
 * allowing them in the sanitizer would just be dead permission surface,
 * and would silently let a future comment-composer bug (or a hand-crafted
 * request bypassing the client entirely) produce formatted comment HTML
 * the product explicitly doesn't want. `#channelRef` spans are similarly
 * excluded — comments don't offer that mention kind (see
 * COMMENT_MENTION_SPAN_DATA_TYPES below) — so a comment can never carry
 * one even if a request tried to forge it. The actual span-validation
 * TRANSFORM logic is shared (buildSpanTransform) since that part — "only
 * a real, well-formed mention/channelRef span with both id and label
 * survives with attributes, anything else degrades to bare text" — is
 * identical in spirit for both; only which data-type VALUES are
 * acceptable differs per allowlist.
 */

const COMMUNITY_POST_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "span",
];

/** Comments: no formatting marks/nodes at all — just paragraphs/line
 *  breaks, links, and mention spans (never channelRef — see above). */
const COMMUNITY_COMMENT_ALLOWED_TAGS = ["p", "br", "a", "span"];

const POST_MENTION_SPAN_DATA_TYPES = new Set(["mention", "channelRef"]);
const COMMENT_MENTION_SPAN_DATA_TYPES = new Set(["mention"]);

function linkTransform() {
  return (tagName: string, attribs: Record<string, string>) => ({
    tagName: "a",
    attribs: {
      ...attribs,
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    },
  });
}

/** Only a recognized data-type (from `allowedDataTypes`), with both id and
 *  label present, survives with its attributes — anything else (a stray/
 *  malformed/hand-crafted span, or a data-type this content kind doesn't
 *  offer — e.g. channelRef inside a comment) loses its attributes but
 *  keeps its text, never the whole tag+content removed outright. */
function spanTransform(allowedDataTypes: Set<string>) {
  return (tagName: string, attribs: Record<string, string>) => {
    const dataType = attribs["data-type"];
    const ok =
      typeof dataType === "string" &&
      allowedDataTypes.has(dataType) &&
      typeof attribs["data-id"] === "string" &&
      attribs["data-id"].length > 0 &&
      typeof attribs["data-label"] === "string" &&
      attribs["data-label"].length > 0;
    return ok ? { tagName: "span", attribs } : { tagName: "span", attribs: {} };
  };
}

/** Sanitize a Community post body for rendering (or before storing, as
 *  defense-in-depth on write). Server-side only. */
export function sanitizeCommunityPostHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: COMMUNITY_POST_ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["data-type", "data-id", "data-label"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: linkTransform(),
      span: spanTransform(POST_MENTION_SPAN_DATA_TYPES),
    },
  });
}

/** Sanitize a Community COMMENT/reply body — see the module comment for
 *  why this is a distinct, tighter allowlist rather than a reuse of
 *  `sanitizeCommunityPostHtml`. */
export function sanitizeCommunityCommentHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: COMMUNITY_COMMENT_ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["data-type", "data-id", "data-label"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: linkTransform(),
      span: spanTransform(COMMENT_MENTION_SPAN_DATA_TYPES),
    },
  });
}

/** Server-side: stored body (plain text OR real HTML, old or new posts
 *  alike) -> sanitized HTML ready to render via dangerouslySetInnerHTML.
 *  This is the ONE read-path call every Community post surface should use
 *  — see CommunityPostBody. */
export function renderCommunityPostHtml(
  body: string | null | undefined
): string {
  return linkifyBareUrls(
    sanitizeCommunityPostHtml(lessonBodyToEditorHtml(body))
  );
}

/** Same read-path contract as `renderCommunityPostHtml`, for comments —
 *  every existing plain-text comment (written before this feature existed)
 *  is still a fully valid comment body: `lessonBodyToEditorHtml` promotes
 *  plain text to a single `<p>` exactly as it already does for legacy
 *  post bodies, so no migration is required to render old comments. */
export function renderCommunityCommentHtml(
  body: string | null | undefined
): string {
  return linkifyBareUrls(
    sanitizeCommunityCommentHtml(lessonBodyToEditorHtml(body))
  );
}
