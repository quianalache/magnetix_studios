/**
 * Booking appearance (approved Section 4.8 tenant controls, 2026-10-14):
 * validation, the curated font allowlist, and the tenant-brand boundary.
 * No browser, no data.
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/check-booking-appearance.ts
 */
import { readFileSync } from "node:fs";
import { validateAccentColor, validateBrandName, validateDisplayFont, validateBookingPageFormData } from "../src/lib/booking/validation";
import { defaultBookingPageFormData } from "../src/lib/booking/defaults";
import { BOOKING_DISPLAY_FONTS } from "../src/types/booking";
import { TENANT_DISPLAY_FONTS, tenantBrandStyle, contrastRatio } from "../src/lib/brand/tenant-brand";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Font allowlist — booking fonts are exactly the curated tenant fonts.
check("booking fonts === curated TENANT_DISPLAY_FONTS keys", JSON.stringify([...BOOKING_DISPLAY_FONTS].sort()) === JSON.stringify(Object.keys(TENANT_DISPLAY_FONTS).sort()));
check("display font: curated key accepted", validateDisplayFont("dm-serif-display").ok && validateDisplayFont("serif").ok);
check("display font: blank = default (null)", (() => { const r = validateDisplayFont(""); return r.ok && r.value === null; })());
for (const bad of ["Comic Sans MS", "url(https://evil.example/font.woff)", "serif; color:red", 42]) {
  check(`display font: rejects arbitrary value ${JSON.stringify(bad)}`, !validateDisplayFont(bad).ok);
}
check("brand name: trimmed, blank = inherit", (() => { const a = validateBrandName("  Juniper  "); const b = validateBrandName("   "); return a.ok && a.value === "Juniper" && b.ok && b.value === null; })());
check("brand name: capped at 80 chars", !validateBrandName("x".repeat(81)).ok);
check("accent: hex only", validateAccentColor("#2f5d50").ok && !validateAccentColor("green").ok && !validateAccentColor("#12345").ok);

// Full form round-trip keeps the new fields; legacy docs without them still validate.
const base = { ...defaultBookingPageFormData("test", "America/New_York"), name: "Discovery call" };
const withAppearance = validateBookingPageFormData({ ...base, brandName: "Juniper Wellness", displayFont: "serif", accentColor: "#2F5D50" });
check("form: appearance fields round-trip", withAppearance.ok && withAppearance.value.brandName === "Juniper Wellness" && withAppearance.value.displayFont === "serif" && withAppearance.value.accentColor === "#2F5D50");
const legacy: Record<string, unknown> = { ...base };
delete legacy.brandName;
delete legacy.displayFont;
const legacyRes = validateBookingPageFormData(legacy);
check("form: legacy page without the new fields still validates (null = inherit)", legacyRes.ok && legacyRes.value.brandName === null && legacyRes.value.displayFont === null);

// Tenant style: font + weight + readable contrast.
const st = tenantBrandStyle({ name: "x", primary: "#F2D04B", displayFont: "dm-serif-display" }) as Record<string, string>;
check("style: display font variable set from the allowlist", st["--brand-display-font"] === TENANT_DISPLAY_FONTS["dm-serif-display"] && st["--brand-display-weight"] === "400");
check("style: light accent → readable on-primary text (≥ 4.5:1)", contrastRatio("#F2D04B", st["--brand-on-primary"]) >= 4.5);
check("style: no accent → no brand vars (neutral fallback)", Object.keys(tenantBrandStyle({ name: "x" })).length === 0);

// Boundary: tenant tokens stay out of the CRM; the CRM scope stays off the public page.
const view = src("src/components/booking/public-booking-view.tsx");
const page = src("src/app/b/[subAccountId]/[slug]/page.tsx");
check("public page: brand name falls back to the sub-account name", page.includes("page.brandName || sub.name"));
check("public page: display font passed through the tenant style", view.includes("displayFont: branding.displayFont ?? null"));
check("public page: no CRM scope class", !view.includes("mx-crm"));
const editor = src("src/components/booking/booking-page-editor.tsx");
check("editor: Appearance section with live preview", editor.includes('title="Appearance"') && editor.includes("<BookingAppearancePreview"));
check("editor: font control is a radio group of the curated fonts", editor.includes('role="radiogroup"') && editor.includes("DISPLAY_FONT_CHOICES"));
check("preview: uses the same tenant classes as the public page", src("src/components/booking/booking-appearance-preview.tsx").includes("tenant-surface tenant-wash"));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
