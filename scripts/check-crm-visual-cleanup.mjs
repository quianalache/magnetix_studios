#!/usr/bin/env node
/**
 * CRM-wide Visual Direction 2 final cleanup — contract (2026-10-24). Static
 * source checks; no server, no Firebase.
 *
 * Run: node scripts/check-crm-visual-cleanup.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
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

// The legacy MomentumOS scope (lavender cards, purple text) is gone from every
// operational sub-account page. Only the Energetic Decoder report previews
// keep it — part of the separately approved Report Builder.
const SA = "src/app/(dashboard)/sa/[subAccountId]";
const scoped = walk(SA).filter((f) => /className="[^"]*\bmomentum-scope\b/.test(src(f)));
check(
  "no operational page wraps itself in .momentum-scope (report previews excepted)",
  scoped.every((f) => /energetic-decoder\/(reports|generated-reports)\/.*\/preview\/page\.tsx$/.test(f)),
);
const semantic = src("src/styles/magnetix/semantic.css");
check("native selects in the CRM share the system chevron/padding", semantic.includes(".mx-crm select:not([multiple]):not([size])") && semantic.includes("appearance: none"));
check("native checkboxes/radios in the CRM use the plum action colour", /\.mx-crm input\[type="checkbox"\][\s\S]*accent-color: var\(--primary\)/.test(semantic));
check("course list + preview card: icon tile, not a letter placeholder", !/charAt\(0\)/.test(src(`${SA}/courses/page.tsx`)) && !/charAt\(0\)/.test(src("src/components/standalone-courses/course-preview-card.tsx")));
check("Content Pipeline + course wizard titles on the page-title scale", !/text-3xl font-extrabold/.test(src(`${SA}/content/page.tsx`)) && !/<h1 className="text-3xl/.test(src("src/components/standalone-courses/course-wizard.tsx")));

console.log(`\nCRM visual cleanup contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
