/**
 * Wave 1 design-migration page contract (2026-10-14). Static source checks —
 * no browser, no Firebase. Keeps the migrated operational pages on the
 * Magnetix system composites so they can't drift back to page-local styling.
 *
 * Run: node scripts/check-wave1-pages.mjs
 */
import { readFileSync } from "node:fs";

const SA = "src/app/(dashboard)/sa/[subAccountId]";
const AG = "src/lib/agency-communications-pages";

/** Route pages: must render inside PageShell with the system PageHeader. */
const PAGES = [
  `${SA}/forms/page.tsx`,
  `${SA}/forms/community-polls/page.tsx`,
  `${SA}/forms/community-polls/[groupId]/[postId]/page.tsx`,
  `${SA}/quotes/page.tsx`,
  `${SA}/quotes/new/page.tsx`,
  `${SA}/products/page.tsx`,
  `${SA}/broadcasts/page.tsx`,
  `${SA}/broadcasts/layout.tsx`,
  `${SA}/email/page.tsx`,
  `${SA}/email/templates/page.tsx`,
  `${SA}/templates/page.tsx`,
  `${SA}/templates/new/page.tsx`,
  `${SA}/templates/[templateId]/page.tsx`,
  `${SA}/social/page.tsx`,
  `${SA}/import/page.tsx`,
  `${SA}/qr-codes/page.tsx`,
  `${SA}/qr-codes/new/page.tsx`,
  `${SA}/qr-codes/[qrId]/page.tsx`,
  `${SA}/labs/page.tsx`,
  `${SA}/reports/page.tsx`,
  `${AG}/hub.tsx`,
  `${AG}/broadcast-list.tsx`,
  `${AG}/template-list.tsx`,
];

/** Migrated components/pages that must not re-introduce legacy patterns. */
const CLEAN = [
  ...PAGES,
  `${SA}/logs/page.tsx`,
  `${SA}/quotes/[id]/page.tsx`,
  `${SA}/broadcasts/[broadcastId]/page.tsx`,
  `${AG}/broadcast-detail.tsx`,
  "src/components/quotes/quote-list.tsx",
  "src/components/quotes/quote-status-badge.tsx",
  "src/components/broadcasts/broadcast-index.tsx",
  "src/components/logs/logs-view.tsx",
  "src/components/logs/log-shared.tsx",
  "src/components/logs/api-logs-tab.tsx",
  "src/components/logs/webhook-logs-tab.tsx",
  "src/components/social/social-content-calendar.tsx",
  "src/components/social/social-content-tab.tsx",
  "src/components/social/content-ideas.tsx",
  "src/components/social/social-connections.tsx",
  "src/components/reports/attribution-report.tsx",
  "src/components/labs/watchdog-section.tsx",
  "src/components/import/ghl-import-wizard.tsx",
];

/** Index pages carry the small crescent; Reports carries the orbit. */
const CRESCENT = [
  `${SA}/forms/page.tsx`,
  `${SA}/quotes/page.tsx`,
  `${SA}/products/page.tsx`,
  `${SA}/broadcasts/page.tsx`,
  `${SA}/email/templates/page.tsx`,
  `${SA}/templates/page.tsx`,
  `${SA}/qr-codes/page.tsx`,
  `${AG}/broadcast-list.tsx`,
  `${AG}/template-list.tsx`,
];

let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) pass++;
  else fail++;
  if (!ok) console.log(`  FAIL  ${label}`);
}
const src = (f) => readFileSync(f, "utf8");

for (const f of PAGES) {
  const s = src(f);
  check(`${f}: uses PageShell`, /components\/system\/page-shell/.test(s));
  check(`${f}: uses the system PageHeader`, /components\/system\/page-header/.test(s) || /<PageHeader|BroadcastDetailView/.test(s));
}
for (const f of CLEAN) {
  const s = src(f);
  check(`${f}: no .momentum-scope`, !s.includes("momentum-scope"));
  check(`${f}: no native confirm()`, !/(^|[^.\w])confirm\(\s*[`"']/m.test(s) && !s.includes("window.confirm"));
  check(`${f}: no native <select>`, !/<select\b/.test(s));
  check(`${f}: no raw <h1 className>`, !/<h1 className=/.test(s));
  check(`${f}: no rounded-2xl legacy cards`, !s.includes("rounded-2xl"));
  check(`${f}: no 10/11px arbitrary font sizes`, !/text-\[1[01]px\]/.test(s));
  check(`${f}: no raw hex colors`, !/#[0-9a-fA-F]{6}\b/.test(s));
}
for (const f of CRESCENT) check(`${f}: index page carries the crescent accent`, /accent="crescent"/.test(src(f)));
const reports = src(`${SA}/reports/page.tsx`);
check("reports: orbit accent", /accent="orbit"/.test(reports));
check("reports: KPIs use MetricCard", /<MetricCard/.test(reports) && !/function Kpi\(/.test(reports));
check("dashboard planet never reused on Wave 1 pages", CLEAN.every((f) => !/kind="planet"|motif="planet"/.test(src(f))));
check("social: delete still asks before removing a post", /confirmDialog\(\{ title: "Delete this post\?"/.test(src(`${SA}/social/page.tsx`)));
check("social: agency gate still guards the planner", /useResilientFeatureGate\(\{ field: "socialPlannerEnabledByAgency"/.test(src(`${SA}/social/page.tsx`)));
check("broadcasts: agency gate still guards every route", /field: "broadcastsEnabledByAgency"/.test(src(`${SA}/broadcasts/layout.tsx`)));
check("labs: gate still reads labsEnabledByAgency strictly", /labsEnabledByAgency === true/.test(src(`${SA}/labs/page.tsx`)));

console.log(`\nWave 1 page contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
