/**
 * Data & Metrics color QA fixtures (owner color UX correction, 2026-11-01).
 *
 * Prints (or writes to argv[2]) a deterministic list of QA-labelled Puck
 * content sections — every block id starts with "qa-fx-". It writes nothing
 * to any database; append the sections to a QA DRAFT page's content (never
 * publish). The production Test workspace's QA draft page carries them.
 *
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     pnpm exec tsx scripts/qa/data-metrics-color-fixtures.ts /tmp/fixtures.json
 *
 * Expected rendering (identical in the builder canvas, Preview and a
 * published page):
 *   qa-fx-bar-legacy           var(--color-plum-900)   (no color setting → legacy named color)
 *   qa-fx-ring-legacy          var(--color-aqua-600)   (no color setting)
 *   qa-fx-bar-legacy-explicit  var(--color-gold-600)   (source "magnetix" → legacy)
 *   qa-fx-bar-new / -ring-new  Primary brand color (1st in Settings → Branding);
 *                              with none saved: var(--color-plum-900), no warning
 *   qa-fx-bar-custom           #264653
 *   qa-fx-ring-custom          #A9472B
 *   qa-fx-chart-legacy         var(--color-plum-700), var(--ds-chart-3), var(--color-plum-300), var(--ds-chart-2)
 *   qa-fx-chart-brand          brand colors in order, then lighter/darker steps; with none saved the
 *                              legacy colors above + a builder-only "No brand colors saved yet" note
 *   qa-fx-chart-custom         #2F5D50, #A9472B, #E9C46A, #264653
 *   qa-fx-chart-single         every bar #264653
 *   qa-fx-chart-shades         4 distinct shades of #A9472B
 *   qa-fx-chart-line           #A9472B
 *   qa-fx-chart-line-brand     Primary brand color; with none saved var(--color-plum-700)
 * Sidebar: no option anywhere is named "Magnetix"; legacy blocks show "Choose colors…" /
 * "Choose a color…" and their current color by name (e.g. "Current: Plum").
 */
import { writeFileSync } from "node:fs";
import { DEFAULT_STYLE_CONFIG } from "../../src/lib/pages-funnels/puck/style";
import { DEFAULT_BACKGROUND } from "../../src/lib/pages-funnels/puck/background";
const S = DEFAULT_STYLE_CONFIG;
const col = (id: string, elements: unknown[]) => ({ type: "Column", props: { id, background: DEFAULT_BACKGROUND, style: S, width: "full", alignment: "left", elements } });
const section = (id: string, elements: unknown[]) => ({ type: "Section", props: { id, background: DEFAULT_BACKGROUND, style: S, maxWidth: "contained", fullWidthBackground: true, paddingTop: 24, paddingBottom: 24, rows: [{ type: "Row", props: { id: `${id}-row`, background: DEFAULT_BACKGROUND, style: S, gap: 24, verticalAlign: "top", columns: [col(`${id}-col`, elements)] } }] } });
const heading = (id: string, text: string) => ({ type: "Heading", props: { id, text, level: "h2", alignment: "left", style: S } });
const fmt = { format: "number", decimalPlaces: 0, useThousandsSeparator: true, currency: "USD" };
const bar = (id: string, label: string, extra: Record<string, unknown> = {}) => ({ type: "ProgressBar", props: { id, currentValue: 75, targetValue: 100, label, supportingText: "", valueDisplay: "of", showPercentage: true, ...fmt, thickness: "medium", direction: "ltr", alignment: "left", accent: "plum", animate: false, style: S, ...extra } });
const ring = (id: string, label: string, extra: Record<string, unknown> = {}) => ({ type: "ProgressRing", props: { id, currentValue: 8, targetValue: 12, centerDisplay: "percentage", label, supportingText: "", ...fmt, size: "small", thickness: "medium", alignment: "left", accent: "plum", animate: false, style: S, ...extra } });
const rows4 = [{ label: "Alpha", value: 40 }, { label: "Beta", value: 30 }, { label: "Gamma", value: 20 }, { label: "Delta", value: 10 }];
const chart = (id: string, title: string, chartType: string, extra: Record<string, unknown> = {}) => ({ type: "Chart", props: { id, chartType, title, titleSize: "small", description: "", rows: rows4, sort: "original", ...fmt, showValues: true, showLegend: true, donutCenter: "total", centerText: "", centerLabel: "", height: "small", style: S, ...extra } });
const content = [
  section("qa-fx-s0", [heading("qa-fx-h", "QA · Data & Metrics color fixtures (do not publish)")]),
  section("qa-fx-s1", [
    bar("qa-fx-bar-legacy", "QA-LEGACY bar · no color setting · plum"),
    ring("qa-fx-ring-legacy", "QA-LEGACY ring · no color setting · aqua", { accent: "aqua" }),
    bar("qa-fx-bar-legacy-explicit", "QA-LEGACY bar · source magnetix · gold", { accent: "gold", color: { source: "magnetix" } }),
  ]),
  section("qa-fx-s2", [
    bar("qa-fx-bar-new", "QA-NEW bar · default · follows Primary brand color", { color: { source: "brand" } }),
    ring("qa-fx-ring-new", "QA-NEW ring · default · follows Primary brand color", { color: { source: "brand" } }),
    bar("qa-fx-bar-custom", "QA-CUSTOM bar · #264653", { color: { source: "custom", custom: "#264653" } }),
    ring("qa-fx-ring-custom", "QA-CUSTOM ring · #A9472B", { color: { source: "custom", custom: "#A9472B" } }),
  ]),
  section("qa-fx-s3", [
    chart("qa-fx-chart-legacy", "QA-LEGACY chart · original colors (no Colors setting)", "bar"),
    chart("qa-fx-chart-brand", "QA-CHART Brand colors · bar · 4 rows", "bar", { colors: { mode: "brand", base: "" } }),
    chart("qa-fx-chart-custom", "QA-CHART Custom · #2F5D50 #A9472B #E9C46A #264653", "bar", { colors: { mode: "custom", base: "" }, rows: rows4.map((r, i) => ({ ...r, color: ["#2F5D50", "#A9472B", "#E9C46A", "#264653"][i] })) }),
    chart("qa-fx-chart-single", "QA-CHART One color · #264653", "horizontalBar", { colors: { mode: "single", base: "#264653" } }),
    chart("qa-fx-chart-shades", "QA-CHART Shades · base #A9472B", "donut", { colors: { mode: "shades", base: "#A9472B" } }),
    chart("qa-fx-chart-line", "QA-CHART Line color · #A9472B", "line", { colors: { mode: "single", base: "#A9472B" } }),
    chart("qa-fx-chart-line-brand", "QA-CHART Line · default · follows Primary brand color", "line", { colors: { mode: "brand", base: "" } }),
  ]),
];
if (process.argv[2]) {
  writeFileSync(process.argv[2], JSON.stringify(content));
  console.log(`wrote ${content.length} fixture sections to ${process.argv[2]}`);
} else {
  console.log(JSON.stringify(content, null, 2));
}
