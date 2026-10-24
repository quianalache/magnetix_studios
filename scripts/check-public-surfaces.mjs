#!/usr/bin/env node
/**
 * Tenant / Public Surfaces contract (owner-approved, 2026-10-16). Static
 * source checks; no server, no Firebase.
 *
 * Run: node scripts/check-public-surfaces.mjs
 */
import { existsSync, readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
const src = (f) => readFileSync(f, "utf8");
/** Source without comments, so a check sees code, not the notes explaining it. */
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\s*\}/g, "");
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

const shell = src("src/components/public/public-shell.tsx");
check("shared shells exist: PublicAuthShell + PublicStateShell", /export function PublicAuthShell/.test(shell) && /export function PublicStateShell/.test(shell));
check("tenant variant uses tenantBrandStyle; Magnetix variant is the .public-magnetix preset", shell.includes("tenantBrandStyle(variant.brand)") && shell.includes("public-magnetix"));

for (const f of [
  "src/app/(auth)/login/page.tsx",
  "src/app/my/login/page.tsx",
  "src/app/portal/portal-login-view.tsx",
  "src/app/c/[saId]/login/page.tsx",
  "src/app/c/[saId]/signup/page.tsx",
  "src/app/course/[saId]/login/page.tsx",
  "src/app/member-password/[saId]/reset/page.tsx",
  "src/app/my/password/reset/page.tsx",
]) {
  check(`sign-in uses PublicAuthShell: ${f}`, src(f).includes("<PublicAuthShell"));
}
check("MyMagnetix + staff sign-in are the Magnetix variant", src("src/app/my/login/page.tsx").includes('kind: "magnetix"') && src("src/app/(auth)/login/page.tsx").includes('kind: "magnetix"'));
check("portal sign-in is the tenant variant fed only by portal branding", /kind: "tenant", brand: \{ name: displayName, logoUrl: branding\.logoUrl, primary: branding\.accentColor \}/.test(src("src/app/portal/portal-login-view.tsx")));

const ck = src("src/components/public/public-checkout-shell.tsx");
check("checkout accent = the page's own theme button color", ck.includes("primary: theme.hero.buttonColor"));
for (const f of ["src/components/course-offers/offer-sales-page-view.tsx", "src/components/standalone-courses/course-sales-page-view.tsx"]) {
  const s = src(f);
  check(`${f}: CheckoutFrame + BuyCard + StickyBuyBar`, s.includes("<CheckoutFrame") && s.includes("<BuyCard") && s.includes("<StickyBuyBar"));
  check(`${f}: no "Powered by" on paid pages`, !/PoweredByMagnetix|Powered by/.test(code(f)));
  check(`${f}: no letter placeholders (charAt(0) thumbnails)`, !/title\.charAt\(0\)/.test(s));
  check(`${f}: theme hero still honored`, s.includes("theme.hero.visible") && s.includes("theme.hero.buttonText"));
}
check("checkout shell never renders Powered by", !/PoweredByMagnetix|Powered by/.test(code("src/components/public/public-checkout-shell.tsx")));

for (const f of [
  "src/app/not-found.tsx",
  "src/app/e/[token]/not-found.tsx",
  "src/app/q/[token]/not-found.tsx",
  "src/app/f/[formId]/not-found.tsx",
  "src/app/b/[subAccountId]/[slug]/not-found.tsx",
  "src/app/offer/[saId]/[offerId]/not-found.tsx",
  "src/app/course/[saId]/[courseId]/not-found.tsx",
  "src/app/member-password/[saId]/reset/not-found.tsx",
  "src/app/my/password/reset/not-found.tsx",
]) {
  check(`state page exists and uses PublicStateShell: ${f}`, existsSync(f) && src(f).includes("<PublicStateShell"));
}
for (const f of ["src/app/pay/[token]/status/page.tsx", "src/app/pay/charge/[token]/status/page.tsx"]) {
  const s = code(f);
  const invalid = s.indexOf("if (!found)");
  const received = s.indexOf('"Payment received"');
  check(`${f}: an unverified link shows "isn't valid" before any success copy`, invalid > 0 && received > invalid && s.includes("This payment link isn't valid"));
}
check("replay errors use the state shell; the working player stays dark", src("src/app/replay/[token]/page.tsx").includes("<PublicStateShell") && src("src/app/replay/[token]/page.tsx").includes("bg-neutral-950"));
for (const f of ["src/lib/unsubscribe-pages/tenant.tsx", "src/lib/unsubscribe-pages/agency.tsx"]) {
  const s = src(f);
  check(`${f}: state shell; still POSTs once on mount (no GET side effect)`, s.includes("<PublicStateShell") && /method: "POST"/.test(s) && s.includes("useEffect"));
}

