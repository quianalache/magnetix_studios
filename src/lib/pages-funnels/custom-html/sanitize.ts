import sanitizeHtml from "sanitize-html";
import type { CustomHtmlArtifact } from "@/types/pages-funnels-puck";
import { buildCustomHtmlSrcDoc, normalizeCustomHtmlArtifact } from "@/lib/pages-funnels/custom-html/policy";

/**
 * Custom HTML sanitizer (2026-10-26) — shared by the builder canvas (browser)
 * and server rendering (Preview / published pages), so both always render
 * exactly the same safe document. V1 = static HTML + CSS: anything that can
 * run code or escape the frame is removed and COUNTED, so the owner is told
 * in plain language. See policy.ts for the full layered security model —
 * this sanitizer is one layer, the sandboxed frame + CSP are the others.
 *
 * Markup is otherwise kept as written (all ordinary tags, classes, inline
 * styles and SVG), because the goal is to render a design made elsewhere
 * faithfully — not to restrict it to a small allowlist.
 */

export interface CustomHtmlReport {
  scripts: number;
  eventHandlers: number;
  unsafeLinks: number;
  embeds: number;
  other: number;
  forms: number;
  cssRules: number;
}

const emptyReport = (): CustomHtmlReport => ({ scripts: 0, eventHandlers: 0, unsafeLinks: 0, embeds: 0, other: 0, forms: 0, cssRules: 0 });

/** Tags that can run code, load other documents or change how the frame resolves URLs. */
const EMBED_TAGS = new Set(["iframe", "frame", "frameset", "object", "embed", "applet", "portal"]);
const OTHER_BLOCKED_TAGS = new Set(["base", "meta", "noscript", "set"]);
const URL_ATTRS = new Set(["href", "src", "xlink:href", "poster", "background", "cite", "data", "lowsrc", "dynsrc", "longdesc"]);
const STRIPPED_ATTRS = new Set(["srcdoc", "formaction", "action", "http-equiv", "ping", "codebase", "archive"]);
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "sms"]);
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;

/** True when a URL is safe to keep. Relative and #fragment URLs are fine. */
export function isSafeCustomHtmlUrl(raw: string, { allowDataImage = false } = {}): boolean {
  // Browsers ignore control characters and whitespace inside a scheme ("java\tscript:").
  const value = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!value) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (!scheme) return true;
  if (scheme === "data") return allowDataImage && DATA_IMAGE.test(value);
  return SAFE_SCHEMES.has(scheme);
}

function safeSrcset(value: string): boolean {
  return value
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0] ?? "")
    .every((url) => isSafeCustomHtmlUrl(url, { allowDataImage: true }));
}

