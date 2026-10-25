#!/usr/bin/env node
/**
 * Agency — Visual Direction 2 contract (2026-10-24). Static source checks; no
 * server, no Firebase.
 *
 * Run: node scripts/check-agency-visual.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const src = (f) => readFileSync(f, "utf8");
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}
const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith(".tsx")) out.push(p);
  }
  return out;
};

const AG = "src/app/(dashboard)/agency";
const IMM = "src/app/(agency-immersive)/agency";
// Orphaned LeadStack-template editors (only the stubbed /agency/landing used them).
const ORPHANED = new Set(["src/components/agency/deal-editor.tsx", "src/components/agency/landing-click-tabs.tsx"]);
const agencyFiles = [...walk(AG), ...walk("src/components/agency")].filter((f) => !ORPHANED.has(f));

check("no Agency file uses the legacy .momentum-scope", [...agencyFiles, ...walk(IMM)].every((f) => !/\bmomentum-scope\b/.test(src(f))));

const PALETTE = /\b(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:emerald|green|teal|lime|amber|yellow|orange|rose|red|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|slate|gray|zinc)-\d00\b/;
const palette = agencyFiles.filter((f) => PALETTE.test(src(f)));
check(`Agency UI draws colour from tokens, not the Tailwind palette (${palette.join(", ") || "none"})`, palette.length === 0);

const px = agencyFiles.filter((f) => /\btext-\[\d+(?:\.\d+)?px\]/.test(src(f)));
check(`Agency UI uses the type scale, not arbitrary px sizes (${px.join(", ") || "none"})`, px.length === 0);

for (const page of ["page.tsx", "sub-accounts/page.tsx", "sub-accounts/new/page.tsx", "billing/page.tsx", "acquisition/page.tsx", "community/page.tsx", "get-started/page.tsx", "setup/page.tsx"]) {
  const s = src(`${AG}/${page}`) + (page === "page.tsx" ? src("src/components/agency/agency-home-dashboard.tsx") : "");
  check(`/agency/${page.replace(/\/?page\.tsx$/, "")} uses PageShell + PageHeader`, s.includes("<PageShell") && s.includes("<PageHeader"));
}

for (const stub of ["landing", "affiliates", "affiliates/instances", "affiliates/[id]", "affiliates/buyers", "affiliates/payouts", "affiliates/email"]) {
  const s = src(`${AG}/${stub}/page.tsx`);
  check(`unbuilt /agency/${stub} renders the branded not-found state`, s.includes("notFound()") && !s.includes("hello world"));
}

const header = src("src/components/dashboard/header.tsx");
for (const route of ["billing", "acquisition", "community", "standalone-courses", "communications", "setup"]) {
  check(`header names /agency/${route} (never falls back to the brand name)`, header.includes(`\\/agency\\/${route}`) || header.includes(`(standalone-courses|course-offers)`) && route === "standalone-courses");
}

check("billing state pill is the system StatusPill", src("src/components/agency/billing-status-badge.tsx").includes("<StatusPill"));

const chrome = existsSync("src/components/agency/agency-courses-chrome.tsx") ? src("src/components/agency/agency-courses-chrome.tsx") : "";
check("Agency Courses + Course Offers render inside the CRM chrome (theme editors stay full-screen)",
  chrome.includes("DashboardLayout") && /theme/.test(chrome) &&
  ["standalone-courses", "course-offers"].every((d) => existsSync(`${IMM}/${d}/layout.tsx`) && src(`${IMM}/${d}/layout.tsx`).includes("AgencyCoursesChrome")));

const confirms = agencyFiles.filter((f) => /window\.confirm\(/.test(src(f)));
check(`high-impact Agency actions use the system confirm dialog (${confirms.join(", ") || "none"})`, confirms.length === 0);

const dialog = src("src/components/agency/sub-account-manage-dialog.tsx");
const groups = dialog.match(/<GateGroup[\s\S]*?<\/GateGroup>/g) ?? [];
const grouped = groups.join("").match(/<GateToggle\b/g)?.length ?? 0;
const total = dialog.match(/<GateToggle\b/g)?.length ?? 0;
check(`every feature gate sits in a labelled group (${grouped}/${total})`, groups.length >= 4 && total >= 18 && grouped === total);
check("Manage dialog states its scope (this sub-account only)", dialog.includes("affect only this sub-account"));

const devCopy = agencyFiles.filter((f) => /LANDING_VARIANT is|src\/config\/landing\.ts\.|returns 403|403s/.test(src(f).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "")));
check(`no developer-facing copy in Agency UI (${devCopy.join(", ") || "none"})`, devCopy.length === 0);

console.log(`\nAgency visual contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
