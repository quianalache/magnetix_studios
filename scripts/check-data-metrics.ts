/**
 * Data & Metrics Capability Wave 1 — contract checks (2026-10-30):
 * Animated Counter, Progress Bar, Progress Ring, Chart.
 * Pure maths + server-rendered markup + registry wiring. No server, no Firebase.
 *
 * Run: pnpm exec tsx scripts/check-data-metrics.ts
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  counterDurationMs,
  counterValueAt,
  easeOutCubic,
  formatCounterValue,
  resolveCounter,
} from "../src/lib/pages-funnels/data-metrics/counter";
import { computeProgress, formatPercent, ringGeometry, RING_VIEWBOX } from "../src/lib/pages-funnels/data-metrics/progress";
import {
  chartSummary,
  CHART_MAX_ROWS,
  fitLabel,
  labelStride,
  niceScale,
  normalizeChartRows,
  pieSlices,
  tickDecimals,
} from "../src/lib/pages-funnels/data-metrics/chart";
import { formatMetricValue } from "../src/lib/pages-funnels/data-metrics/formatting";
import { toFiniteNumber } from "../src/lib/pages-funnels/data-metrics/validation";
import { accentColor } from "../src/lib/pages-funnels/data-metrics/accent";
import { AnimatedCounterRender } from "../src/components/pages-funnels/data-metrics/animated-counter";
import { ProgressBarRender } from "../src/components/pages-funnels/data-metrics/progress-bar";
import { ProgressRingRender } from "../src/components/pages-funnels/data-metrics/progress-ring";
import { ChartRender } from "../src/components/pages-funnels/data-metrics/chart";
import { DATA_METRICS_BLOCKS } from "../src/components/pages-funnels/puck/data-metrics-config";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { assertSafePuck } from "../src/lib/pages-funnels/ai/page-plan";
import { MetricNumberInput } from "../src/components/pages-funnels/puck/metric-number-field";

// tsx compiles JSX with the classic runtime here; components need a global React.
(globalThis as { React?: typeof React }).React = React;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  — ${extra}` : ""}`);
}
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const h = <P,>(C: React.ComponentType<P>, props: P) => html(React.createElement(C as React.ComponentType<object>, props as object));

console.log("Shared number parsing");
check("numbers and numeric strings parse", toFiniteNumber(12) === 12 && toFiniteNumber("1,250") === 1250 && toFiniteNumber("-3.5") === -3.5);
check("empty / text / NaN / Infinity are not numbers (never 0)", [undefined, null, "", "abc", "10K+", NaN, Infinity].every((v) => toFiniteNumber(v) === null));

console.log("Animated Counter");
check("needs an end value; start defaults to 0", resolveCounter(undefined, undefined) === null && JSON.stringify(resolveCounter(undefined, 500)) === JSON.stringify({ start: 0, end: 500 }));
check("numeric strings accepted", JSON.stringify(resolveCounter("10", "1,000")) === JSON.stringify({ start: 10, end: 1000 }));
check("final frame is exactly the end value", counterValueAt(0, 98.6, 1, 1) === 98.6 && counterValueAt(0, 10000, 1.2, 0) === 10000);
check("intermediate frames respect decimal places", counterValueAt(0, 10, 0.333, 0) === 3 && counterValueAt(0, 10, 0.333, 2) === 3.33);
check("negative ranges interpolate", counterValueAt(0, -200, 0.5, 0) === -100 && counterValueAt(-50, 50, 0.5, 0) === 0);
check("easing is bounded 0..1", easeOutCubic(-1) === 0 && easeOutCubic(2) === 1 && easeOutCubic(0.5) > 0.5);
check("number format: 10,000", formatCounterValue(10000, { format: "number" }) === "10,000");
check("compact format: 1.3M / 12K", formatCounterValue(1250000, { format: "compact", decimalPlaces: 1 }) === "1.3M" && formatCounterValue(12000, { format: "compact" }) === "12K");
check("currency format: $1,200", formatCounterValue(1200, { format: "currency", currency: "USD" }) === "$1,200");
check("percentage + decimals: 98.5%", formatCounterValue(98.5, { format: "percentage", decimalPlaces: 1 }) === "98.5%");
check("thousands separator off", formatCounterValue(10000, { format: "number", useThousandsSeparator: false }) === "10000");
check("negative value formats", formatCounterValue(-1500, { format: "number" }) === "-1,500");
check("text format falls back to number for a counter", formatCounterValue(1500, { format: "text" }) === "1,500");
check("duration clamps 0.5–10s", counterDurationMs(0.1) === 500 && counterDurationMs(99) === 10000 && counterDurationMs(undefined) === 2000 && counterDurationMs(2.5) === 2500);
const counterPublic = h(AnimatedCounterRender, { id: "c1", startValue: 0, endValue: 10000, suffix: "+", label: "Students served" });
check("server render shows the FINAL value (hydration-safe, no-JS safe)", counterPublic.includes('data-counter-final="10,000+"') && counterPublic.includes(">10,000+</span>"));
check("screen readers get the final value + label only", /class="sr-only">10,000\+ Students served</.test(counterPublic));
check("visual number is hidden from screen readers (no intermediate ticks read)", /<p aria-hidden="true"[^>]*data-counter-final/.test(counterPublic));
check("width reserved for start AND final values (no layout shift)", (counterPublic.match(/class="invisible col-start-1 row-start-1"/g) ?? []).length === 2);
check("tabular numerals", counterPublic.includes("tabular-nums"));
check("builder: empty state when the end value is missing", h(AnimatedCounterRender, { id: "c2", editing: true }).includes("Set a start and end value"));
check("public: nothing rendered without an end value", h(AnimatedCounterRender, { id: "c3" }) === "");
check("builder render is the same static final value", h(AnimatedCounterRender, { id: "c1", startValue: 0, endValue: 10000, suffix: "+", label: "Students served", editing: true }).includes(">10,000+</span>"));

console.log("Progress (Bar + Ring)");
const p75 = computeProgress(750, 1000)!;
check("750 of 1,000 = 75%", p75.percent === 75 && p75.fillPercent === 75 && p75.ariaNow === 750);
const over = computeProgress(1200, 1000)!;
check("over target: real percent kept, fill + aria clamped", over.percent === 120 && over.fillPercent === 100 && over.ariaNow === 1000);
const neg = computeProgress(-5, 100)!;
check("negative current: fill + aria clamp to 0", neg.fillPercent === 0 && neg.ariaNow === 0);
check("zero / negative / missing target is 'not set up' (no NaN, no Infinity)", computeProgress(5, 0) === null && computeProgress(5, -10) === null && computeProgress(5, undefined) === null && computeProgress(undefined, 10) === null && computeProgress("abc", 10) === null);
check("percent text: rounding and no -0", formatPercent(74.6) === "75%" && formatPercent(-0.2) === "0%" && formatPercent(33.333, 1) === "33.3%");
const ring = ringGeometry("thick", 50);
check("ring geometry: r and circumference in the 120 viewBox", RING_VIEWBOX === 120 && ring.r === 53 && Math.abs(ring.circumference - 2 * Math.PI * 53) < 1e-9);
check("ring dash = half the circumference at 50%", Math.abs(ring.filled - ring.circumference / 2) < 1e-9);
check("ring dash clamps (150% → full, NaN → 0)", ringGeometry("medium", 150).filled === ringGeometry("medium", 100).filled && ringGeometry("medium", NaN).filled === 0);
const bar = h(ProgressBarRender, { id: "b1", currentValue: 750, targetValue: 1000, label: "Spots claimed", supportingText: "Just 250 left" });
check("bar: role=progressbar with min/max/now", /role="progressbar" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="750"/.test(bar));
check("bar: spoken value '750 of 1,000 (75%)'", bar.includes('aria-valuetext="750 of 1,000 (75%)"'));
check("bar: labelled by its visible label", /aria-labelledby="([^"]+)"/.test(bar) && bar.includes(`id="${/aria-labelledby="([^"]+)"/.exec(bar)![1]}"`));
check("bar: server render is the final fill (75%)", bar.includes("width:75%"));
check("bar: value line + supporting text readable", bar.includes("750 of 1,000") && bar.includes("Just 250 left"));
check("bar: 'amount left' display", h(ProgressBarRender, { id: "b2", currentValue: 750, targetValue: 1000, valueDisplay: "remaining" }).includes("250 to go"));
check("bar: currency values", h(ProgressBarRender, { id: "b3", currentValue: 7500, targetValue: 10000, format: "currency", currency: "USD" }).includes("$7,500 of $10,000"));
check("bar: no label → aria-label Progress", h(ProgressBarRender, { id: "b4", currentValue: 1, targetValue: 2 }).includes('aria-label="Progress"'));
check("bar: builder empty state; public renders nothing", h(ProgressBarRender, { id: "b5", editing: true }).includes("Add progress values") && h(ProgressBarRender, { id: "b6", currentValue: 5, targetValue: 0 }) === "");
const ringHtml = h(ProgressRingRender, { id: "r1", currentValue: 8, targetValue: 12, label: "Course completion", centerDisplay: "value" });
check("ring: accessible progressbar (not aria-hidden only)", /role="progressbar"[^>]*aria-valuenow="8"/.test(ringHtml) && ringHtml.includes('aria-valuetext="8 of 12 (67%)"'));
check("ring: center shows '8 of 12'", ringHtml.includes(">8 of 12</span>"));
check("ring: scales down (max-width 100%, square aspect)", ringHtml.includes("max-width:100%") && ringHtml.includes("aspect-ratio:1 / 1"));
check("ring: no Decoder colour variables", !ringHtml.includes("--cs-"));
check("ring: builder empty state; public renders nothing", h(ProgressRingRender, { id: "r2", editing: true }).includes("Add progress values") && h(ProgressRingRender, { id: "r3" }) === "");
check("accent colours come from :root tokens; default follows text", accentColor("plum") === "var(--color-plum-900)" && accentColor("default") === "currentColor" && accentColor("#ff0000") === "currentColor");

console.log("Chart model");
const rows = [
  { label: "YouTube", value: 3200 },
  { label: "", value: undefined },
  { label: "Google", value: "1,800" },
  { label: "Instagram", value: "abc" },
  { label: "Email", value: 800 },
];
const n = normalizeChartRows(rows, "bar");
check("blank rows skipped; label-without-number counted, not drawn", n.data.length === 3 && n.missingValues === 1);
check("numeric strings accepted", n.data[1].value === 1800);
check("sort largest first / smallest first", normalizeChartRows(rows, "bar", "desc").data.map((d) => d.label).join() === "YouTube,Google,Email" && normalizeChartRows(rows, "bar", "asc").data[0].label === "Email");
check("line/area keep entered order even when sorted", normalizeChartRows(rows, "line", "desc").data.map((d) => d.label).join() === "YouTube,Google,Email");
check("colour index stays with the row after sorting", normalizeChartRows(rows, "bar", "asc").data[0].index === 4);
const pieNeg = normalizeChartRows([{ label: "A", value: 5 }, { label: "B", value: -2 }], "donut");
check("pie/donut leave out negatives (counted)", pieNeg.data.length === 1 && pieNeg.negativeExcluded === 1);
check("negatives allowed in bar charts", normalizeChartRows([{ label: "A", value: -2 }], "bar").data[0].value === -2);
check(`row cap ${CHART_MAX_ROWS}`, normalizeChartRows(Array.from({ length: 40 }, (_, i) => ({ label: `R${i}`, value: i })), "bar").data.length === CHART_MAX_ROWS);
check("long labels trimmed to 60; unlabeled numbers get 'Item n'", normalizeChartRows([{ label: "x".repeat(90), value: 1 }, { value: 2 }], "bar").data.map((d) => d.label.length).join() === "60,6");
check("garbage input is safe", normalizeChartRows("nope", "bar").data.length === 0 && normalizeChartRows([null, 5, {}], "pie").data.length === 0);
const s1 = niceScale(0, 3200);
check("nice scale 0..3200 → 0..4000 step 1000", s1.min === 0 && s1.max === 4000 && s1.step === 1000 && s1.ticks.join() === "0,1000,2000,3000,4000");
const s2 = niceScale(-50, 120);
check("nice scale spans negatives and includes 0", s2.min < 0 && s2.max >= 120 && s2.ticks.includes(0));
check("flat data still gets a scale", niceScale(0, 0).max > 0 && niceScale(5, 5).ticks.includes(0));
check("tick decimals avoid duplicate labels", tickDecimals(0.25) === 2 && tickDecimals(0.5) === 1 && tickDecimals(2) === 0);
const pie = pieSlices(normalizeChartRows([{ label: "A", value: 62 }, { label: "B", value: 24 }, { label: "C", value: 14 }, { label: "Z", value: 0 }], "pie").data)!;
check("pie total + fractions sum to 1 (zero slice kept, draws nothing)", pie.total === 100 && Math.abs(pie.slices.reduce((s, x) => s + x.fraction, 0) - 1) < 1e-9 && pie.slices[3].fraction === 0);
check("pie with all zeros → nothing to draw", pieSlices(normalizeChartRows([{ label: "A", value: 0 }], "pie").data) === null);
check("summary: bar names highest + lowest", chartSummary("bar", n.data, {}).includes("Highest: YouTube, 3,200. Lowest: Email, 800."));
check("summary: donut names total + largest share", chartSummary("donut", pie.slices.map((s) => s.datum), {}).includes("totalling 100. Largest: A, 62 (62%)"));
check("label density reduces at narrow widths", labelStride(12, 300, 56) === 3 && labelStride(4, 800) === 1);
check("labels trimmed with an ellipsis", fitLabel("A very long category label", 60).endsWith("…") && fitLabel("Short", 200) === "Short");
check("Stats free-text values still untouched by the shared formatter", formatMetricValue("10K+", { format: "number" }) === "10K+");

console.log("Chart rendering");
for (const type of ["bar", "horizontalBar", "line", "area", "pie", "donut"] as const) {
  const out = h(ChartRender, { id: `ch-${type}`, chartType: type, title: "Where our audience comes from", rows });
  const tableRows = (out.match(/<th scope="row">/g) ?? []).length;
  check(`${type}: figure + svg role=img + summary + sr-only data table`, out.includes(`data-chart-type="${type}"`) && out.includes('role="img"') && out.includes('class="sr-only"') && tableRows === 3, `rows=${tableRows}`);
}
const donut = h(ChartRender, { id: "d1", chartType: "donut", rows, centerLabel: "Total visits" });
check("donut: total in the center + caption", donut.includes(">5,800</span>") && donut.includes("Total visits"));
check("donut: custom center text", h(ChartRender, { id: "d2", chartType: "donut", rows, donutCenter: "custom", centerText: "7.4K" }).includes(">7.4K</span>"));
check("pie: share column in the data table", h(ChartRender, { id: "p1", chartType: "pie", rows }).includes('<th scope="col">Share</th>'));
check("chart scales with its container (width 100%)", h(ChartRender, { id: "w1", chartType: "bar", rows }).includes("width:100%"));
check("builder: empty state 'Add data to this chart'", h(ChartRender, { id: "e1", editing: true }).includes("Add data to this chart"));
check("builder: tells you about rows with no number", h(ChartRender, { id: "e2", rows, editing: true }).includes("1 row has no number"));
check("public: empty chart renders nothing", h(ChartRender, { id: "e3", rows: [] }) === "" && h(ChartRender, { id: "e4", chartType: "pie", rows: [{ label: "A", value: 0 }] }) === "");
check("unknown chart type falls back to bar", h(ChartRender, { id: "u1", chartType: "radar" as never, rows }).includes('data-chart-type="bar"'));

console.log("Registry + settings");
const cats = clientPuckConfig.categories ?? {};
const comps = clientPuckConfig.components as Record<string, { resolveFields?: (d: unknown, p: unknown) => Record<string, unknown>; fields?: Record<string, unknown>; defaultProps?: Record<string, unknown>; label?: string }>;
check("Data & Metrics category: Stats, Animated Counter, Progress Bar, Progress Ring, Chart", JSON.stringify(cats.dataMetrics?.components) === JSON.stringify(["Stats", "AnimatedCounter", "ProgressBar", "ProgressRing", "Chart"]));
check("Data Table is not exposed", !JSON.stringify(cats).includes("DataTable"));
const columnAllow = (comps.Column?.fields as { elements?: { allow?: string[] } })?.elements?.allow ?? [];
check("all five blocks allowed inside a Column (Section → Row → Column)", DATA_METRICS_BLOCKS.every((b) => columnAllow.includes(b)));
check("customer-facing block labels", comps.AnimatedCounter?.label === "Animated Counter" && comps.ProgressBar?.label === "Progress Bar" && comps.ProgressRing?.label === "Progress Ring" && comps.Chart?.label === "Chart");
check("new blocks start empty (no invented numbers)", comps.AnimatedCounter.defaultProps!.endValue === undefined && comps.ProgressBar.defaultProps!.currentValue === undefined && comps.ProgressBar.defaultProps!.targetValue === undefined && comps.ProgressRing.defaultProps!.targetValue === undefined && (comps.Chart.defaultProps!.rows as unknown[]).length === 0);
const resolve = (name: string, props: Record<string, unknown>) =>
  Object.keys(comps[name].resolveFields!({ props: { ...comps[name].defaultProps, ...props } }, { fields: comps[name].fields }));
check("chart fields: line hides Order/Legend/donut fields", (() => { const f = resolve("Chart", { chartType: "line" }); return !f.includes("sort") && !f.includes("showLegend") && !f.includes("donutCenter") && f.includes("height"); })());
check("chart fields: donut shows center + legend, hides value labels/height", (() => { const f = resolve("Chart", { chartType: "donut" }); return f.includes("donutCenter") && f.includes("centerLabel") && f.includes("showLegend") && !f.includes("showValues") && !f.includes("height") && !f.includes("centerText"); })());
check("chart fields: custom center text appears only when chosen", resolve("Chart", { chartType: "donut", donutCenter: "custom" }).includes("centerText"));
check("currency code shows only for the currency format", !resolve("ProgressBar", {}).includes("currency") && resolve("ProgressBar", { format: "currency" }).includes("currency"));
check("counter: duration hidden when not animating", !resolve("AnimatedCounter", { animation: "none" }).includes("durationSeconds") && resolve("AnimatedCounter", {}).includes("durationSeconds"));
check("style field lands in the Style tab", ["AnimatedCounter", "ProgressBar", "ProgressRing", "Chart"].every((b) => "style" in comps[b].fields!));

console.log("Numeric field");
const noop = () => {};
check("value field: empty means 'not set' (not 0)", /<input[^>]*value=""/.test(h(MetricNumberInput, { label: "End value", value: undefined, onChange: noop })));
check("value field: shows the saved number, labelled, decimal keyboard", (() => { const o = h(MetricNumberInput, { label: "End value", value: 1250, onChange: noop }); return o.includes('value="1250"') && o.includes('title="End value"') && o.includes('inputMode="decimal"') && o.includes(">End value</label>"); })());

console.log("AI safety");
for (const type of ["AnimatedCounter", "ProgressBar", "ProgressRing", "Chart", "Stats"]) {
  let threw = false;
  try {
    assertSafePuck({ root: { props: {} }, content: [{ type, props: { id: "x" } }] } as never);
  } catch {
    threw = true;
  }
  check(`AI page generation can't emit ${type}`, threw);
}

console.log(`\nData & Metrics Wave 1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