const UNSAFE_CSS = /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|(?:^|[;{\s])behavior\s*:/gi;

/** Sanitizes CSS text (the CSS field, <style> blocks and style attributes). */
export function sanitizeCustomCss(css: string, report: CustomHtmlReport = emptyReport()): { css: string; report: CustomHtmlReport } {
  // Quoted URLs may contain ";" (e.g. Google Fonts' wght@400;600), so parse
  // the quoted forms as whole strings rather than stopping at the first ";".
  let out = css.replace(
    /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')[^;]*;?/gi,
    (rule, a?: string, b?: string, c?: string, d?: string, e?: string) => {
      const url = a ?? b ?? c ?? d ?? e ?? "";
      if (/^https:\/\//i.test(url)) return rule;
      report.cssRules += 1;
      return "";
    },
  );
  out = out.replace(UNSAFE_CSS, (match) => {
    report.cssRules += 1;
    return match.replace(/[a-z-]+/i, "blocked");
  });
  // Never let CSS close the <style> element it is placed in.
  out = out.replace(/<\/(style)/gi, "<\\/$1");
  return { css: out, report };
}

/** Sanitizes Custom HTML body markup. Never throws. */
export function sanitizeCustomHtml(html: string, report: CustomHtmlReport = emptyReport()): { html: string; report: CustomHtmlReport } {
  const out = sanitizeHtml(html, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    allowedSchemes: ["http", "https", "mailto", "tel", "sms", "data"],
    allowProtocolRelative: false,
    parser: { lowerCaseAttributeNames: false },
    transformTags: {
      "*": (tagName, attribs) => {
        const tag = tagName.toLowerCase();
        const next: Record<string, string> = {};
        for (const [name, value] of Object.entries(attribs)) {
          const key = name.toLowerCase();
          if (key.startsWith("on")) {
            report.eventHandlers += 1;
            continue;
          }
          if (STRIPPED_ATTRS.has(key)) continue;
          if (URL_ATTRS.has(key)) {
            const allowDataImage = (tag === "img" || tag === "image" || tag === "source") && (key === "src" || key === "href" || key === "xlink:href");
            const usesLocalRef = tag === "use" && (key === "href" || key === "xlink:href");
            if (usesLocalRef ? !value.trim().startsWith("#") : !isSafeCustomHtmlUrl(value, { allowDataImage })) {
              report.unsafeLinks += 1;
              continue;
            }
          }
          if (key === "srcset" && !safeSrcset(value)) {
            report.unsafeLinks += 1;
            continue;
          }
          if (key === "style") {
            next[name] = sanitizeCustomCss(value, report).css;
            continue;
          }
          next[name] = value;
        }
        if (tag === "form") report.forms += 1;
        if (tag === "a" && next.href !== undefined && !next.href.trim().startsWith("#")) {
          // Links open the page (or a new tab), never inside the frame.
          if ((next.target ?? "").toLowerCase() === "_blank") next.rel = "noopener noreferrer";
          else next.target = "_top";
        }
        return { tagName, attribs: next };
      },
    },
    exclusiveFilter: (frame) => {
      const tag = frame.tag.toLowerCase();
      if (tag === "script") {
        report.scripts += 1;
        return true;
      }
      if (EMBED_TAGS.has(tag)) {
        report.embeds += 1;
        return true;
      }
      if (OTHER_BLOCKED_TAGS.has(tag)) {
        report.other += 1;
        return true;
      }
      if (/^animate/.test(tag) && /href/i.test(frame.attribs.attributeName ?? frame.attribs.attributename ?? "")) {
        report.other += 1;
        return true;
      }
      if (tag === "link") {
        const isSheet = /(^|\s)stylesheet(\s|$)/i.test(frame.attribs.rel ?? "") && /^https:\/\//i.test(frame.attribs.href ?? "");
        if (!isSheet) report.other += 1;
        return !isSheet;
      }
      return false;
    },
  });
  // <style> blocks inside the markup are raw text the parser passes through,
  // so their CSS gets the same treatment as the CSS field.
  const cleaned = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, body: string, close: string) => open + sanitizeCustomCss(body, report).css + close);
  return { html: cleaned, report };
}

/** Plain-language summary of what was removed or disabled. Empty = nothing to say. */
export function describeCustomHtmlReport(r: CustomHtmlReport): string[] {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const out: string[] = [];
  if (r.scripts) out.push(`Removed ${n(r.scripts, "script", "scripts")} — Custom HTML can't run JavaScript.`);
  if (r.eventHandlers) out.push(`Removed ${n(r.eventHandlers, "click/hover action", "click/hover actions")} (like onclick) — they need JavaScript.`);
  if (r.unsafeLinks) out.push(`Removed ${n(r.unsafeLinks, "unsafe link", "unsafe links")} (only https, mailto, tel and page links are allowed).`);
  if (r.embeds) out.push(`Removed ${n(r.embeds, "embedded frame or plugin", "embedded frames or plugins")} — use the Video block for video.`);
  if (r.other) out.push(`Removed ${n(r.other, "unsupported tag", "unsupported tags")} (such as meta, base or non-stylesheet links).`);
  if (r.cssRules) out.push(`Disabled ${n(r.cssRules, "unsupported CSS rule", "unsupported CSS rules")} (non-https imports or legacy scripted CSS).`);
  if (r.forms) out.push("Forms inside Custom HTML can't submit. Use the Form block to collect leads.");
  return out;
}

/** Sanitizes an artifact and returns the isolated frame document plus the report. */
export function buildSafeCustomHtmlDocument(value: CustomHtmlArtifact | unknown): {
  srcDoc: string;
  isEmpty: boolean;
  report: CustomHtmlReport;
  display: CustomHtmlArtifact["display"];
} {
  const artifact = normalizeCustomHtmlArtifact(value);
  const report = emptyReport();
  const html = sanitizeCustomHtml(artifact.html, report).html;
  const css = sanitizeCustomCss(artifact.css, report).css;
  return {
    srcDoc: buildCustomHtmlSrcDoc(html, css, artifact.display),
    isEmpty: !artifact.html.trim(),
    report,
    display: artifact.display,
  };
}
