import type { CustomHtmlArtifact } from "@/types/pages-funnels-puck";
import {
  CUSTOM_HTML_ARTIFACT_VERSION,
  DEFAULT_CUSTOM_HTML_FIXED_HEIGHT,
  customHtmlLimitProblems,
  normalizePastedHtml,
} from "@/lib/pages-funnels/custom-html/policy";
import { describeCustomHtmlReport, sanitizeCustomCss, sanitizeCustomHtml } from "@/lib/pages-funnels/custom-html/sanitize";

/**
 * Import HTML (2026-11-20) — turns a full page made elsewhere (Claude or any
 * AI site generator, pasted or from an .html file) into ONE Custom HTML
 * block artifact, through the exact pipeline the block's own paste uses:
 * normalizePastedHtml → sanitizeCustomHtml → sanitizeCustomCss. Rendering,
 * isolation (sandboxed opaque-origin frame + CSP), publishing, versions,
 * templates and funnels are the existing Custom HTML block's — nothing new.
 *
 * It also finds what a single pasted file CAN'T carry: images, stylesheets,
 * fonts or scripts referenced by a relative path ("images/hero.png",
 * "styles.css") exist only next to the original file, and plain-http assets
 * are blocked by the frame's HTTPS-only policy. Those are reported, never
 * silently published as a broken page.
 */

export interface HtmlImportAnalysis {
  artifact: CustomHtmlArtifact;
  /** What was converted or removed (plain language). */
  notes: string[];
  /** Files the page refers to that weren't included (relative paths / http). */
  missingFiles: string[];
  /** Links to other pages of the original site ("about.html") — they won't resolve here. */
  siteLinks: string[];
  /** Blocking problems (empty input, too large). */
  problems: string[];
}

export const HTML_IMPORT_MAX_FILE_BYTES = 600_000;

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const isRelativeRef = (v: string) => {
  const t = v.trim();
  return !!t && !t.startsWith("#") && !ABSOLUTE.test(t) && !t.startsWith("data:");
};
const isPlainHttp = (v: string) => /^http:\/\//i.test(v.trim());

function attrValues(html: string, tag: string, attr: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*?\\s${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

function cssUrls(text: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[2]);
  const imp = /@import\s+(['"])([^'"]+)\1/gi;
  while ((m = imp.exec(text))) out.push(m[2]);
  return out;
}

/** Relative / insecure references in the ORIGINAL text (before normalization drops some of them). */
export function findMissingReferences(original: string): { missingFiles: string[]; siteLinks: string[] } {
  const files = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (isRelativeRef(t) || isPlainHttp(t)) files.add(t.length > 120 ? `${t.slice(0, 117)}…` : t);
  };
  for (const v of attrValues(original, "img", "src")) add(v);
  for (const v of attrValues(original, "source", "src")) add(v);
  for (const v of attrValues(original, "video", "src")) add(v);
  for (const v of attrValues(original, "video", "poster")) add(v);
  for (const v of attrValues(original, "audio", "src")) add(v);
  for (const v of attrValues(original, "script", "src")) add(v);
  for (const tag of original.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?[^"'>]*\b(stylesheet|preload|icon)\b/i.test(tag)) continue;
    const href = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (href) add(href[2] ?? href[3] ?? href[4] ?? "");
  }
  for (const v of [...attrValues(original, "img", "srcset"), ...attrValues(original, "source", "srcset")]) {
    for (const part of v.split(",")) add(part.trim().split(/\s+/)[0] ?? "");
  }
  const cssText = [...(original.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? []), ...attrValues(original, "[a-z0-9]+", "style")].join("\n");
  for (const v of cssUrls(cssText)) add(v);

  const links = new Set<string>();
  for (const v of attrValues(original, "a", "href")) {
    const t = v.trim();
    if (isRelativeRef(t) && !/^(mailto|tel|sms):/i.test(t)) links.add(t.length > 80 ? `${t.slice(0, 77)}…` : t);
  }
  return { missingFiles: [...files].slice(0, 25), siteLinks: [...links].slice(0, 25) };
}

/** Analyze a pasted / uploaded HTML page and build the block artifact. Pure; runs in the browser and on the server. */
export function analyzeHtmlImport(input: string): HtmlImportAnalysis {
  const text = typeof input === "string" ? input : "";
  const problems: string[] = [];
  if (!text.trim()) problems.push("Paste the page's HTML or choose an .html file.");
  else if (!/<[a-z][\s\S]*>/i.test(text)) problems.push("That doesn't look like HTML. Paste the page's full HTML code.");
  // A page with JavaScript keeps its code as written and runs in the block's
  // isolated frame ("Run JavaScript" mode — see custom-html/policy.ts).
  if (/<script\b/i.test(text)) {
    const artifact: CustomHtmlArtifact = {
      artifactVersion: CUSTOM_HTML_ARTIFACT_VERSION,
      html: text,
      css: "",
      display: { height: "auto", fixedHeight: DEFAULT_CUSTOM_HTML_FIXED_HEIGHT, overflow: "scroll" },
      source: { kind: /<!doctype\s|<html[\s>]|<body[\s>]/i.test(text) ? "pasted-document" : "pasted-fragment" },
      scripts: true,
    };
    problems.push(...customHtmlLimitProblems(artifact));
    const { missingFiles, siteLinks } = findMissingReferences(text);
    return {
      artifact,
      notes: ["Interactive: this page's scripts are kept and run in an isolated, sandboxed frame that can't reach your Magnetix account, make network calls or submit forms."],
      missingFiles,
      siteLinks,
      problems,
    };
  }
  const normalized = normalizePastedHtml(text);
  const { html, report } = sanitizeCustomHtml(normalized.html);
  const css = sanitizeCustomCss(normalized.css, report).css;
  const artifact: CustomHtmlArtifact = {
    artifactVersion: CUSTOM_HTML_ARTIFACT_VERSION,
    html,
    css,
    // Auto height: the frame grows to the page's real height, so the imported
    // page scrolls with the browser like any page.
    display: { height: "auto", fixedHeight: DEFAULT_CUSTOM_HTML_FIXED_HEIGHT, overflow: "scroll" },
    source: { kind: normalized.kind },
  };
  if (text.trim() && !html.trim()) problems.push("Nothing visible was left after removing unsupported content. Check that the HTML includes the page's body.");
  problems.push(...customHtmlLimitProblems(artifact));
  const { missingFiles, siteLinks } = findMissingReferences(text);
  return { artifact, notes: [...normalized.notes, ...describeCustomHtmlReport(report)], missingFiles, siteLinks, problems };
}
