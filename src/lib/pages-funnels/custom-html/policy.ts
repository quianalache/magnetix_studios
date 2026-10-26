import type { CustomHtmlArtifact } from "@/types/pages-funnels-puck";

/**
 * Custom HTML block — the pure, dependency-free half of the contract
 * (2026-10-26). Shared by the builder (browser), the server renderer and the
 * draft/publish limit check. Sanitizing lives in `sanitize.ts` (it needs
 * `sanitize-html`); everything here is plain string work.
 *
 * SECURITY MODEL (V1 = static HTML + CSS, no customer JavaScript):
 *   1. The block always renders inside a sandboxed <iframe srcdoc> WITHOUT
 *      `allow-same-origin`, so the content runs in an opaque origin: it
 *      cannot read Magnetix cookies, storage, the session or the parent DOM,
 *      and its CSS cannot reach the page (nor page CSS reach it).
 *   2. A Content-Security-Policy inside the document allows only ONE script —
 *      our own height-measuring snippet, pinned by its SHA-256 hash — plus
 *      HTTPS (and data:) images/fonts/stylesheets. No network calls, frames,
 *      plugins, <base> or form submission.
 *   3. `sanitize.ts` removes scripts, inline event handlers, javascript:
 *      URLs, frames/objects and other active content BEFORE it reaches the
 *      document, and reports what it removed so the owner is told.
 * Any one layer failing still leaves the others.
 */

export const CUSTOM_HTML_COMPONENT = "CustomHtml";
export const CUSTOM_HTML_ARTIFACT_VERSION = 1 as const;

/** Generous enough for a full AI-generated landing page section set. */
export const CUSTOM_HTML_LIMITS = {
  htmlBytes: 250_000,
  cssBytes: 150_000,
  blocksPerPage: 25,
  fixedHeightMin: 40,
  fixedHeightMax: 6000,
  /** Auto height never grows a frame past this (runaway layouts). */
  autoHeightMax: 20_000,
} as const;

export const DEFAULT_CUSTOM_HTML_FIXED_HEIGHT = 480;
/** First paint height before the frame reports its real height. */
export const CUSTOM_HTML_INITIAL_AUTO_HEIGHT = 160;
/** Auto height: `vh` units are measured against this "screen" height (see `freezeViewportUnits`). */
export const CUSTOM_HTML_AUTO_VIEWPORT_PX = 800;

export const HEIGHT_MESSAGE_TYPE = "mx-custom-html-height";

export function emptyCustomHtmlArtifact(): CustomHtmlArtifact {
  return {
    artifactVersion: CUSTOM_HTML_ARTIFACT_VERSION,
    html: "",
    css: "",
    display: { height: "auto", fixedHeight: DEFAULT_CUSTOM_HTML_FIXED_HEIGHT, overflow: "scroll" },
  };
}

