/**
 * Workspace Branding + Brand colors (Phase A, 2026-10-30) — contract checks.
 *
 * Offline:  pnpm exec tsx scripts/check-brand-kit.ts
 * Plus persistence/scoping against the Firestore emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     pnpm exec tsx --env-file=.env.local scripts/check-brand-kit.ts
 */
import { readFileSync } from "node:fs";
import {
  BRAND_COLORS_MAX,
  brandColorRole,
  getTenantBrandColors,
  isLightOnWhite,
  normalizeHex,
  readBrandColors,
  validateBrandColors,
} from "../src/lib/brand/brand-colors";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
}

console.log("Hex normalization");
check("#abc → #AABBCC, 2f5d50 → #2F5D50, spaces trimmed", normalizeHex("#abc") === "#AABBCC" && normalizeHex("2f5d50") === "#2F5D50" && normalizeHex("  #A9472b ") === "#A9472B");
check("invalid values refused", [null, undefined, "", "#12", "#12345", "#GGGGGG", "red", "rgb(0,0,0)", 123].every((v) => normalizeHex(v) === null));

console.log("Roles follow order");
check("1st Primary, 2nd Secondary, rest Accent", brandColorRole(0) === "primary" && brandColorRole(1) === "secondary" && [2, 3, 4, 5].every((i) => brandColorRole(i) === "accent"));
const ordered = getTenantBrandColors({ brandKit: { colors: [{ id: "a", hex: "#2F5D50", name: "Forest" }, { id: "b", hex: "#A9472B" }, { id: "c", hex: "#E9C46A" }] } });
const reordered = getTenantBrandColors({ brandKit: { colors: [{ id: "b", hex: "#A9472B" }, { id: "a", hex: "#2F5D50", name: "Forest" }, { id: "c", hex: "#E9C46A" }] } });
check("roles derived on read", ordered.map((c) => c.role).join() === "primary,secondary,accent" && ordered[0].name === "Forest");
check("reordering moves the role with the position, ids kept", reordered[0].id === "b" && reordered[0].role === "primary" && reordered[1].id === "a" && reordered[1].role === "secondary");

console.log("Validation for saving");
check("zero colors is valid", (() => { const r = validateBrandColors([]); return r.ok && r.colors.length === 0; })());
check(`more than ${BRAND_COLORS_MAX} refused`, !validateBrandColors(Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, hex: "#000000" }))).ok);
check(`exactly ${BRAND_COLORS_MAX} allowed`, validateBrandColors(Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, hex: "#000000" }))).ok);
const bad = validateBrandColors([{ id: "a", hex: "#2F5D50" }, { id: "b", hex: "nope" }]);
check("a row with an invalid hex is refused (never persisted), with a plain message", !bad.ok && /Color 2 needs a hex/.test(bad.ok ? "" : bad.error));
check("an empty row is refused", !validateBrandColors([{ id: "a", hex: "" }]).ok);
check("not a list → refused", !validateBrandColors("x").ok && !validateBrandColors({}).ok);
const named = validateBrandColors([{ id: "a", hex: "2f5d50", name: "  Forest  " }, { id: "b", hex: "#A9472B", name: "   " }, { id: "c", hex: "#123456", name: "x".repeat(80) }]);
check("hex normalized; names trimmed, optional, capped at 40", named.ok && named.colors[0].hex === "#2F5D50" && named.colors[0].name === "Forest" && !("name" in named.colors[1]) && named.colors[2].name!.length === 40);
const dupIds = validateBrandColors([{ id: "same", hex: "#111111" }, { id: "same", hex: "#222222" }, { id: "../evil", hex: "#333333" }]);
check("duplicate / unsafe ids replaced with fresh stable ids", dupIds.ok && new Set(dupIds.colors.map((c) => c.id)).size === 3 && dupIds.colors[0].id === "same" && dupIds.colors.every((c) => /^[A-Za-z0-9_-]+$/.test(c.id)));
check("duplicate colors are allowed", validateBrandColors([{ id: "a", hex: "#2F5D50" }, { id: "b", hex: "#2f5d50" }]).ok);
check("roles are never stored (no role key)", named.ok && named.colors.every((c) => !("role" in c)));

console.log("Lenient read of stored data");
check("absent / null kit = no colors", readBrandColors(undefined).length === 0 && readBrandColors(null).length === 0 && getTenantBrandColors(null).length === 0);
check("bad stored rows skipped, capped at 6", readBrandColors({ colors: [{ id: "a", hex: "bad" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, hex: "#101010" }))] }).length === 6);

