/**
 * Tenant-brand boundary checks (design-system Phase 0). Pure — no Firestore.
 * Run: pnpm exec tsx scripts/check-tenant-brand.ts
 */
import { readFileSync } from "node:fs";
import { contrastRatio, ensureContrast, parseHex, readableOn, tenantBrandStyle } from "../src/lib/brand/tenant-brand";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
}

check("parses #rgb and #rrggbb", JSON.stringify(parseHex("#fff")) === "[255,255,255]" && JSON.stringify(parseHex("2F5D50")) === "[47,93,80]");
check("rejects non-hex", parseHex("rgb(1,2,3)") === null && parseHex("#12345") === null);
check("black/white contrast is 21", Math.round(contrastRatio("#000000", "#ffffff")) === 21);
check("white text on dark green", readableOn("#2f5d50") === "#ffffff");
check("dark text on light yellow (light tenant accent stays readable)", readableOn("#f7e27a") === "#111827");
check("on-primary always meets 4.5:1", ["#2f5d50", "#f7e27a", "#a2452b", "#ffd6e7", "#3d1652", "#22c55e"].every((c) => contrastRatio(c, readableOn(c)) >= 4.5));
check("ensureContrast darkens a light color to ≥ 4.5:1 on white", contrastRatio(ensureContrast("#f2c46f"), "#ffffff") >= 4.5);
check("ensureContrast leaves an already-dark color alone", ensureContrast("#3d1652") === "#3d1652");

const s = tenantBrandStyle({ name: "Juniper", primary: "#2F5D50", buttonShape: "pill", displayFont: "serif" }) as Record<string, string>;
check("style sets brand vars", s["--brand-primary"] === "#2F5D50" && s["--brand-on-primary"] === "#ffffff" && s["--brand-radius"] === "9999px");
check("unset brand emits no vars (keeps neutral defaults)", Object.keys(tenantBrandStyle({ name: "Plain" })).length === 0);
check("invalid color is ignored, not passed through", !("--brand-primary" in (tenantBrandStyle({ name: "X", primary: "red; background:url(x)" }) as object)));

const css = readFileSync(new URL("../src/styles/magnetix/tenant.css", import.meta.url), "utf8");
check("--brand-* is only declared inside .tenant-surface", !/:root\s*{[^}]*--brand-/.test(css) && /\.tenant-surface\s*{[^}]*--brand-primary/.test(css));
check("button shape never rewrites the card radius", !/--radius:\s*var\(--brand-radius\)/.test(css));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
