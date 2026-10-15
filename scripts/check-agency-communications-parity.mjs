/**
 * Agency Communications parity contract (2026-10-15). Static source checks —
 * no browser, no Firebase. Guards the parity pass: every Agency page in the
 * CRM chrome, shared components reused (not copied), agency scope kept.
 *
 * Run: node scripts/check-agency-communications-parity.mjs
 */
import { readFileSync } from "node:fs";

const src = (f) => readFileSync(f, "utf8");
let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

const route = src("src/app/(agency-immersive)/agency/communications/[[...path]]/page.tsx");
const returns = (route.match(/return <[^;]+;/g) ?? []).filter((r) => !r.startsWith("return <DashboardLayout>"));
check("route: every Agency Communications page renders inside DashboardPage (CRM chrome)", returns.length === 8 && returns.every((r) => r.startsWith("return <DashboardPage>")));

const pages = "src/lib/agency-communications-pages";
for (const f of ["hub", "broadcast-list", "broadcast-detail", "template-list"]) {
  const s = src(`${pages}/${f}.tsx`);
  check(`${f}: owner-only state is a system EmptyState in PageShell (no raw div)`, !/mx-auto max-w-2xl p-8 text-center/.test(s));
  check(`${f}: no legacy styling`, !/momentum-scope|rounded-2xl|<select\b|text-\[1[0-3]px\]/.test(s));
}
for (const f of ["src/components/agency-communications/agency-broadcast-composer.tsx", "src/components/agency-communications/agency-email-template-editor.tsx"]) {
  check(`${f}: owner-only state is a system EmptyState`, !/mx-auto max-w-2xl p-8 text-center/.test(src(f)));
}

const hub = src(`${pages}/hub.tsx`);
check("hub: sending-readiness strip (deployment email provider + queue)", /emailConfigured/.test(hub) && /queueConfigured/.test(hub) && /<Alert tone="success">/.test(hub) && /<Alert tone="warning"/.test(hub));
check("hub: template count on the Email Templates card", /templateCount/.test(hub) && /ready to reuse/.test(hub));
check("hub: copy never implies platform-funded sending", /your own email provider/.test(hub) && !/unlimited|included in your plan|free email/i.test(hub));
const cfg = src("src/app/api/agency/deployment-config/route.ts");
check("deployment-config: exposes queueConfigured (boolean only)", /queueConfigured: qstashIsConfigured\(\)/.test(cfg));

const list = src(`${pages}/broadcast-list.tsx`);
check("list: audience shown per row (parity with tenant audienceLabel)", /agencyAudienceLabel\(c\.audienceSources, names\)/.test(list));
check("list: refreshes while a send is in flight", /c\.status === "queued" \|\| c\.status === "sending"/.test(list) && /setInterval\(refresh, 4000\)/.test(list));

const detail = src(`${pages}/broadcast-detail.tsx`);
check("detail: polling uses the fetched status (no stale-closure infinite poll)", /status = commData\?\.communication\?\.status;/.test(detail) && !/const status = communication\?\.status;/.test(detail));
check("detail: audience + cancelled time in meta", /agencyAudienceLabel\(communication\.audienceSources, names\)/.test(detail) && /communication\.cancelledAt/.test(detail));

const card = src("src/components/email-authoring/template-library-card.tsx");
check("shared template card: Rename / Duplicate / Delete + touch-visible trigger", /Rename/.test(card) && /Duplicate/.test(card) && /Delete/.test(card) && /\[@media\(hover:none\)\]:opacity-100/.test(card));
const saTpls = src("src/app/(dashboard)/sa/[subAccountId]/email/templates/page.tsx");
check("sub-account library uses the shared card (no private copy)", /<TemplateLibraryCard/.test(saTpls) && !/function TemplateCard\(/.test(saTpls));
const agTpls = src(`${pages}/template-list.tsx`);
check("agency library uses the shared card + dialogs", /<TemplateLibraryCard/.test(agTpls) && /<RenameTemplateDialog/.test(agTpls) && /<DeleteTemplateDialog/.test(agTpls));
check("agency library actions go through the agency-scoped API only", /\/api\/agency\/email-templates/.test(agTpls) && !/template-library"/.test(agTpls.replace('import type { EmailTemplateSummary } from "@/lib/email/template-library";', "")));

const ctx = src("src/context/email-template-context.tsx");
const picker = src("src/components/email-authoring/email-template-picker-dialog.tsx");
const agCtx = src("src/context/agency-email-template-context.tsx");
check("template picker: scope-aware loader (agency templates load via the agency API)", /loadTemplate\?:/.test(ctx) && /loadTemplate\s*\?\s*await loadTemplate\(summary\)/.test(picker) && /loadTemplate: loadAgencyTemplate/.test(agCtx) && /\/api\/agency\/email-templates\//.test(agCtx));

const editor = src("src/components/agency-communications/agency-email-template-editor.tsx");
check("agency editor: delete checks the response", /if \(!res\.ok\) throw new Error\("delete failed"\)/.test(editor));

// Scope/tenancy: the agency APIs stay owner-only and anchored to the caller's agency.
for (const f of ["communications", "communication-by-id", "communication-cancel", "draft-save", "send", "email-templates", "email-template-by-id", "audience-options", "audience-preview"]) {
  const s = src(`src/lib/agency-communications-api/${f}.ts`);
  check(`api ${f}: owner-only + caller.agencyId`, /requireAgencyOwnerAny\(request\)/.test(s) && /caller\.agencyId/.test(s));
}
// test-send renders the posted content to one address and reads no agency data — owner-only is the gate.
check("api test-send: owner-only", /requireAgencyOwnerAny\(request\)/.test(src("src/lib/agency-communications-api/test-send.ts")));

console.log(`\nAgency Communications parity contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