console.log("Light-color hint (non-blocking)");
check("very light colors flagged; normal colors not", isLightOnWhite("#E9C46A") && isLightOnWhite("#FFFFFF") && !isLightOnWhite("#2F5D50") && !isLightOnWhite("#A9472B"));

console.log("Settings wiring");
const page = readFileSync("src/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page.tsx", "utf8");
const bp = page.slice(page.indexOf('active === "business-profile"'), page.indexOf('active === "branding"'));
const br = page.slice(page.indexOf('active === "branding"'), page.indexOf('active === "members"'));
check("Workspace nav: Business profile, then Branding", /item\("business-profile", "Business profile"\), item\("branding", "Branding"\)/.test(page));
check("Business profile no longer renders the logo editor", !bp.includes("<SubAccountBrandingSection") && bp.includes('hrefFor("branding")'));
check("Branding renders Brand colors + the existing logo editor", br.includes("<SubAccountBrandColorsSection") && br.includes("<SubAccountBrandingSection"));
const logoSection = readFileSync("src/components/settings/sub-account-branding-section.tsx", "utf8");
check("logo still saves subAccounts.logoUrl through the same /branding route", logoSection.includes("/api/sub-accounts/${subAccountId}/branding") && logoSection.includes("logoUrl: trimmed || null"));
const booking = readFileSync("src/components/booking/booking-page-editor.tsx", "utf8");
check("booking editor's logo link opens Branding", booking.includes("section=branding") && !booking.includes("section=business-profile"));

async function emulator() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { saveBrandColors, getTenantBrandColorsServerSide, BrandKitError } = await import("../src/lib/server/brand-kit-service");
  const db = getAdminDb();
  const A = "sa_brandkit_a";
  const B = "sa_brandkit_b";
  const surfaces = {
    logoUrl: "https://cdn.example.com/logo.png",
    portalBranding: { accentColor: "#5E2574", logoUrl: null },
    energeticDecoderTheme: { accent: "#7c3aed", logoUrl: null, chartDefinedColor: "#d4d4d8" },
  };
  await db.doc(`subAccounts/${A}`).set({ name: "A", agencyId: "ag", ...surfaces });
  await db.doc(`subAccounts/${B}`).set({ name: "B", agencyId: "ag", logoUrl: "https://cdn.example.com/b.png" });
  console.log("Persistence (emulator)");
  check("new workspace: zero brand colors", (await getTenantBrandColorsServerSide(A)).length === 0);
  await saveBrandColors(A, [{ id: "a", hex: "#2f5d50", name: "Forest" }, { id: "b", hex: "#A9472B" }]);
  let read = await getTenantBrandColorsServerSide(A);
  check("add + save persists in order with roles", read.map((c) => `${c.id}:${c.hex}:${c.role}`).join() === "a:#2F5D50:primary,b:#A9472B:secondary");
  await saveBrandColors(A, [{ id: "b", hex: "#A9472B" }, { id: "a", hex: "#2F5D50", name: "Forest" }, { id: "c", hex: "#E9C46A" }]);
  read = await getTenantBrandColorsServerSide(A);
  check("reorder + add persists; roles follow", read.map((c) => `${c.id}:${c.role}`).join() === "b:primary,a:secondary,c:accent");
  await saveBrandColors(A, [{ id: "a", hex: "#2F5D50" }]);
  check("remove persists", (await getTenantBrandColorsServerSide(A)).map((c) => c.id).join() === "a");
  let refused = false;
  try {
    await saveBrandColors(A, Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, hex: "#000000" })));
  } catch (e) {
    refused = e instanceof BrandKitError;
  }
  check("7 colors refused by the server, nothing written", refused && (await getTenantBrandColorsServerSide(A)).length === 1);
  const docA = (await db.doc(`subAccounts/${A}`).get()).data()!;
  check("logo and every surface color untouched", docA.logoUrl === surfaces.logoUrl && JSON.stringify(docA.portalBranding) === JSON.stringify(surfaces.portalBranding) && JSON.stringify(docA.energeticDecoderTheme) === JSON.stringify(surfaces.energeticDecoderTheme));
  const docB = (await db.doc(`subAccounts/${B}`).get()).data()!;
  check("other workspace unaffected (sub-account scoping)", !("brandKit" in docB) && (await getTenantBrandColorsServerSide(B)).length === 0 && docB.logoUrl === "https://cdn.example.com/b.png");
  await saveBrandColors(A, []);
  check("clearing to zero colors is allowed", (await getTenantBrandColorsServerSide(A)).length === 0);
}

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) await emulator();
  else console.log("(persistence skipped — set FIRESTORE_EMULATOR_HOST to run it)");
  console.log(`\nBrand kit: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
