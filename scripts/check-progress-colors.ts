/**
 * Progress Bar + Progress Ring Brand colors (Phase C, 2026-10-30) — contract checks.
 *
 * Offline:  pnpm exec tsx scripts/check-progress-colors.ts
 * Plus tenant isolation + Brand Kit id stability against the Firestore emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     pnpm exec tsx --env-file=.env.local scripts/check-progress-colors.ts
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { accentColor, accentTrack, METRIC_ACCENT_OPTIONS } from "../src/lib/pages-funnels/data-metrics/accent";
import {
  PROGRESS_NEUTRAL_TRACK,
  normalizeProgressColor,
  resolveProgressColor,
} from "../src/lib/pages-funnels/data-metrics/progress-color";
import { ProgressBarRender } from "../src/components/pages-funnels/data-metrics/progress-bar";
import { ProgressRingRender } from "../src/components/pages-funnels/data-metrics/progress-ring";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";

(globalThis as { React?: typeof React }).React = React;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
}
type AnyProps = Record<string, unknown>;
const bar = (props: AnyProps) => renderToStaticMarkup(React.createElement(ProgressBarRender as unknown as React.ComponentType<AnyProps>, { id: "b", currentValue: 75, targetValue: 100, label: "Spots claimed", supportingText: "Almost there", ...props }));
const ring = (props: AnyProps) => renderToStaticMarkup(React.createElement(ProgressRingRender as unknown as React.ComponentType<AnyProps>, { id: "r", currentValue: 8, targetValue: 12, label: "Lessons", ...props }));

const FOREST = { id: "c_forest", hex: "#2F5D50", name: "Forest" };
const CLAY = { id: "c_clay", hex: "#A9472B", name: "Clay" };
const kit = [FOREST, CLAY];

console.log("Magnetix (default + backward compatibility)");
check("every Magnetix accent resolves exactly as before (fill, track)", METRIC_ACCENT_OPTIONS.every(({ value }) => {
  const r = resolveProgressColor({ accent: value });
  return r.fill === accentColor(value) && r.track === accentTrack(value) && r.notice === null;
}));
check("old block (no color field) renders byte-for-byte like an explicit Magnetix block — bar", bar({ accent: "aqua" }) === bar({ accent: "aqua", color: { source: "magnetix" } }));
check("old block renders like an explicit Magnetix block — ring", ring({ accent: "gold" }) === ring({ accent: "gold", color: { source: "magnetix" } }));
check("old bar markup keeps the plum fill + tinted track", bar({}).includes(`background:${accentColor("plum")}`) && bar({}).includes(`background:${accentTrack("plum")}`));
check("old ring markup keeps the plum stroke", ring({}).includes(`stroke="${accentColor("plum")}"`));
check("'Page text color' still leaves supporting text uncolored", !/Almost there/.test(bar({ accent: "default" }).match(/<p[^>]*style="color:[^"]*"[^>]*>Almost there/)?.[0] ?? ""));
check("garbage color setting → Magnetix", normalizeProgressColor({ source: "nope" }).source === "magnetix" && normalizeProgressColor(null).source === "magnetix");

console.log("Brand color (live, by stable id)");
const pickForest = { source: "brand", brandColorId: FOREST.id };
check("selection: renders the chosen Brand color", resolveProgressColor({ color: pickForest, brandKit: kit }).fill === "#2F5D50");
check("Brand/Custom fills sit on a neutral track (not a competing color)", resolveProgressColor({ color: pickForest, brandKit: kit }).track === PROGRESS_NEUTRAL_TRACK && PROGRESS_NEUTRAL_TRACK.includes("--color-ink"));
check("the block stores only the id — never the hex", JSON.stringify(normalizeProgressColor(pickForest)) === JSON.stringify({ source: "brand", brandColorId: "c_forest" }));
check("reorder the Brand Kit (Clay becomes Primary): still Forest", resolveProgressColor({ color: pickForest, brandKit: [CLAY, FOREST] }).fill === "#2F5D50");
check("edit Forest's hex in Branding: the block follows, no page edit", resolveProgressColor({ color: pickForest, brandKit: [{ ...FOREST, hex: "#1E4038" }, CLAY] }).fill === "#1E4038");
const removed = resolveProgressColor({ accent: "plum", color: pickForest, brandKit: [CLAY] });
check("delete Forest: falls back to the Magnetix color (not Clay, not transparent) + notice", removed.fill === accentColor("plum") && removed.notice === "brand-color-removed" && removed.fill !== "#A9472B");
const none = resolveProgressColor({ accent: "aqua", color: pickForest, brandKit: [] });
check("zero Brand colors: Magnetix color + 'No brand colors saved yet' notice", none.fill === accentColor("aqua") && none.notice === "no-brand-colors");
check("no Brand Kit passed at all behaves like zero colors", resolveProgressColor({ color: pickForest }).notice === "no-brand-colors");

console.log("Custom");
check("custom hex is normalized and used", resolveProgressColor({ color: { source: "custom", custom: "#a9472b" } }).fill === "#A9472B");
check("invalid custom value is never stored", !("custom" in normalizeProgressColor({ source: "custom", custom: "#12" })));
check("custom with nothing picked: Magnetix plum, never black", resolveProgressColor({ color: { source: "custom" } }).fill === "#5E2574");

console.log("Rendering");
const brandBar = bar({ color: pickForest, brandKit: kit });
check("bar: Brand fill + neutral track + supporting text in the color", brandBar.includes("background:#2F5D50") && brandBar.includes(`background:${PROGRESS_NEUTRAL_TRACK}`) && brandBar.includes("color:#2F5D50"));
const brandRing = ring({ color: pickForest, brandKit: kit });
check("ring: Brand stroke on the fill, neutral track", brandRing.includes('stroke="#2F5D50"') && brandRing.includes(`stroke="${PROGRESS_NEUTRAL_TRACK}"`));
check("custom bar + ring render the custom hex", bar({ color: { source: "custom", custom: "#264653" } }).includes("background:#264653") && ring({ color: { source: "custom", custom: "#264653" } }).includes('stroke="#264653"'));
check("deleted Brand color: builder shows the warning", bar({ color: pickForest, brandKit: [CLAY], editing: true }).includes("This brand color is no longer available. Choose another color."));
check("…visitors never see it", !bar({ color: pickForest, brandKit: [CLAY] }).includes("no longer available") && !ring({ color: pickForest, brandKit: [] }).includes("No brand colors"));
check("zero Brand colors: builder note on the ring", ring({ color: pickForest, brandKit: [], editing: true }).includes("No brand colors saved yet"));
check("accessibility kept: role=progressbar with min/max/now/valuetext, labelled", [brandBar, brandRing].every((h) => /role="progressbar"/.test(h) && /aria-valuemin="0"/.test(h) && /aria-valuemax=/.test(h) && /aria-valuenow=/.test(h) && /aria-valuetext=/.test(h) && /aria-labelledby=/.test(h)));
check("percentage text still shown (color is never the only signal)", brandBar.includes("75%") && brandRing.includes("67%"));

console.log("Sidebar config");
const comps = clientPuckConfig.components as Record<string, { resolveFields?: (d: unknown, p: unknown) => Record<string, unknown>; fields?: Record<string, { label?: string; type?: string }>; defaultProps?: Record<string, unknown> }>;
for (const [name, label] of [["ProgressBar", "Bar color"], ["ProgressRing", "Ring color"]] as const) {
  const cfg = comps[name];
  const keys = Object.keys(cfg.fields!);
  check(`${name}: "${label}" (Magnetix · Brand color · Custom) sits where the color always was, in General`, cfg.fields!.color?.label === label && cfg.fields!.color?.type === "custom" && keys.indexOf("color") + 1 === keys.indexOf("accent"));
  check(`${name}: the named Magnetix colors are now "Magnetix color"`, cfg.fields!.accent?.label === "Magnetix color");
  const f = (color: unknown) => Object.keys(cfg.resolveFields!({ props: { ...cfg.defaultProps, color } }, { fields: cfg.fields }));
  check(`${name}: Magnetix color shows only for Magnetix (and for old blocks)`, f(undefined).includes("accent") && f({ source: "magnetix" }).includes("accent") && !f({ source: "brand" }).includes("accent") && !f({ source: "custom" }).includes("accent"));
  check(`${name}: new blocks default to Magnetix plum`, JSON.stringify(cfg.defaultProps!.color) === JSON.stringify({ source: "magnetix" }) && cfg.defaultProps!.accent === "plum");
}

console.log("Wiring (source)");
const src = (p: string) => readFileSync(p, "utf8");
check("published page passes its OWN workspace's Brand Kit (with ids)", /brandKit = tenantBrand\.map/.test(src("src/app/p/[pageId]/page.tsx")) && src("src/app/p/[pageId]/page.tsx").includes("getTenantBrandColorsServerSide(page.subAccountId)"));
check("Reading Result pages pass the Brand Kit too", src("src/components/pages-funnels/reading-result-page-view.tsx").includes("brandKit, pageId"));
check("builder + Preview pass the open workspace's Brand Kit", src("src/components/pages-funnels/puck/editor-shell.tsx").includes("getTenantBrandColors(workspace?.subAccount).map(({ id, hex, name })") && src("src/app/(builder)/sa/[subAccountId]/pages-funnels/[pageId]/new-builder/preview/page.tsx").includes("brandKit: JSON.parse(brandKitKey)"));
check("blocks read the Brand Kit from page metadata", (src("src/components/pages-funnels/puck/data-metrics-config.tsx").match(/brandKit=\{\(puck\.metadata/g) ?? []).length === 2);
check("no agency / portal / decoder colors are read", !/portalBranding|energeticDecoderTheme|appTheme/.test(src("src/lib/pages-funnels/data-metrics/progress-color.ts") + src("src/components/pages-funnels/puck/progress-color-fields.tsx")));

async function emulator() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { getTenantBrandColorsServerSide, saveBrandColors } = await import("../src/lib/server/brand-kit-service");
  const db = getAdminDb();
  const A = "sa_progress_a";
  const B = "sa_progress_b";
  await db.doc(`subAccounts/${A}`).set({ name: "A", portalBranding: { accentColor: "#FF00FF" } });
  await db.doc(`subAccounts/${B}`).set({ name: "B", brandKit: { colors: [{ id: "c_forest", hex: "#123456" }] } });
  console.log("Brand Kit ids + tenant isolation (emulator)");
  await saveBrandColors(A, [{ id: "c_forest", hex: "#2F5D50", name: "Forest" }, { id: "c_clay", hex: "#A9472B", name: "Clay" }]);
  await saveBrandColors(A, [{ id: "c_clay", hex: "#A9472B", name: "Clay" }, { id: "c_forest", hex: "#1E4038", name: "Forest" }]);
  const a = await getTenantBrandColorsServerSide(A);
  check("a saved reorder + hex edit keeps each color's id", a.map((c) => `${c.id}:${c.hex}`).join() === "c_clay:#A9472B,c_forest:#1E4038");
  check("so a Forest pick resolves to the edited Forest, still", resolveProgressColor({ color: pickForest, brandKit: a }).fill === "#1E4038");
  const b = await getTenantBrandColorsServerSide(B);
  check("another workspace with the same id resolves only its own color", resolveProgressColor({ color: pickForest, brandKit: b }).fill === "#123456");
  await db.doc(`subAccounts/${A}`).update({ brandKit: { colors: [] } });
  check("a workspace with only a portal accent: no Brand colors (portal accent not used)", (await getTenantBrandColorsServerSide(A)).length === 0);
}

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) await emulator();
  else console.log("(emulator checks skipped — set FIRESTORE_EMULATOR_HOST to run them)");
  console.log(`\nProgress colors: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
