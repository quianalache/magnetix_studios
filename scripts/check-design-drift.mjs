#!/usr/bin/env node
/**
 * Magnetix design-drift ratchet (design-system Phase 0, 2026-10-13).
 *
 * Counts patterns that fight the shared design system and compares them with
 * the committed baseline (scripts/design-drift-baseline.json). It FAILS ONLY
 * WHEN A COUNT GOES UP — existing legacy code never blocks a build, and every
 * migration that removes patterns lowers the bar for everyone after it.
 *
 *   node scripts/check-design-drift.mjs            check (wired into `pnpm lint`)
 *   node scripts/check-design-drift.mjs --update   lower the baseline after a cleanup
 *                                                  (refuses to RAISE a count unless --allow-increase)
 *   node scripts/check-design-drift.mjs --list <metric>   print every file:line for one metric
 *
 * If a count rises: use the shared token/component instead (CLAUDE.md →
 * "Magnetix design system"). A justified new specialized surface goes in
 * ALLOW below with its reason — not by bumping the baseline.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "scripts", "design-drift-baseline.json");

/**
 * Specialized surfaces whose hard-coded colors / sizes are their job, so the
 * colour and font-size metrics skip them. Each needs a reason.
 */
const ALLOW = [
  [/^src\/lib\/.*pdf-document[^/]*\.tsx$/, "PDF documents (react-pdf has no CSS variables)"],
  [/^src\/lib\/energetics\//, "Energetic Decoder report/reading PDF + render pipeline"],
  [/^src\/lib\/broadcasts\//, "email HTML renderer (inline styles required by mail clients)"],
  [/^src\/components\/energetic-decoder\/(human-design|mandala|astrology|chart-|report-)/, "chart renderers and the Report Builder canvas"],
  [/^src\/components\/pages-funnels\/puck\//, "Pages & Funnels tenant canvas"],
  [/^src\/components\/web-chat\/chat-window\.tsx$/, "self-contained widget embedded on third-party sites"],
  [/^src\/components\/ui\/color-input\.tsx$/, "colour picker presets"],
  [/^src\/app\/docs\//, "internal design prototypes / docs"],
];

/** metric → { re, files, skipAllow, exclude } */
const METRICS = {
  hexInTsx: { re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![-\w])/g, ext: ".tsx", skipAllow: true },
  arbitraryFontSize: { re: /\btext-\[[0-9.]+(?:px|rem|em)\]/g, ext: ".tsx", skipAllow: true },
  nativeSelect: { re: /<select\b/g, ext: ".tsx", exclude: [/^src\/components\/ui\//] },
  windowConfirm: { re: /\bwindow\.confirm\(/g, ext: ".tsx" },
  rawH1ClassName: { re: /<h1\s+className=/g, ext: ".tsx", exclude: [/page-header\.tsx$/, /^src\/components\/system\//] },
  momentumScope: { re: /\bmomentum-scope\b/g, ext: ".tsx" },
  // Tenant branding must never reach the internal CRM shell (styles/magnetix/tenant.css).
  brandTokenInCrm: {
    re: /--brand-|\btenant-surface\b|tenantBrandStyle/g,
    ext: ".tsx",
    include: [/^src\/components\/(ui|system|dashboard|theme)\//, /^src\/app\/\((dashboard|builder|immersive|agency-immersive)\)\//],
  },
  legacyThemeClass: {
    re: /\btheme-(?:green|leadstack|magnetix)\b|\bmx-(?:hero|wash|banner)-gradient\b|\bmx-gradient-text\b/g,
    ext: ".tsx",
    exclude: [/^src\/components\/theme\/app-accent\.tsx$/],
  },
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function count(listMetric) {
  const files = walk(SRC).map((p) => relative(ROOT, p).split("\\").join("/"));
  const counts = Object.fromEntries(Object.keys(METRICS).map((k) => [k, 0]));
  const listing = [];
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const allowed = ALLOW.some(([re]) => re.test(file));
    for (const [name, m] of Object.entries(METRICS)) {
      if (!file.endsWith(m.ext)) continue;
      if (m.skipAllow && allowed) continue;
      if (m.exclude?.some((re) => re.test(file))) continue;
      if (m.include && !m.include.some((re) => re.test(file))) continue;
      const hits = text.match(m.re);
      if (!hits) continue;
      counts[name] += hits.length;
      if (listMetric === name) {
        text.split("\n").forEach((line, i) => {
          if (new RegExp(m.re.source).test(line)) listing.push(`${file}:${i + 1}`);
        });
      }
    }
  }
  return { counts, listing };
}

const argv = process.argv.slice(2);
if (argv[0] === "--list") {
  const { listing } = count(argv[1]);
  console.log(listing.join("\n"));
  process.exit(0);
}

const { counts } = count();
let baseline = null;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8")).counts;
} catch {}

if (argv.includes("--update")) {
  const raised = baseline ? Object.keys(counts).filter((k) => counts[k] > (baseline[k] ?? 0)) : [];
  if (raised.length && !argv.includes("--allow-increase")) {
    console.error(`✗ Refusing to raise the baseline for: ${raised.join(", ")}. Fix the new code, or pass --allow-increase with owner-approved justification.`);
    process.exit(1);
  }
  writeFileSync(BASELINE, JSON.stringify({ _comment: "Design-drift ratchet baseline — counts may only go DOWN. See scripts/check-design-drift.mjs.", updated: new Date().toISOString().slice(0, 10), counts }, null, 2) + "\n");
  console.log("✓ Baseline written:", counts);
  process.exit(0);
}

if (!baseline) {
  console.error("✗ No baseline — run: node scripts/check-design-drift.mjs --update");
  process.exit(1);
}
let failed = false;
for (const [k, n] of Object.entries(counts)) {
  const b = baseline[k] ?? 0;
  if (n > b) {
    failed = true;
    console.error(`✗ ${k}: ${n} (baseline ${b}, +${n - b}) — use the shared token/component; \`node scripts/check-design-drift.mjs --list ${k}\` lists them`);
  } else if (n < b) {
    console.log(`↓ ${k}: ${n} (baseline ${b}) — lower the baseline with --update`);
  }
}
if (failed) process.exit(1);
console.log("✓ Design drift: no metric above baseline.");
