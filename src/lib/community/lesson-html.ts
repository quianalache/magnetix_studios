import sanitizeHtml from "sanitize-html";
import { lessonBodyToEditorHtml } from "./lesson-html-shared";

export {
  isHtml,
  plainTextToHtml,
  lessonBodyToEditorHtml,
} from "./lesson-html-shared";

/**
 * Lesson body sanitization (server-side render path).
 *
 * Lesson bodies are authored in a TipTap rich-text editor by sub-account staff
 * and rendered to community members. Author and viewer can belong to different
 * tenants, so the body is ALWAYS sanitized at render time (server-side, in the
 * public lesson page) before it reaches a member's browser. TipTap only emits
 * its own schema, but sanitization is the hard security boundary — never trust
 * stored HTML on the way out.
 *
 * Allowed: standard formatting + headings + lists + blockquote + code/pre +
 * <img> + <a> + <iframe>. Any `https://` iframe src survives (the inline
 * `lesson-video`/`lesson-embed` nodes) — course staff author this content for
 * their own students, same trust model as any course platform's "embed code"
 * feature, so there's no third-party-host allowlist to maintain. Scripts,
 * event handlers, and every attribute not explicitly listed below (including
 * `srcdoc`, which would otherwise let an iframe inline its own script) are
 * always stripped — that's the actual security boundary here, not the host.
 *
 * This module pulls in sanitize-html (a Node HTML parser) — keep it OFF the
 * client import path. Client components use ./lesson-html-shared instead.
 */

/** Sanitize lesson HTML for rendering to members. Server-side (no DOM). */
export function sanitizeLessonHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "em", "u", "s", "del", "code", "pre",
      "blockquote", "h1", "h2", "h3", "h4", "ul", "ol", "li",
      "a", "img", "hr", "iframe", "div", "span", "figure",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "class"],
      iframe: ["src", "allow", "allowfullscreen", "frameborder"],
      div: ["class", "data-provider", "data-id", "data-src"],
      span: ["class"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"], iframe: ["https"] },
    // Harden every surviving link.
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
  });
}

/** Server-side: stored body → sanitized HTML ready to render in the player. */
export function renderLessonBodyHtml(body: string | null | undefined): string {
  return sanitizeLessonHtml(lessonBodyToEditorHtml(body));
}