const ev = src("src/components/booking/public-event-view.tsx");
check("booking /e footer credits Magnetix, not the business", ev.includes("<PoweredByMagnetix />") && !ev.includes("Powered by {props.branding.name}"));

const form = src("src/app/f/[formId]/page.tsx");
check("hosted form header names the business (sub-account name), not CUSTOM_BRAND", form.includes("getSubAccountPublicName(form.subAccountId)") && !/<span className="font-medium text-foreground">\{CUSTOM_BRAND\.name\}<\/span>/.test(form));
check("hosted form keeps its Powered by footer", form.includes("Powered by {CUSTOM_BRAND.name}"));

check("Decoder brand card stays removed", !/function BrandCard|Save brand/.test(src("src/components/energetic-decoder/chart-designs-tab.tsx")));
check("public Decoder report is plain (no brand wash)", src("src/app/decoder/[saId]/report/[readingId]/page.tsx").includes("public-plain"));

const ident = src("src/lib/server/public-identity.ts");
check("public identity reads only the existing name fields (no new brand settings)", !/brand|accent|logo/i.test(ident.replace(/\/\*\*[\s\S]*?\*\//g, "")));

check("offer/course titles go through the same access check as the page", src("src/app/offer/[saId]/[offerId]/page.tsx").includes('requireOfferPageAccess(saId, offerId);\n    if (access.kind === "notFound") return {};') && src("src/app/course/[saId]/[courseId]/page.tsx").includes('requireCoursePageAccess(saId, courseId);\n    if (access.kind === "notFound") return {};'));
check("not-found boundaries carry server metadata titles (not only the client-hoisted <title>)", ["src/app/not-found.tsx", "src/app/f/[formId]/not-found.tsx", "src/app/e/[token]/not-found.tsx", "src/app/q/[token]/not-found.tsx", "src/app/b/[subAccountId]/[slug]/not-found.tsx", "src/app/offer/[saId]/[offerId]/not-found.tsx", "src/app/course/[saId]/[courseId]/not-found.tsx", "src/app/my/password/reset/not-found.tsx", "src/app/member-password/[saId]/reset/not-found.tsx"].every((f) => /export const metadata: Metadata = \{ title: "/.test(src(f))));
check("community title only for a published group", src("src/app/c/[saId]/[groupSlug]/layout.tsx").includes('group.status === "published" ? { title: group.name }'));

// 2026-10-17 correction pass (owner live QA).
const join = code("src/app/webinar/join/[token]/page.tsx");
const room = code("src/components/webinar/webinar-room-client.tsx");
check("webinar join: invalid link is a state card with its own title", join.includes("<PublicStateShell") && join.includes("This webinar link isn't valid") && join.includes("generateMetadata"));
check("webinar join: client failures are state cards, never raw error text", room.includes("<PublicStateShell") && !/text-destructive/.test(room) && !/data\.error/.test(room));
check("booking /e names the business above the title (not in the footer) and has a title", /\{props\.branding\.name && \(\s*<p/.test(ev) && src("src/app/e/[token]/page.tsx").includes("generateMetadata"));
check("community signup has its own browser title", src("src/app/c/[saId]/signup/page.tsx").includes("generateMetadata"));
check("staff login: the shell owns the heading — no inner Log In card", !/CardTitle|Log In/.test(code("src/components/auth/login-form.tsx")) && !src("src/app/(auth)/login/page.tsx").includes("card={false}"));
check("invalid reset cards link back to sign-in", src("src/app/my/password/reset/not-found.tsx").includes('href="/my/login"') && src("src/app/member-password/[saId]/reset/page.tsx").includes("Go to sign in"));
check("member reset sign-in link is rebuilt from the workspace id, never taken from next", !/href=\{sp\.next|href=\{next/.test(src("src/app/member-password/[saId]/reset/page.tsx")));
for (const f of ["src/lib/unsubscribe-pages/tenant.tsx", "src/lib/unsubscribe-pages/agency.tsx"]) {
  check(`unsubscribe: invalid link says so (${f})`, src(f).includes("This unsubscribe link isn't valid"));
}
check("hosted form page background is the form's own --background, never a platform wash", !/from-indigo-500\/5|tenant-wash|public-cloud/.test(code("src/app/f/[formId]/page.tsx")) && code("src/app/f/[formId]/page.tsx").includes("bg-background"));
for (const f of ["src/app/(builder)/sa/[subAccountId]/courses/offers/[offerId]/theme/page.tsx", "src/app/(builder)/sa/[subAccountId]/courses/[courseId]/theme/page.tsx"]) {
  check(`checkout editor only links the public page once published (${f})`, /(offer\?\.visibility === "published"|course\?\.published) \?/.test(src(f)));
}

// ── Tenant + Public Surfaces Visual Direction 2 (2026-10-24) ─────────────
check("Magnetix-owned pages show the configured platform mark (not the template badge)", shell.includes("CUSTOM_BRAND.logoPath") && src("src/config/landing.ts").includes('logoPath: "/magnetix-logo.png"'));
check("staff sign-up uses the shared auth shell (Magnetix variant), no inner card", src("src/app/(auth)/signup/page.tsx").includes("<PublicAuthShell") && !/CardTitle|<Card\b/.test(code("src/components/auth/signup-form.tsx")));
{
  const my = src("src/app/my/(app)/layout.tsx");
  check("MyMagnetix renders inside the Visual Direction 2 token scope", my.includes("<CrmScope>") && my.includes("min-w-0 flex-1 flex-col"));
  check("MyMagnetix has no gradient promo slab or disabled Discover button", !/linear-gradient|Explore Discover/.test(code("src/app/my/(app)/layout.tsx")));
  const home = code("src/app/my/(app)/page.tsx");
  check("MyMagnetix Home: every 'View all' is a real link (no dead spans)", !/<span[^>]*>View (all|calendar)<\/span>/.test(home));
  check("MyMagnetix Home: no gradient banners (TileCover instead)", !home.includes("gradientForId") && home.includes("<TileCover"));
  check("MyMagnetix nav: Your Spaces anchor matches the section id", src("src/lib/mymagnetix/nav.ts").includes('"/my#mymagnetix-spaces"') && src("src/app/my/(app)/page.tsx").includes('id="mymagnetix-spaces"'));
  check("MyMagnetix Settings: no internal developer copy", !/upcoming member|approved settings surface/.test(src("src/components/mymagnetix/settings-view.tsx")));
  check("MyMagnetix payment history has a phone list (no 6-column table at 390)", src("src/components/mymagnetix/payment-history-table.tsx").includes("sm:hidden") && src("src/components/mymagnetix/payment-history-table.tsx").includes("hidden overflow-x-auto"));
}
for (const f of ["src/app/thank-you/page.tsx", "src/app/founderx/page.tsx", "src/app/affiliate/login/page.tsx", "src/app/affiliate/dashboard/page.tsx", "src/app/affiliate/dashboard/conversions/page.tsx", "src/app/affiliate-program/page.tsx"]) {
  check(`unbuilt stub renders the branded not-found state, never placeholder text (${f})`, src(f).includes("notFound()") && !src(f).includes("hello world"));
}
{
  const fs = src("src/components/pages-funnels/puck/form-server.tsx");
  check("published pages never show form editor placeholders", fs.includes("const published = metadata?.resolvedEmbeds !== undefined") && fs.includes("if (published && !resolvedForm) return null"));
}
{
  const q = src("src/app/q/[token]/page.tsx");
  check("public quote: tenant surface + business identity, not the template badge", q.includes("tenant-surface public-plain") && q.includes("<TenantIdentity") && !q.includes("LogoMark"));
  const qv = code("src/components/quotes/public-quote-view.tsx");
  check("public quote: no fixed green/rose/amber, totals block spans its width, shared Select", !/emerald-|rose-|amber-/.test(qv) && qv.includes("ml-auto w-full max-w-xs") && !qv.includes("<select"));
}
{
  const w = src("src/app/webinar/[subAccountId]/[webinarSlug]/page.tsx");
  check("webinar registration: tenant surface with the webinar's own title, unknown webinar → state page", w.includes("publicSurfaceProps") && w.includes("notFound()") && src("src/app/webinar/[subAccountId]/[webinarSlug]/not-found.tsx").includes("<PublicStateShell"));
  check("webinar registration: no unapproved Powered by", !/PoweredBy/.test(code("src/app/webinar/[subAccountId]/[webinarSlug]/page.tsx")));
}
for (const k of ["course", "offer"]) {
  const pc = `src/app/${k}/[saId]/[${k}Id]/purchase-complete`;
  check(`${k} purchase-complete sits on the tenant surface (theme brand), no hard-coded hex`, src(`${pc}/page.tsx`).includes("publicSurfaceProps") && !/\[#[0-9A-Fa-f]{6}\]/.test(src(`${pc}/purchase-complete-status.tsx`)));
}
check("portal Billing passes plain quote summaries to its client component", src("src/app/portal/portal-home-view.tsx").includes("quotes={quotes.map(toPortalQuoteSummary)}"));
check("learner views hide an empty coach block (editor preview keeps it)", src("src/components/standalone-courses/standalone-lesson-player.tsx").includes("hideWhenEmpty={interactive}") && src("src/components/standalone-courses/theme-blocks.tsx").includes("hideWhenEmpty &&"));
check("course curriculum: no letter placeholders", !/title\.charAt\(0\)/.test(src("src/components/standalone-courses/course-curriculum-nav.tsx")));

console.log(`\nPublic surfaces contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
