/**
 * Proof-page contracts (design-system proof pages, 2026-10-14). Static render
 * + source checks, no browser, no data.
 * Run: pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-proof-pages.tsx
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { UserPlus } from "lucide-react";
import { MetricCard } from "../src/components/system/metric-card";
import { MomentHero } from "../src/components/system/moment-hero";
import { LockedNotice } from "../src/components/system/locked-notice";
import { PoweredByMagnetix, canHidePoweredBy } from "../src/components/brand/powered-by-magnetix";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
}
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Composites.
const metric = html(<MetricCard icon={UserPlus} tone="aqua" label="New leads" value="3" hint="9 total" href="/x" />);
check("MetricCard: link card, round chip, live value, no invented trend", metric.startsWith("<a") && metric.includes("rounded-full") && metric.includes(">3<") && !/↑|%/.test(metric));
const hero = html(<MomentHero eyebrow="Welcome back, Quiana" title="Good morning" quote="Aligned systems" />);
check("MomentHero: display serif h2 + one planet motif in a clipped frame", hero.includes("<h2") && hero.includes("font-display") && (hero.match(/data-motif=/g) ?? []).length === 1 && hero.includes('data-motif="planet"') && hero.includes("overflow-hidden"));
check("MomentHero: approved composition — letter-spaced eyebrow, 48px serif on wide screens, ringed planet, brand line", hero.includes("tracking-[0.24em]") && hero.includes("xl:text-display-xl") && hero.includes("mx-hero-planet-ring") && hero.includes("mx-hero-quote"));
check("LockedNotice: lock chip + default copy", html(<LockedNotice />).includes("Locked by your agency"));

// Powered by — shown by default, no plan gate yet.
check("PoweredByMagnetix renders by default", html(<PoweredByMagnetix />).includes("Powered by"));
check("canHidePoweredBy() is false (no plan gate yet)", canHidePoweredBy({ subAccountId: "x" }) === false);

// Navigation.
const tabs = src("src/components/pwa/bottom-tab-bar.tsx");
const paths = [...tabs.matchAll(/path: "(\/[a-z]+)"/g)].map((m) => m[1]);
check("bottom tab bar: Home / Inbox / Calendar / Projects (+ More)", JSON.stringify(paths) === JSON.stringify(["/dashboard", "/conversations", "/calendar", "/projects"]) && tabs.includes("onMore"));
check("bottom tab bar: Contacts and Pipeline removed", !tabs.includes('"/contacts"') && !tabs.includes('"/pipeline"'));
const sidebar = src("src/components/dashboard/sidebar.tsx");
check("sidebar: tablet band defaults to the icon rail, saved preference wins", sidebar.includes("(min-width: 768px) and (max-width: 1023.98px)") && /if \(stored === "1"\) return setCollapsed\(true\);\s*if \(stored === "0"\) return;/.test(sidebar));

// Tenant boundary.
const booking = src("src/components/booking/public-booking-view.tsx");
check("booking: root is a tenant surface styled by tenantBrandStyle()", booking.includes('"tenant-surface tenant-wash') && booking.includes("tenantBrandStyle({"));
check("booking: approved three-column layout (info · month calendar · times)", booking.includes("lg:grid-cols-[17.5rem_minmax(0,1fr)_12.5rem]") && booking.includes("md:grid-cols-[minmax(0,1fr)_12.5rem]") && booking.includes("function MonthGrid"));
check("booking: no hard-coded fallback green / white-on-accent", !booking.includes("#0F766E") && !booking.includes('"text-white shadow-sm"'));
check("booking: Powered by Magnetix in the footer", booking.includes("<PoweredByMagnetix />"));
const tenantCss = src("src/styles/magnetix/tenant.css");
check("tenant.css: selected option uses the computed on-primary text", /aria-pressed="true"\][^}]*color: var\(--brand-on-primary\)/.test(tenantCss));
check("tenant.css: no CRM tokens leak into tenant surfaces", !/--ds-|plum|violet/.test((tenantCss.split("Tenant-surface building blocks")[1] ?? "").replace(/^[\s\S]*?\*\//, "").replace(/\/\*[\s\S]*?\*\//g, "")));

// Pages use the system shell.
const dash = src("src/app/(dashboard)/sa/[subAccountId]/dashboard/page.tsx");
check("Dashboard: 'Where your leads are' removed (no LeadsMap)", !dash.includes("LeadsMap") && !dash.includes("Where your leads are"));
check("Dashboard: no New Deal action in the header (owner review 2026-10-14)", !dash.includes("NewDealDialog"));
check("Dashboard: fills the content width like Section 4.1", dash.includes('<PageShell width="wide">'));
check("Dashboard: greeting/date use the viewer's clock after mount (React #418)", /useState<Date \| null>\(null\)/.test(dash) && !/const hour = new Date\(\)\.getHours\(\)/.test(dash));
check("Dashboard: Audience growth uses real contact dates only", dash.includes("function AudienceGrowth") && dash.includes("toDate(c.createdAt)"));
check("Dashboard: PageShell + moment PageHeader, no legacy scope", src("src/app/(dashboard)/sa/[subAccountId]/dashboard/page.tsx").includes('<PageHeader\n        variant="moment"') && !src("src/app/(dashboard)/sa/[subAccountId]/dashboard/page.tsx").includes("momentum-scope"));
const saSettings = src("src/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page.tsx");
const agSettings = src("src/app/(dashboard)/agency/settings/page.tsx");
check("Settings: both pages use the ONE SettingsWorkspace (Section 4.4)", saSettings.includes("<SettingsWorkspace") && agSettings.includes("<SettingsWorkspace"));
check("Settings: no second navigation layer (tabs / floating sub-nav card)", !/TabsList|SettingsSubNavigation/.test(saSettings + agSettings));
for (const k of ["business-profile", "members", "sending-preferences", "calendar", "sms", "facebook-instagram", "email-domain", "custom-domain", "google-reviews", "pipeline", "custom-fields", "import", "export", "payments", "subscription", "business-brain", "api-keys", "webhooks"]) {
  check(`sub-account Settings maps section "${k}"`, saSettings.includes(`active === "${k}"`));
}
for (const c of ["SubAccountWorkspaceNameSection", "SubAccountContactSection", "SubAccountBrandingSection", "SubAccountMembersSection", "SubAccountTerritoriesSection", "SubAccountSendingPreferencesSection", "SubAccountBroadcastComplianceSection", "SubAccountCalendarSyncSection", "SubAccountGoogleCalendarSection", "SubAccountSmsSection", "SubAccountMetaSection", "SubAccountEmailDomainSection", "SubAccountCustomDomainSection", "SubAccountGoogleReviewSection", "SubAccountPipelineSection", "SubAccountCustomFieldsSection", "GhlImportWizard", "SubAccountPayPalSection", "SubAccountStripeSection", "SubAccountPlanBillingSection", "SubAccountBusinessBrainSection", "SubAccountApiRecipesSection", "SubAccountApiKeysSection", "SubAccountWebhooksSection"]) {
  check(`sub-account Settings still renders <${c}>`, saSettings.includes(`<${c} />`));
}
for (const c of ["BrandingSection", "SalesPageSection", "AppIconSection", "StatusTab", "MessagingSection", "AiModelSection", "AgencyAssistantSection", "AgencyAiKbSection", "PasswordSection", "SeedDemoSection"]) {
  check(`Agency Settings still renders <${c}>`, agSettings.includes(`<${c} />`));
}
check("Settings: old ?tab= links + OAuth returns resolve to a section", saSettings.includes('params.has("meta")') && saSettings.includes('params.has("gcal")') && saSettings.includes('params.has("stripeconnect")') && saSettings.includes("LEGACY_TAB"));
const ws = src("src/components/system/settings-workspace.tsx");
check("Settings nav: group labels use the approved 10px tracked regular-weight label, links stay regular", ws.includes("text-overline font-normal tracking-[0.16em] text-ink-tertiary uppercase") && ws.includes('role="group"'));
for (const f of ["crm-resources", "resource-library", "affiliate-library"]) {
  const t = src(`src/components/assets/${f}.tsx`);
  check(`Assets ${f}: header row = approved 10.5px #736D8F single-line labels`, t.includes("bg-table-head text-left text-th font-semibold tracking-[0.08em] whitespace-nowrap text-table-head-foreground uppercase"));
}
check("Assets header colour token = approved ink-3", src("src/styles/magnetix/semantic.css").includes("--ds-table-head-fg: var(--color-ink-3);"));
check("SettingsWorkspace: 210px column from 1280px, 720px content, compact picker below 1024px", ws.includes("xl:grid-cols-[13.125rem_minmax(0,45rem)]") && ws.includes("lg:hidden") && ws.includes('aria-label="Unsaved changes"'));
check("Agency Assistant: shared Switch, no hand-rolled switch button", src("src/components/agency/agency-assistant-section.tsx").includes("<Switch") && !src("src/components/agency/agency-assistant-section.tsx").includes('role="switch"'));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
