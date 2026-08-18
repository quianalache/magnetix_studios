import sanitizeHtml from "sanitize-html";
import { lessonBodyToEditorHtml } from "@/lib/community/lesson-html-shared";

export {
  isHtml,
  plainTextToHtml,
  lessonBodyToEditorHtml,
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

const MENTION_SPAN_DATA_TYPES = new Set(["mention", "channelRef"]);

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
    // Harden every surviving link, same convention as sanitizeLessonHtml.
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
      // Only a recognized mention/channelRef data-type, with both id and
      // label present, survives with its attributes — anything else
      // (a stray/malformed/hand-crafted span) loses its attributes but
      // keeps its text, never the whole tag+content removed outright.
      span: (tagName, attribs) => {
        const dataType = attribs["data-type"];
        const ok =
          typeof dataType === "string" &&
          MENTION_SPAN_DATA_TYPES.has(dataType) &&
          typeof attribs["data-id"] === "string" &&
          attribs["data-id"].length > 0 &&
          typeof attribs["data-label"] === "string" &&
          attribs["data-label"].length > 0;
        return ok ? { tagName: "span", attribs } : { tagName: "span", attribs: {} };
      },
    },
  });
}

/** Server-side: stored body (plain text OR real HTML, old or new posts
 *  alike) -> sanitized HTML ready to render via dangerouslySetInnerHTML.
 *  This is the ONE read-path call every Community post surface should use
 *  — see CommunityPostBody. */
export function renderCommunityPostHtml(body: string | null | undefined): string {
  return sanitizeCommunityPostHtml(lessonBodyToEditorHtml(body));
}
