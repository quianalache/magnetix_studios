/**
 * Chart colors + Brand colors integration (Phase B, 2026-10-30) — contract checks.
 *
 * Offline:  pnpm exec tsx scripts/check-chart-colors.ts
 * Plus tenant isolation against the Firestore emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     pnpm exec tsx --env-file=.env.local scripts/check-chart-colors.ts
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MAGNETIX_PALETTE_HEX,
  brandColorSequence,
  colorDistance,
  colorModesFor,
  defaultRowColor,
  effectiveColorMode,
  hasLookAlikeNeighbors,
  normalizeChartColors,
  resolveChartColors,
  shadesRamp,
} from "../src/lib/pages-funnels/data-metrics/chart-colors";
import { normalizeHex } from "../src/lib/brand/brand-colors";
import { contrastRatio } from "../src/lib/brand/tenant-brand";
import { ChartRender } from "../src/components/pages-funnels/data-metrics/chart";
import { CHART_TYPE_SHORT } from "../src/components/pages-funnels/puck/chart-fields";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";

(globalThis as { React?: typeof React }).React = React;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
}
const html = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(ChartRender as unknown as React.ComponentType<Record<string, unknown>>, { id: "c", ...props }));
const rows = [
  { label: "Cookies", value: 40 },
  { label: "Brownies", value: 25 },
  { label: "Cupcakes", value: 20 },
  { label: "Pies", value: 15 },
  { label: "Tarts", value: 10 },
  { label: "Scones", value: 5 },
];
const data = rows.map((_, index) => ({ index }));

console.log("Modes by chart type");
check("Bar / Horizontal bar: Magnetix palette, Brand colors, One color, Custom", ["bar", "horizontalBar"].every((t) => colorModesFor(t as "bar").join() === "palette,brand,single,custom"));
check("Pie / Donut: Magnetix palette, Brand colors, Shades, Custom (no One color)", ["pie", "donut"].every((t) => colorModesFor(t as "pie").join() === "palette,brand,shades,custom"));
check("Line / Area: no Colors menu (single color control)", colorModesFor("line").length === 0 && colorModesFor("area").length === 0);
check("a setting carried across types maps sensibly", effectiveColorMode("pie", "single") === "shades" && effectiveColorMode("bar", "shades") === "single" && effectiveColorMode("line", "custom") === "single" && effectiveColorMode("bar", "nonsense") === "palette");
check("stored setting is sanitized", JSON.stringify(normalizeChartColors({ mode: "x", base: "abc" })) === JSON.stringify({ mode: "palette", base: "#AABBCC" }) && normalizeChartColors(null).mode === "palette");

console.log("Resolution");
const res = (type: string, setting: object, brand: string[] = [], extra: { color?: string }[] = []) =>
  resolveChartColors({ type: type as "bar", setting: setting as never, data: data.map((d, i) => ({ ...d, ...(extra[i] ?? {}) })), rowCount: rows.length, brandColors: brand });
check("Magnetix palette: the existing palette tokens, one per row", res("bar", { mode: "palette" }).colors[0] === "var(--color-plum-700)" && new Set(res("bar", { mode: "palette" }).colors).size === 6);
check("One color: every bar the chosen color", res("bar", { mode: "single", base: "#2f5d50" }).colors.every((c) => c === "#2F5D50"));
check("One color with no choice: Magnetix plum", res("bar", { mode: "single" }).colors.every((c) => c === MAGNETIX_PALETTE_HEX[0]));
const shades = shadesRamp("#2F5D50", 6);
check("Shades: 6 distinct steps, dark → light, none near-white", new Set(shades).size === 6 && contrastRatio(shades[0], "#FFFFFF") > contrastRatio(shades[5], "#FFFFFF") && shades.every((c) => contrastRatio(c, "#FFFFFF") > 1.15));
check("Shades: neighbors never look alike", !hasLookAlikeNeighbors(shadesRamp("#2F5D50", 6)) && !hasLookAlikeNeighbors(shadesRamp("#5E2574", 5)));
check("Line/Area: one series color (chosen or plum token)", res("line", { mode: "custom", base: "#A9472B" }).colors.every((c) => c === "#A9472B") && res("area", { mode: "palette" }).colors.every((c) => c === "var(--color-plum-700)"));
const custom = res("bar", { mode: "custom" }, [], [{ color: "#111111" }, {}, { color: "nope" }]);
check("Custom: a row's color is used; missing/invalid falls back to its palette color", custom.colors[0] === "#111111" && custom.colors[1] === MAGNETIX_PALETTE_HEX[1] && custom.colors[2] === MAGNETIX_PALETTE_HEX[2]);

console.log("Brand colors");
check("zero saved: Brand mode shows the palette AND says so (brandMissing)", (() => { const r = res("bar", { mode: "brand" }, []); return r.brandMissing && r.colors[0] === "var(--color-plum-700)"; })());
const one = brandColorSequence(["#2F5D50"], 6);
check("one saved color: 6 distinct, recognizably related steps, neighbors distinct", one[0] === "#2F5D50" && new Set(one).size === 6 && !hasLookAlikeNeighbors(one));
const two = brandColorSequence(["#2F5D50", "#A9472B"], 6);
check("two saved colors, six rows: A, B, then lighter/darker A, B — never Magnetix colors", two[0] === "#2F5D50" && two[1] === "#A9472B" && new Set(two).size === 6 && two.every((c) => !(MAGNETIX_PALETTE_HEX as readonly string[]).includes(c)));
check("no immediate duplicate neighbors (incl. wrap-around for pie)", !hasLookAlikeNeighbors(two, true));
const six = ["#2F5D50", "#A9472B", "#E9C46A", "#264653", "#E76F51", "#8AB17D"];
check("six saved colors, six rows: exactly the saved colors in order", JSON.stringify(brandColorSequence(six, 6)) === JSON.stringify(six));
const light = brandColorSequence(["#E9C46A"], 4);
check("light brand color: variants never go near-white", light.every((c) => contrastRatio(c, "#FFFFFF") > 1.25), light.join());
const dark = brandColorSequence(["#111111"], 4);
check("dark brand color: variants never go near-black-on-black", dark.slice(1).every((c) => colorDistance(c, "#000000") > 60), dark.join());
check("deterministic", JSON.stringify(brandColorSequence(["#2F5D50", "#A9472B"], 9)) === JSON.stringify(brandColorSequence(["#2F5D50", "#A9472B"], 9)));
const before = res("pie", { mode: "brand" }, ["#2F5D50", "#A9472B"]).colors;
const afterKit = res("pie", { mode: "brand" }, ["#A9472B", "#2F5D50", "#E9C46A"]).colors;
check("live reference: changing/reordering the Brand Kit changes the chart, no chart edit needed", before[0] === "#2F5D50" && afterKit[0] === "#A9472B" && afterKit[2] === "#E9C46A");
check("the chart setting never stores brand colors", JSON.stringify(normalizeChartColors({ mode: "brand" })) === JSON.stringify({ mode: "brand", base: "" }));
check("a row keeps its brand color when the chart is re-sorted", (() => {
  const sorted = resolveChartColors({ type: "bar", setting: { mode: "brand" }, data: [{ index: 3 }, { index: 0 }], rowCount: 4, brandColors: ["#2F5D50", "#A9472B", "#E9C46A", "#264653"] });
  return sorted.colors[0] === "#264653" && sorted.colors[1] === "#2F5D50";
})());

console.log("Custom row colors");
const comps = clientPuckConfig.components as Record<string, { resolveData?: (d: unknown, p: unknown) => { props: Record<string, unknown> }; resolveFields?: (d: unknown, p: unknown) => Record<string, { arrayFields?: Record<string, unknown> }>; fields?: Record<string, unknown>; defaultProps?: Record<string, unknown> }>;
const chartCfg = comps.Chart;
const resolvedRows = (props: Record<string, unknown>) => (chartCfg.resolveData!({ props: { ...chartCfg.defaultProps, ...props } }, {}) as { props: { rows: { label: string; color?: string }[] } }).props.rows;
const filled = resolvedRows({ colors: { mode: "custom", base: "" }, rows: [{ label: "A", value: 1 }, { label: "B", value: 2, color: "#123456" }, { label: "C", value: 3 }] });
check("switching to Custom gives every row a palette color (never black), keeps chosen ones", filled[0].color === MAGNETIX_PALETTE_HEX[0] && filled[1].color === "#123456" && filled[2].color === MAGNETIX_PALETTE_HEX[2] && filled.every((r) => r.color !== "#000000"));
const added = resolvedRows({ colors: { mode: "custom" }, rows: [...filled, { label: "D", value: 4 }] });
check("a new row gets the next palette color", added[3].color === defaultRowColor(3) && added.slice(0, 3).map((r) => r.color).join() === filled.map((r) => r.color).join());
const reordered = [filled[2], filled[0], filled[1]];
check("reorder keeps each color with its row (color lives on the row)", resolvedRows({ colors: { mode: "custom" }, rows: reordered }).map((r) => `${r.label}:${r.color}`).join() === reordered.map((r) => `${r.label}:${r.color}`).join());
const afterDelete = resolvedRows({ colors: { mode: "custom" }, rows: [filled[0], filled[2]] });
check("delete keeps the remaining rows' colors", afterDelete.map((r) => r.color).join() === [filled[0].color, filled[2].color].join());
check("palette mode leaves rows untouched", resolvedRows({ colors: { mode: "palette" }, rows: [{ label: "A", value: 1 }] })[0].color === undefined);
const fieldsFor = (props: Record<string, unknown>) => chartCfg.resolveFields!({ props: { ...chartCfg.defaultProps, ...props } }, { fields: chartCfg.fields });
check("Data rows show only Label + Value (colors are edited in Colors), in every mode", ["palette", "custom"].every((mode) => Object.keys(fieldsFor({ colors: { mode } }).rows.arrayFields ?? {}).join() === "label,value"));
const fieldsSrc = readFileSync("src/components/pages-funnels/puck/chart-fields.tsx", "utf8");
check("Colors previews: the FULL Magnetix palette and ALL saved Brand colors (not just colors in use)", fieldsSrc.includes('<Swatches colors={[...MAGNETIX_PALETTE_HEX]} kind="palette" />') && fieldsSrc.includes('<Swatches colors={brand} kind="brand" />') && MAGNETIX_PALETTE_HEX.length === 8);
check("One color: picker right under Colors; Shades: picker + live ramp", /mode === "single" \? basePicker/.test(fieldsSrc) && /\{basePicker\}\s*<Swatches colors=\{preview\.colors\} kind="shades" \/>/.test(fieldsSrc));
check("Custom editor is derived from the Data rows and writes each row's own color (no second colors array)", fieldsSrc.includes("rows.map((r, i) => (i === index ? { ...r, color: hex } : r))") && fieldsSrc.includes('type: "replace"') && !/customColors\s*:/.test(fieldsSrc));
check("field order: Chart type, Title, Title size, Description, Data, Colors, Order", Object.keys(chartCfg.fields!).slice(0, 7).join() === "chartType,title,titleSize,description,rows,colors,sort", Object.keys(chartCfg.fields!).slice(0, 8).join());
check("Colors defaults to the Magnetix palette", JSON.stringify(chartCfg.defaultProps!.colors) === JSON.stringify({ mode: "palette", base: "" }));

console.log("Rendering");
const brandBar = html({ chartType: "bar", rows, colors: { mode: "brand" }, brandColors: ["#2F5D50", "#A9472B"] });
check("Brand mode renders the workspace colors", brandBar.includes('fill="#2F5D50"') && brandBar.includes('fill="#A9472B"'));
const missing = html({ chartType: "bar", rows, colors: { mode: "brand" }, brandColors: [], editing: true });
check("Brand mode with no saved colors: builder note, no silent switch", /No brand colors saved yet/.test(missing));
check("…and visitors never see that builder note", !/No brand colors saved yet/.test(html({ chartType: "bar", rows, colors: { mode: "brand" }, brandColors: [] })));
const donut = html({ chartType: "donut", rows, colors: { mode: "shades", base: "#2F5D50" } });
check("Pie/Donut: thin white dividers between slices", (donut.match(/data-slice-gap/g) ?? []).length === 6 && donut.includes('stroke="white"'));
check("Pie/Donut: legend + screen-reader data table still there", donut.includes('<th scope="row">Cookies</th>') && /<ul aria-hidden="true"/.test(donut));
check("Custom colors render on bars and legend", html({ chartType: "pie", rows: [{ label: "A", value: 1, color: "#123456" }, { label: "B", value: 1, color: "#654321" }], colors: { mode: "custom" } }).includes("background:#123456"));
check("Line color renders", html({ chartType: "line", rows, colors: { mode: "single", base: "#A9472B" } }).includes('stroke="#A9472B"'));
const titled = (size: string, typography = {}) => html({ chartType: "bar", rows, title: "Best sellers", titleSize: size, style: { typography } });
check("Title size: Small / Medium (default) / Large", titled("small").includes('class="text-body-sm"') && titled("medium").includes('class="text-section"') && titled("large").includes('class="text-title-md"') && html({ chartType: "bar", rows, title: "T" }).includes('class="text-section"'));
check("Title weight follows Styles → Typography (default semibold)", titled("medium").includes("font-weight:600") && titled("medium", { fontWeight: 800 }).includes("font-weight:800"));
check("Legend labels take the Typography color", html({ chartType: "pie", rows, style: { typography: { color: "#334455" } } }).includes("color:#334455"));

console.log("Sidebar UX");
check("short chart-type names fit the closed select", CHART_TYPE_SHORT.map((t) => t.label).join() === "Bar,Horizontal bar,Line,Area,Pie,Donut" && CHART_TYPE_SHORT.every((t) => t.label.length <= 14));
check("one-line helper per type", CHART_TYPE_SHORT.find((t) => t.value === "donut")!.help === "Show parts of a whole with a center value." && CHART_TYPE_SHORT.every((t) => t.help.endsWith(".")));
const numField = readFileSync("src/components/pages-funnels/puck/metric-number-field.tsx", "utf8");
check("Value uses Puck's own FieldLabel with the # icon (matches Label)", numField.includes("<FieldLabel label={label} icon={<Hash size={16} />}>"));
check("hex helpers agree", normalizeHex("#a9472b") === "#A9472B");

console.log("Tenant scoping (source)");
const pub = readFileSync("src/app/p/[pageId]/page.tsx", "utf8");
check("published page reads brand colors from ITS OWN sub-account", pub.includes("getTenantBrandColorsServerSide(page.subAccountId)"));
const shell = readFileSync("src/components/pages-funnels/puck/editor-shell.tsx", "utf8");
check("builder reads brand colors from the open workspace only (no agency / portal / decoder colors)", shell.includes("getTenantBrandColors(workspace?.subAccount)") && !/portalBranding|energeticDecoderTheme|appTheme/.test(shell));

async function emulator() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { getTenantBrandColorsServerSide } = await import("../src/lib/server/brand-kit-service");
  const db = getAdminDb();
  await db.doc("subAccounts/sa_chart_a").set({ name: "A", brandKit: { colors: [{ id: "a1", hex: "#2F5D50" }] }, portalBranding: { accentColor: "#FF00FF" } });
  await db.doc("subAccounts/sa_chart_b").set({ name: "B", brandKit: { colors: [{ id: "b1", hex: "#A9472B" }] } });
  await db.doc("subAccounts/sa_chart_c").set({ name: "C", portalBranding: { accentColor: "#00FF00" } });
  console.log("Tenant isolation (emulator)");
  const a = (await getTenantBrandColorsServerSide("sa_chart_a")).map((c) => c.hex);
  const b = (await getTenantBrandColorsServerSide("sa_chart_b")).map((c) => c.hex);
  const c = (await getTenantBrandColorsServerSide("sa_chart_c")).map((c) => c.hex);
  check("each workspace gets only its own brand colors", a.join() === "#2F5D50" && b.join() === "#A9472B");
  check("a workspace without a Brand Kit gets none (portal accent is NOT used)", c.length === 0);
}

(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST) await emulator();
  else console.log("(tenant isolation skipped — set FIRESTORE_EMULATOR_HOST to run it)");
  console.log(`\nChart colors: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
