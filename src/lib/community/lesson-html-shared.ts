/**
 * Client-safe lesson-body helpers — NO sanitizer dependency, so importing this
 * from a client component (the rich-text editor) never pulls DOMPurify/jsdom
 * into the browser bundle. The sanitizing render path lives in lesson-html.ts.
 *
 * Legacy bodies created before rich text were stored as PLAIN TEXT in the same
 * `bodyHtml` field; {@link lessonBodyToEditorHtml} upgrades those to paragraphs
 * so newlines survive.
 */

/** True when the string already contains HTML markup (vs. legacy plain text). */
export function isHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert legacy plain-text bodies into paragraph HTML (preserving newlines). */
export function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Normalize a stored body into editor-ready HTML — passes real HTML through and
 * upgrades legacy plain text to paragraphs. NOT sanitized (the editor is staff
 * authoring their own content); the player sanitizes on render.
 */
export function lessonBodyToEditorHtml(
  body: string | null | undefined
): string {
  const s = (body ?? "").trim();
  if (!s) return "";
  return isHtml(s) ? s : plainTextToHtml(s);
}

/**
 * Auto-links bare URLs left as plain text (2026-09-03, Community
 * Interaction + Live UX Polish) — see post-html.ts's `renderCommunityPostHtml`/
 * `renderCommunityCommentHtml` for the full rationale (Tiptap's own
 * autolink only covers content that actually passed through its editor;
 * Live chat's plain `<input>` and legacy plain-text bodies never did).
 * Lives here, not in post-html.ts, purely so the Live room's client
 * component can share this EXACT function for its own optimistic
 * just-sent-message echo without pulling the Node-only `sanitize-html`
 * package into the client bundle — no second regex anywhere.
 *
 * Walks the input alternating tag/text (a tag can never contain a
 * literal '<', and by the time this runs on server-rendered output
 * neither can a text node — sanitize-html always entity-encodes one, and
 * the client-side caller only ever feeds it text it already hand-escaped
 * itself, same convention), skips anything already inside a real `<a>`
 * (never double-wraps or nests anchors), and never touches the inside of
 * any other tag (attributes only ever occur in the tag half of the
 * split, which this never rewrites).
 */
export function linkifyBareUrls(html: string): string {
  const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  let anchorDepth = 0;
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (/^<a\b/i.test(part)) {
        anchorDepth++;
        return part;
      }
      if (/^<\/a>/i.test(part)) {
        anchorDepth = Math.max(0, anchorDepth - 1);
        return part;
      }
      // Any other tag, or plain text already inside an <a>...</a> — leave
      // untouched either way.
      if (part.startsWith("<") || anchorDepth > 0) return part;
      return part.replace(URL_RE, (match) => {
        let url = match;
        let trailing = "";
        // Sentence punctuation right after a URL ("check example.com.")
        // almost always belongs to the sentence, not the link.
        const punctuation = /([.,!?;:]+)$/.exec(url);
        if (punctuation) {
          url = url.slice(0, -punctuation[0].length);
          trailing = punctuation[0];
        }
        // A trailing ')' with no '(' earlier in the match is closing
        // surrounding prose ("(see example.com)"), not part of the URL.
        if (url.endsWith(")") && !url.includes("(")) {
          url = url.slice(0, -1);
          trailing = ")" + trailing;
        }
        if (!url) return match;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${trailing}`;
      });
    })
    .join("");
}
