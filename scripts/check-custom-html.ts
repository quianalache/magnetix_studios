/**
 * Custom HTML block — offline contract + security checks (2026-10-26).
 * No server, no Firebase.
 *
 * Run: pnpm exec tsx scripts/check-custom-html.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CUSTOM_HTML_CSP,
  CUSTOM_HTML_LIMITS,
  MEASURE_SCRIPT,
  MEASURE_SCRIPT_SHA256,
  buildCustomHtmlSrcDoc,
  customHtmlSandbox,
  emptyCustomHtmlArtifact,
  findCustomHtmlLimitProblem,
  freezeViewportUnits,
  normalizeCustomHtmlArtifact,
  normalizePastedHtml,
} from "../src/lib/pages-funnels/custom-html/policy";
import {
  buildSafeCustomHtmlDocument,
  describeCustomHtmlReport,
  isSafeCustomHtmlUrl,
  sanitizeCustomCss,
  sanitizeCustomHtml,
} from "../src/lib/pages-funnels/custom-html/sanitize";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
const src = (f: string) => readFileSync(f, "utf8");
const clean = (html: string) => sanitizeCustomHtml(html).html;

// ── Frame isolation ──────────────────────────────────────────────────────
for (const mode of ["editing", "visitor"] as const) {
  const sb = customHtmlSandbox(mode);
  check(`sandbox (${mode}) never grants same-origin or forms`, !/allow-same-origin|allow-forms|allow-modals|allow-downloads/.test(sb), sb);
}
check("editing sandbox makes links inert", !/allow-top-navigation|allow-popups/.test(customHtmlSandbox("editing")));
check("CSP pins the measuring script by its real hash",
  `sha256-${createHash("sha256").update(MEASURE_SCRIPT, "utf8").digest("base64")}` === MEASURE_SCRIPT_SHA256);
check("CSP: no network calls, frames, plugins, base or form submission",
  ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].every((d) => CUSTOM_HTML_CSP.includes(d)));
check("CSP: no 'unsafe-inline' or 'unsafe-eval' scripts", !/script-src[^;]*unsafe/.test(CUSTOM_HTML_CSP));
const doc = buildCustomHtmlSrcDoc("<p>Hi</p>", ".a{}", emptyCustomHtmlArtifact().display);
check("frame document carries the CSP, the content root and exactly one script",
  doc.includes(CUSTOM_HTML_CSP) && doc.includes('id="mx-custom-html-root"') && (doc.match(/<script>/g) ?? []).length === 1);

// ── HTML sanitizing ──────────────────────────────────────────────────────
const attacks: [string, string, RegExp][] = [
  ["script tag", `<p>a</p><script>alert(1)</script>`, /<script/i],
  ["uppercase script", `<SCRIPT>alert(1)</SCRIPT>`, /script/i],
  ["inline event handler", `<div onclick="alert(1)" onMouseOver="x()">a</div>`, /\son\w+=/i],
  ["javascript: link", `<a href="javascript:alert(1)">x</a>`, /javascript/i],
  ["obfuscated javascript: link", `<a href="JaVa\tScRiPt:alert(1)">x</a><a href="&#106;avascript:alert(1)">y</a>`, /href=/i],
  ["vbscript/data html link", `<a href="vbscript:x">a</a><a href="data:text/html,<b>">b</a>`, /href=/i],
  ["iframe/object/embed", `<iframe src="https://x"></iframe><object data="x"></object><embed src="x">`, /<(iframe|object|embed)/i],
  ["meta refresh / base", `<meta http-equiv="refresh" content="0;url=https://x"><base href="https://evil/">`, /<(meta|base)/i],
  ["svg script + handler", `<svg onload="x()"><script>alert(1)</script><a xlink:href="javascript:x">s</a></svg>`, /script|onload|javascript/i],
  ["svg animate href", `<svg><a><animate attributeName="href" values="javascript:alert(1)"/>x</a><set attributeName="href" to="javascript:x"/></svg>`, /<(animate|set)/i],
  ["external svg <use>", `<svg><use href="https://evil/x.svg#a"/></svg>`, /href=/i],
  ["srcdoc / formaction", `<div srcdoc="<script>x</script>"></div><button formaction="https://e">b</button>`, /srcdoc|formaction/i],
  ["non-image data src", `<img src="data:text/html;base64,PHNjcmlwdD4=">`, /src=/i],
  ["unsafe srcset entry", `<img src="https://a/x.png" srcset="https://a/1.png 1x, javascript:alert(1) 2x">`, /srcset/i],
  ["inline style expression", `<p style="width:expression(alert(1))">x</p>`, /expression\s*\(/i],
];
for (const [label, input, bad] of attacks) {
  const out = clean(input);
  check(`blocks ${label}`, !bad.test(out), out);
}
check("form submission is disabled (action/method target removed)", !/action=/.test(clean(`<form action="https://evil" method="post"><input></form>`)));
check("<style> CSS inside markup is sanitized too", !/javascript\s*:/i.test(clean(`<style>.a{background:url(javascript:alert(1))}</style>`)));
check("CSS can't close its <style> element", !/<\/style/i.test(sanitizeCustomCss(".a{} </style><script>x</script>").css));
check("Google Fonts @import with ';' in the URL is kept intact (not corrupted)", (() => {
  const input = `@import url("https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;600&display=swap");\n.a{color:red}`;
  const r = sanitizeCustomCss(input);
  return r.css === input && r.report.cssRules === 0;
})());
check("unquoted, single-quoted and bare-string imports are all recognised", (() => {
  const r = sanitizeCustomCss(`@import url(http://a/x.css); @import 'http://b/y.css'; @import "https://ok/z.css";`);
  return r.report.cssRules === 2 && /https:\/\/ok\/z\.css/.test(r.css) && !/http:\/\/(a|b)\//.test(r.css);
})());
check("non-https @import removed, https kept", (() => {
  const css = sanitizeCustomCss(`@import url("http://x/a.css"); @import url("https://fonts.googleapis.com/css2?family=Inter");`).css;
  return !/http:\/\/x/.test(css) && /fonts\.googleapis/.test(css);
})());

// ── Faithful rendering of ordinary designs ───────────────────────────────
const design = `<section class="hero" style="padding:40px"><h1>Big idea</h1><p>Copy &amp; more</p><a class="btn" href="https://example.com/start">Start</a><a href="#faq">FAQ</a><a href="/pricing" target="_blank">Pricing</a><img src="https://images.example.com/a.jpg" alt="x" srcset="https://images.example.com/a.jpg 1x, https://images.example.com/a@2x.jpg 2x"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></section>`;
const kept = clean(design);
check("keeps classes, inline styles, images, srcset and SVG viewBox", /class="hero"/.test(kept) && /padding:40px/.test(kept) && /srcset=/.test(kept) && /viewBox="0 0 24 24"/.test(kept), kept);
check("external links open on the page (target=_top)", /href="https:\/\/example.com\/start" target="_top"/.test(kept));
check("hash links stay inside the block", /<a href="#faq">/.test(kept));
check("new-tab links get rel=noopener noreferrer", /target="_blank" rel="noopener noreferrer"/.test(kept));
check("ordinary design reports nothing removed", describeCustomHtmlReport(sanitizeCustomHtml(design).report).length === 0);
check("relative + https + mailto + tel URLs are safe", ["/x", "#a", "https://a", "mailto:a@b.c", "tel:+1"].every((u) => isSafeCustomHtmlUrl(u)));

// ── Paste normalization ──────────────────────────────────────────────────
const pasted = `<!DOCTYPE html><html><head><title>T</title><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><style>.hero{color:red}</style></head><body><section class="hero"><h1>Hi</h1></section><script>track()</script></body></html>`;
const n = normalizePastedHtml(pasted);
check("full document: body kept, wrapper dropped", n.kind === "pasted-document" && /<section class="hero">/.test(n.html) && !/<(html|head|body|title|meta)/i.test(n.html), n.html);
check("full document: <style> + stylesheet link move to CSS", /\.hero\{color:red\}/.test(n.css) && /@import url\("https:\/\/fonts\.googleapis\.com/.test(n.css), n.css);
check("full document: script removed by the sanitizer after paste", !/<script/i.test(clean(n.html)));
check("fragment passes through unchanged", normalizePastedHtml("<div>a</div>").html === "<div>a</div>");

// ── Auto height + viewport units ─────────────────────────────────────────
check("auto height: vh measured against a fixed screen (no feedback loop)", freezeViewportUnits(".h{min-height:100vh;height:50dvh}") === ".h{min-height:800px;height:400px}");
const autoDoc = buildCustomHtmlSrcDoc(`<div style="height:100vh">x</div>`, ".a{height:100vh}", { height: "auto", fixedHeight: 480, overflow: "scroll" });
const fixedDoc = buildCustomHtmlSrcDoc(`<div style="height:100vh">x</div>`, ".a{height:100vh}", { height: "fixed", fixedHeight: 480, overflow: "scroll" });
check("auto mode freezes vh in CSS and inline styles; fixed mode keeps real vh", !/100vh/.test(autoDoc) && /100vh/.test(fixedDoc));
check("visible text mentioning vh is never rewritten", /50vh is/.test(buildCustomHtmlSrcDoc("<p>50vh is a unit</p>", "", { height: "auto", fixedHeight: 480, overflow: "scroll" })));

// ── Persistence contract + limits ────────────────────────────────────────
const art = normalizeCustomHtmlArtifact({ html: "<p>x</p>", css: "", display: { height: "fixed", fixedHeight: 99999, overflow: "nope" }, junk: 1 });
check("artifact is versioned and coerced (height clamped, overflow defaulted, unknown keys dropped)",
  art.artifactVersion === 1 && art.display.fixedHeight === CUSTOM_HTML_LIMITS.fixedHeightMax && art.display.overflow === "scroll" && !("junk" in art));
check("missing/garbage content normalizes to an empty artifact", normalizeCustomHtmlArtifact(null).html === "" && normalizeCustomHtmlArtifact("x").display.height === "auto");
const node = (html: string) => ({ type: "CustomHtml", props: { id: "c", content: { ...emptyCustomHtmlArtifact(), html } } });
const page = (...nodes: unknown[]) => ({ root: { props: {} }, content: [{ type: "Section", props: { rows: [{ type: "Row", props: { columns: [{ type: "Column", props: { elements: nodes } }] } }] } }] });
check("normal Claude-sized section passes the limits", findCustomHtmlLimitProblem(page(node("<section>" + "x".repeat(60_000) + "</section>"))) === null);
check("oversized HTML is refused with a readable message", /too large.*HTML is/i.test(findCustomHtmlLimitProblem(page(node("x".repeat(CUSTOM_HTML_LIMITS.htmlBytes + 1)))) ?? ""));
check("block count per page is capped (found inside nested slots)",
  /up to 25/.test(findCustomHtmlLimitProblem(page(...Array.from({ length: 26 }, () => node("<p>x</p>")))) ?? ""));
check("empty artifact renders as empty (nothing shown to visitors)", buildSafeCustomHtmlDocument(emptyCustomHtmlArtifact()).isEmpty);

// ── Registry, placement and boundaries ───────────────────────────────────
const config = src("src/components/pages-funnels/puck/config.tsx");
const panel = src("src/components/pages-funnels/puck/blocks-panel.tsx");
check("Advanced category holds Custom HTML (only)", /advanced: \{ title: "Advanced", components: \["CustomHtml"\] \}/.test(config));
const categories = /categories: \{([\s\S]*?)\n    \},\n    components:/.exec(config)?.[1] ?? "";
check("Custom HTML is not in Layout / Elements / Business", categories.length > 0 && !/(layout|elements|business): \{[^}]*CustomHtml/.test(categories));
check("Blocks panel: Advanced comes after the general categories", /BASE_CATEGORY_ORDER = \[\.\.\.GENERAL_CATEGORY_ORDER, "advanced"\]/.test(panel));
check("Reading Result pages don't offer Advanced", /READING_RESULT_CATEGORY_ORDER = \["reading", "nextSteps", \.\.\.GENERAL_CATEGORY_ORDER\]/.test(panel));
check("stored as ONE versioned `content` payload + shared style", /CustomHtml: \{[\s\S]*?fields: \{\s*content: customHtmlContentField,\s*style: mediaStyleField,\s*\}/.test(config));
const aiPlan = src("src/lib/pages-funnels/ai/page-plan.ts");
const safeSet = /SAFE_PUCK_COMPONENTS = new Set\(\[([^\]]*)\]\)/.exec(aiPlan)?.[1] ?? "";
check("AI page generation can't emit Custom HTML", safeSet.length > 0 && !/CustomHtml/.test(safeSet) && !/CustomHtml/.test(aiPlan));
const service = src("src/lib/server/pages-funnels-puck-service.ts");
check("limits enforced on both Save Draft and Publish", (service.match(/customHtmlLimitError\(data\)/g) ?? []).length === 2);
check("published pages use the server variant (sanitized before it reaches visitors)",
  /CustomHtmlElementServerRender/.test(src("src/components/pages-funnels/puck/server-config.tsx")) && !/"use client"/.test(src("src/components/pages-funnels/puck/custom-html-server.tsx")));
const frame = src("src/components/pages-funnels/puck/custom-html-frame.tsx");
check("height messages accepted only from this block's own frame", /event\.source !== ref\.current\.contentWindow/.test(frame));
check("editor label only while editing", /\{editing && \(/.test(frame) && /Custom HTML/.test(frame));
check("never injects customer HTML into the page DOM", !/dangerouslySetInnerHTML=\{\{ __html: (?!responsiveCss)/.test(frame));

console.log(`\nCustom HTML checks: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