/** Coerces any stored/incoming value into a well-formed artifact (never throws). */
export function normalizeCustomHtmlArtifact(value: unknown): CustomHtmlArtifact {
  const base = emptyCustomHtmlArtifact();
  if (!value || typeof value !== "object") return base;
  const v = value as Partial<CustomHtmlArtifact>;
  const d = (v.display ?? {}) as Partial<CustomHtmlArtifact["display"]>;
  const fixed = Number(d.fixedHeight);
  const kind = v.source?.kind;
  return {
    artifactVersion: CUSTOM_HTML_ARTIFACT_VERSION,
    html: typeof v.html === "string" ? v.html : "",
    css: typeof v.css === "string" ? v.css : "",
    display: {
      height: d.height === "fixed" ? "fixed" : "auto",
      fixedHeight: Number.isFinite(fixed)
        ? Math.min(CUSTOM_HTML_LIMITS.fixedHeightMax, Math.max(CUSTOM_HTML_LIMITS.fixedHeightMin, Math.round(fixed)))
        : DEFAULT_CUSTOM_HTML_FIXED_HEIGHT,
      overflow: d.overflow === "clip" ? "clip" : "scroll",
    },
    ...(kind === "pasted-document" || kind === "pasted-fragment" || kind === "typed" ? { source: { kind } } : {}),
  };
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Customer-readable limit problems for one artifact (empty = fine). */
export function customHtmlLimitProblems(artifact: CustomHtmlArtifact): string[] {
  const problems: string[] = [];
  const kb = (n: number) => `${Math.round(n / 1000)} KB`;
  const html = utf8Bytes(artifact.html);
  const css = utf8Bytes(artifact.css);
  if (html > CUSTOM_HTML_LIMITS.htmlBytes) problems.push(`The HTML is ${kb(html)}; the limit is ${kb(CUSTOM_HTML_LIMITS.htmlBytes)}.`);
  if (css > CUSTOM_HTML_LIMITS.cssBytes) problems.push(`The CSS is ${kb(css)}; the limit is ${kb(CUSTOM_HTML_LIMITS.cssBytes)}.`);
  return problems;
}

/** Walks Puck data (content + every slot) and checks Custom HTML limits — used on Save Draft and Publish. */
export function findCustomHtmlLimitProblem(data: unknown): string | null {
  let count = 0;
  let problem: string | null = null;
  const visit = (node: unknown) => {
    if (problem || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const n = node as { type?: unknown; props?: Record<string, unknown> };
    if (n.type === CUSTOM_HTML_COMPONENT) {
      count += 1;
      if (count > CUSTOM_HTML_LIMITS.blocksPerPage) {
        problem = `A page can hold up to ${CUSTOM_HTML_LIMITS.blocksPerPage} Custom HTML blocks.`;
        return;
      }
      const issues = customHtmlLimitProblems(normalizeCustomHtmlArtifact(n.props?.content));
      if (issues.length) {
        problem = `A Custom HTML block is too large. ${issues.join(" ")}`;
        return;
      }
    }
    for (const value of Object.values(n.props ?? {})) if (Array.isArray(value)) value.forEach(visit);
  };
  const d = data as { content?: unknown; zones?: Record<string, unknown> } | null;
  visit(d?.content);
  if (d?.zones) Object.values(d.zones).forEach(visit);
  return problem;
}

/**
 * The ONLY script allowed in a Custom HTML frame: reports the content's
 * height to the parent so "Auto" height can size the frame. Static text —
 * its SHA-256 is pinned in the CSP below (MEASURE_SCRIPT_SHA256, verified by
 * scripts/check-custom-html.ts), so changing it requires updating the hash.
 */
export const MEASURE_SCRIPT =
  '(function(){var r=document.getElementById("mx-custom-html-root");if(!r)return;var last=-1;function send(){var h=Math.ceil(r.getBoundingClientRect().height);if(h!==last){last=h;parent.postMessage({type:"mx-custom-html-height",height:h},"*");}}if(window.ResizeObserver){new ResizeObserver(send).observe(r);}window.addEventListener("load",send);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(send);}send();})();';
export const MEASURE_SCRIPT_SHA256 = "sha256-5E//R0yCy3eMyimVSq1qkY45hHWYfE1IWTDe8pxlQPI=";

export const CUSTOM_HTML_CSP = [
  "default-src 'none'",
  `script-src '${MEASURE_SCRIPT_SHA256}'`,
  "style-src 'unsafe-inline' https:",
  "img-src https: data:",
  "font-src https: data:",
  "media-src https:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Sandbox tokens: no allow-same-origin and no allow-forms, ever. Editing = inert links. */
export function customHtmlSandbox(mode: "editing" | "visitor"): string {
  return mode === "editing"
    ? "allow-scripts"
    : "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation";
}

const VIEWPORT_UNIT = /(-?\d*\.?\d+)(?:d|s|l)?vh\b/gi;

/**
 * Auto height sizes the frame to its content, so `vh` inside the frame would
 * chase its own size (a 100vh hero grows the frame, which grows the hero…).
 * In auto mode `vh` is measured against a fixed screen height instead. Only
 * CSS text (stylesheet + inline `style` attributes + <style> blocks) is
 * touched — never visible text — and only at render time; stored code is
 * unchanged.
 */
export function freezeViewportUnits(css: string): string {
  return css.replace(VIEWPORT_UNIT, (_m, n: string) => `${(Number(n) * CUSTOM_HTML_AUTO_VIEWPORT_PX) / 100}px`);
}
function freezeViewportUnitsInHtml(html: string): string {
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, body: string, close: string) => open + freezeViewportUnits(body) + close)
    .replace(/(\sstyle=")([^"]*)(")/gi, (_m, open: string, body: string, close: string) => open + freezeViewportUnits(body) + close);
}

/** Builds the isolated frame document from ALREADY-SANITIZED html/css. */
export function buildCustomHtmlSrcDoc(html: string, css: string, display: CustomHtmlArtifact["display"]): string {
  const auto = display.height === "auto";
  const bodyOverflow = auto ? "hidden" : display.overflow === "clip" ? "hidden" : "auto";
  const frameCss = auto ? freezeViewportUnits(css) : css;
  const frameHtml = auto ? freezeViewportUnitsInHtml(html) : html;
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<meta http-equiv="Content-Security-Policy" content="${CUSTOM_HTML_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>html,body{margin:0;padding:0}html{overflow:${bodyOverflow}}body{overflow-x:hidden}#mx-custom-html-root{display:flow-root}img,video,svg{max-width:100%}</style>`,
    `<style>${frameCss}</style>`,
    `</head><body><div id="mx-custom-html-root">${frameHtml}</div>`,
    `<script>${MEASURE_SCRIPT}</script>`,
    "</body></html>",
  ].join("");
}

export interface PasteNormalization {
  html: string;
  /** CSS pulled out of <style> blocks and stylesheet <link>s, to append to the CSS field. */
  css: string;
  kind: "pasted-document" | "pasted-fragment";
  /** Plain-language notes about what was moved. */
  notes: string[];
}

/**
 * Splits a pasted full HTML document (e.g. from Claude) into body markup +
 * CSS: <style> blocks and HTTPS stylesheet links move to CSS (links become
 * `@import`), the document wrapper (doctype/html/head/body/title/meta) is
 * dropped. A plain fragment passes through untouched. Scripts and other
 * unsupported content are removed by the sanitizer, not here.
 */
export function normalizePastedHtml(input: string): PasteNormalization {
  const text = input.trim();
  const looksLikeDocument = /<!doctype\s|<html[\s>]|<head[\s>]|<body[\s>]/i.test(text);
  const cssParts: string[] = [];
  const notes: string[] = [];
  let styleCount = 0;
  let linkCount = 0;

  const bodyMatch = /<body\b[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(text);
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(text);
  let html = bodyMatch ? bodyMatch[1] : text;
  const headAndBody = headMatch && bodyMatch ? [headMatch[1], html] : [html];

  const collect = (segment: string): string =>
    segment
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, body: string) => {
        styleCount += 1;
        cssParts.push(body.trim());
        return "";
      })
      .replace(/<link\b[^>]*>/gi, (tag) => {
        if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return "";
        const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
        if (href && /^https:\/\//i.test(href)) {
          linkCount += 1;
          cssParts.unshift(`@import url("${href.replace(/"/g, "%22")}");`);
        }
        return "";
      });

  if (headAndBody.length === 2) {
    collect(headAndBody[0]);
    html = collect(headAndBody[1]);
  } else if (looksLikeDocument || /<style\b|<link\b/i.test(html)) {
    html = collect(html);
  }
  if (looksLikeDocument) {
    html = html
      .replace(/<!doctype[^>]*>/gi, "")
      .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
      .replace(/<meta\b[^>]*>/gi, "");
    notes.push("Pasted a full page — kept the page content and dropped the document wrapper.");
  }
  if (styleCount) notes.push(`Moved ${styleCount} <style> block${styleCount === 1 ? "" : "s"} into CSS.`);
  if (linkCount) notes.push(`Moved ${linkCount} stylesheet link${linkCount === 1 ? "" : "s"} into CSS as @import.`);
  return {
    html: html.trim(),
    css: cssParts.join("\n\n").trim(),
    kind: looksLikeDocument ? "pasted-document" : "pasted-fragment",
    notes,
  };
}
