/**
 * Readings library + Reports tab (2026-10-07, owner-approved mockups A + B)
 * — render checks on the REAL components: the library table (Name · Energy
 * Type · Profile · Sun Sign, no birth/location anywhere, phone rows, pager),
 * the Reports panel (title / generated date / design / Internal / one View
 * PDF, no edit/regenerate/open, empty state), the workspace's new Reports
 * tab, the contained tab strips, the phone header, and the phone-width
 * Mandala keeping its full labels.
 *
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/test-readings-library-ui.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateHumanDesignProfile } from "../src/lib/energetics/human-design";
import { calculateAstrologyChart } from "../src/lib/energetics/astrology";
import { assembleReadingsLibrary, sunSignOf, type ReadingsLibraryPage } from "../src/lib/energetic-decoder/readings-library";
import { ReadingsLibraryTable } from "../src/components/energetic-decoder/readings-library-table";
import { GeneratedReportsPanel, chartDesignLabel } from "../src/components/energetic-decoder/generated-reports-panel";
import { HumanDesignReadingWorkspace } from "../src/components/energetic-decoder/human-design-reading-workspace";
import { MandalaChart, LEGIBLE_LABEL_TYPE } from "../src/components/energetic-decoder/mandala-chart";
import { MANDALA_RINGS, MANDALA_TYPE, ZODIAC_GLYPH_SCALE, zodiacLabelLayout } from "../src/lib/energetics/mandala-spec";
import { TAB_STRIP_CLASS } from "../src/components/energetic-decoder/tab-strip";
import type { GeneratedReport } from "../src/types/generated-report";
import type { EnergeticDecoderReading } from "../src/types/energetic-decoder";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const birth = { date: "1985-03-09", time: "09:00", timeZone: "America/Chicago", lat: 30.2672, lng: -97.7431 };
const hd = calculateHumanDesignProfile(birth);
const astro = calculateAstrologyChart(birth);
const BIRTH_STRINGS = ["Austin", "Travis County", "Texas", "1985-03-09", "Mar 9, 1985", "9:00 AM", "America/Chicago", "daughter"];

// Library data built the same way the server does it, from raw records that DO carry birth data.
const rawProfiles = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Client ${i} Lastname`, contactId: i === 1 ? "c0" : `c${i}`, birthPlace: "Austin, Travis County, Texas, United States", birthDate: "1985-03-09", relationshipLabel: "daughter" }));
const rawReadings = rawProfiles.map((p, i) => ({ id: `r${i}`, profileId: p.id, contactId: p.contactId, name: p.name, createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), birthPlace: p.birthPlace }));
function libraryPage(page: number): ReadingsLibraryPage {
  const a = assembleReadingsLibrary(rawProfiles, rawReadings, new Map(), { page });
  return { ...a, rows: a.rows.map((r) => ({ ...r, energyType: hd.type, hdProfile: hd.profile, sunSign: sunSignOf(astro.placements) })) };
}
const tableProps = {
  loading: false,
  searching: false,
  sort: "recent" as const,
  hrefFor: (r: { id: string }) => `/sa/x/energetic-decoder?tab=readings&profileId=${r.id}`,
  onOpen: () => {},
  onEdit: () => {},
  onDelete: () => {},
  onSortByName: () => {},
  onPage: () => {},
  busyRowId: null,
};
const table = (data: ReadingsLibraryPage | null, extra: object = {}) => renderToStaticMarkup(createElement(ReadingsLibraryTable, { ...tableProps, data, ...extra }));

console.log("\nReadings library (mockup A)");
check("columns: Name · Energy Type · Profile · Sun Sign — and nothing else (no Systems / count / latest / location / origin / report status)", () => {
  const html = table(libraryPage(1));
  const heads = [...html.matchAll(/data-column="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(heads, ["name", "energy-type", "profile", "sun-sign"]);
  for (const gone of ["Systems", "readings ·", "Latest", "Location", "Origin", "Report"]) assert.ok(!html.includes(gone), gone);
});
check("values come from the reading data: name, HD type, HD profile, Sun sign (with its glyph in text presentation)", () => {
  const html = table(libraryPage(1));
  const sun = sunSignOf(astro.placements)!;
  assert.ok(html.includes("Client 29 Lastname"));
  assert.ok(html.includes(`>${hd.type}<`) && html.includes(`>${hd.profile}<`));
  assert.ok(html.includes(`data-sun-sign="${sun}"`) && html.includes("︎"));
});
check("no birth date/time/place, county, state, time zone or relationship label anywhere in the list (any screen size)", () => {
  const html = table(libraryPage(1));
  for (const s of BIRTH_STRINGS) assert.ok(!html.includes(s), s);
});
check("two Profiles under one Contact stay distinct rows; each row links to its own person", () => {
  const html = table(libraryPage(2));
  assert.ok(html.includes('data-row-id="p0"') && html.includes('data-row-id="p1"'));
  assert.ok(html.includes("profileId=p0") && html.includes("profileId=p1"));
});
check("25 per page with a numbered pager and an honest range", () => {
  const html = table(libraryPage(1));
  assert.equal((html.match(/data-row-id=/g) ?? []).length, 25);
  assert.ok(html.includes("Showing 1–25 of 30 people"));
  assert.ok(html.includes('aria-current="page"') && html.includes('aria-label="Next page"'));
  assert.ok(table(libraryPage(2)).includes("Showing 26–30 of 30 people"));
});
check("phones: no table — each row stacks name + Energy Type / Profile / Sun Sign; desktop cells are md+ only", () => {
  const html = table(libraryPage(1));
  assert.ok(html.includes("data-mobile-summary") && html.includes("md:hidden"));
  assert.ok(html.includes("hidden min-w-0 items-center md:flex"));
  assert.ok(html.includes("hidden items-center border-b") || html.includes("hidden items-center gap-4 border-b"), "column headings hidden on phones");
});
check("a person with no reading yet says so (no false 'No readings yet' for people who have one)", () => {
  const a = assembleReadingsLibrary([{ id: "p", name: "New Person", contactId: "c" }], [], new Map());
  const html = table({ ...a, rows: a.rows.map((r) => ({ ...r, energyType: null, hdProfile: null, sunSign: null })) });
  assert.ok(html.includes("No reading yet"));
  assert.ok(!table(libraryPage(1)).includes("No reading yet"));
});
check("empty + search-miss states", () => {
  assert.ok(table({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 }).includes("No readings saved yet"));
  assert.ok(table({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 1 }, { searching: true }).includes("No one matches that search."));
});

console.log("\nReadings tab container");
const tab = readFileSync("src/components/energetic-decoder/readings-tab.tsx", "utf8");
check("dead 'Select a reading' pane and the nested 'N readings' history are gone", () => {
  assert.ok(!tab.includes("Select a reading"));
  assert.ok(!tab.includes("older reading"));
  assert.ok(!tab.includes("subscribeToContacts"), "the list no longer loads every Contact");
  assert.ok(!/birthPlace|birthDate/.test(readFileSync("src/components/energetic-decoder/readings-library-table.tsx", "utf8")));
});
check("+ New reading kept; Reading configuration labelled as configuration (not a filter), same dialog", () => {
  assert.ok(tab.includes("<NewReadingDialog"));
  assert.ok(tab.includes('aria-label="Reading configuration"') && tab.includes(">Reading configuration</span>"));
  assert.ok(tab.includes("<EnergeticDecoderReadingConfiguration />"));
  assert.ok(!/>\s*Filter\s*</.test(tab));
});
check("URL-driven: rows open ?profileId= (legacy ?readingId=), workspace tab in ?view=, library page/search/sort in the URL", () => {
  assert.ok(tab.includes('row.kind === "profile" ? build({ profileId: row.id }) : build({ readingId: row.id })'));
  assert.ok(tab.includes('searchParams.get("profileId")') && tab.includes('searchParams.get("readingId")'));
  assert.ok(tab.includes('const WORKSPACE_VIEWS: WorkspaceView[] = ["hd", "mandala", "frequency", "astro", "reports"]'));
  assert.ok(tab.includes('searchParams.get("q")') && tab.includes('searchParams.get("sort")') && tab.includes('searchParams.get("page")'));
  assert.ok(tab.includes("/energetic-decoder/library?"), "server-side paging/search");
});
check("the workspace opens the latest snapshot unless ?readingId= pins one; older snapshots are never deleted or hidden server-side", () => {
  assert.ok(tab.includes("(readingId ? readings.find((r) => r.id === readingId) : undefined) ?? readings[0] ?? null"));
  assert.ok(tab.includes("/readings?profileId="));
});
check("Generate Report in the Reports tab is the same dialog/POST as the header button", () => {
  assert.ok(tab.includes("onGenerate={openGenerateDialog}") && tab.includes("onOpenGenerateDialog={openGenerateDialog}"));
  assert.equal((tab.match(/energetic-decoder\/generated-reports`, \{\s*method: "POST"/g) ?? []).length, 1);
});

console.log("\nReports tab (mockup B)");
const report = (id: string, title: string, at: string, readingId = "rA", setName: string | null = null): GeneratedReport => ({
  id, subAccountId: "sa", agencyId: "ag", reportDesignId: "d", reportDesignTitleAtGeneration: title, readingId, contactId: "c", profileId: "p", generatedAt: at, generatedBy: "u",
  snapshot: { pages: [], chartStyles: { source: "generation", frozenAt: at, setId: setName ? "s" : null, setName, humanDesign: null, mandala: null, astrology: null, frequency: null } },
});
const reports = [report("g1", "Astrology Snapshot", "2026-09-14T16:03:00Z"), report("g2", "Human Design Overview", "2026-10-05T15:24:00Z", "rB", "Magnetix Violet")];
const panel = (list: GeneratedReport[], dates = new Map([["rA", "2026-01-01T00:00:00Z"], ["rB", "2026-06-01T00:00:00Z"]])) =>
  renderToStaticMarkup(createElement(GeneratedReportsPanel, { subAccountId: "sa", reports: list, loading: false, readingDates: dates, onGenerate: () => {}, onDelete: () => {}, deletingReportId: null }));
check("each report: title, generated date + time, chart design, newest first", () => {
  const html = panel(reports);
  assert.ok(html.indexOf("Human Design Overview") < html.indexOf("Astrology Snapshot"));
  assert.ok(html.includes("data-report-title") && html.includes("data-report-generated") && html.includes("data-report-chart-design"));
  assert.equal(chartDesignLabel(reports[1]), "Magnetix Violet");
  assert.equal(chartDesignLabel(reports[0]), "Default");
  assert.ok(html.includes("From the "), "says which reading a report came from when the person has several");
});
check("one action — View PDF — opening the existing generated-report PDF route in a new tab; no edit / regenerate / open", () => {
  const html = panel(reports);
  assert.equal((html.match(/data-report-view-pdf/g) ?? []).length, 2);
  assert.ok(html.includes('href="/api/sub-accounts/sa/energetic-decoder/generated-reports/g2/pdf"') && html.includes('target="_blank"'));
  for (const gone of [">Edit", "Regenerate", ">Open<", ">Preview<"]) assert.ok(!html.includes(gone), gone);
});
check("access: every report reads Internal (no access field exists yet) — no Client Access state, no toggle", () => {
  const html = panel(reports);
  assert.equal((html.match(/data-report-access="internal"/g) ?? []).length, 2);
  assert.ok(!html.includes("Client Access") && !/role="switch"|type="checkbox"/.test(html));
  assert.ok(html.includes("Generating a report doesn&#x27;t share it with the client."));
  const t = readFileSync("src/types/generated-report.ts", "utf8");
  assert.ok(!/clientAccess|sharedWith|accessGranted/i.test(t), "no access field was invented on GeneratedReport");
});
check("only this person's reports render (the panel shows exactly what it's given — scoping is server-side by Profile)", () => {
  const html = panel([reports[0]]);
  assert.ok(html.includes("Astrology Snapshot") && !html.includes("Human Design Overview"));
});
check("empty state", () => {
  const html = panel([]);
  assert.ok(html.includes("data-reports-empty") && html.includes("No reports generated yet"));
  assert.ok(html.includes("Generate Report"));
});
check("phones: report rows stack (desktop grid is md+ only); View PDF stays a full, tappable button", () => {
  const html = panel(reports);
  assert.ok(html.includes("flex flex-wrap items-center") && html.includes("md:grid md:grid-cols-"));
  assert.ok(html.includes("basis-full"));
});

console.log("\nReading workspace");
const reading = {
  id: "rB", subAccountId: "sa", agencyId: "ag", contactId: "c", profileId: "p", system: "geneKeys", name: "Staff QA Test",
  birthDate: birth.date, birthTime: birth.time, birthPlace: "Austin, Texas", timeZone: birth.timeZone, spheres: [], humanDesign: hd, astrology: astro, createdAt: "2026-06-01T00:00:00Z",
} as unknown as EnergeticDecoderReading;
const ws = (showReports: boolean) =>
  renderToStaticMarkup(
    createElement(HumanDesignReadingWorkspace, {
      reading, selectedProfile: null, subAccountId: "sa", subAccount: null, chartDesigns: [], reportDesigns: [], hdDesign: null, mandalaDesign: null, astroDesign: null,
      savingDesignFor: null, onSaveDesignOverride: () => {}, availableSystems: [{ key: "hd", label: "Human Design" }, { key: "astro", label: "Astrology" }],
      currentSystem: "hd", onSetSystem: () => {}, hdStyleView: "traditional", onSetHdStyleView: () => {}, onBack: () => {},
      showReports, onShowReports: () => {}, reportsPanel: createElement("div", { "data-test-reports": true }), onOpenGenerateDialog: () => {}, deletingReadingId: null, onDeleteReading: () => {},
    }),
  );
check("Reports is the last tab, after the reading-system tabs; selecting it replaces the chart content", () => {
  const off = ws(false);
  const tabs = [...off.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(tabs, [["Human Design", "true"], ["Astrology", "false"], ["Reports", "false"]]);
  assert.ok(!off.includes("data-test-reports"));
  const on = ws(true);
  const onTabs = [...on.matchAll(/role="tab" aria-selected="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(onTabs, [["Human Design", "false"], ["Astrology", "false"], ["Reports", "true"]]);
  assert.ok(on.includes("data-test-reports"));
  assert.ok(!on.includes("Chart Information"), "no chart under the Reports tab");
});
check("the old 'Generated Reports' card above the tabs is gone (it lives in the Reports tab now)", () => {
  assert.ok(!ws(false).includes("Generated Reports"));
});
check("phone header: controls wrap under the identity at full width; Generate Report full-width below sm; desktop unchanged at sm+", () => {
  const html = ws(false);
  assert.ok(html.includes("flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0"));
  assert.ok(/data-generate-report[^>]*class="[^"]*w-full[^"]*sm:w-auto/.test(html));
});
check("tab strips scroll sideways only, inside themselves (touch pan-x, no vertical movement, no page overscroll, hidden scrollbar)", () => {
  for (const c of ["touch-pan-x", "overflow-x-auto", "overflow-y-hidden", "overscroll-x-contain", "[scrollbar-width:none]", "min-w-0"]) assert.ok(TAB_STRIP_CLASS.includes(c), c);
  assert.ok(ws(false).includes("touch-pan-x") && ws(false).includes("data-workspace-tabs"));
  const page = readFileSync("src/app/(dashboard)/sa/[subAccountId]/energetic-decoder/page.tsx", "utf8");
  assert.ok(page.includes("className={`${TAB_STRIP_CLASS}") && page.includes("data-module-tabs") && page.includes("useActiveTabVisible(tabStripRef, tab)"));
});

console.log("\nMandala on phones");
const mandala = (keepFullLabels: boolean) =>
  renderToStaticMarkup(createElement(MandalaChart, { profile: hd, gateColor: "#7c3aed", backgroundColor: "#ffffff", keepFullLabels }));
check("Reading → Mandala keeps the four Quarter names and full zodiac names down to 200px (only that view opts in)", () => {
  const html = mandala(true);
  for (const q of ["Initiation", "Civilization", "Duality", "Mutation"]) assert.ok(html.includes(q), q);
  assert.equal((html.match(/data-zodiac-label="full" class="hidden @min-\[200px\]\/mandala:inline"/g) ?? []).length, 12);
  assert.ok(readFileSync("src/components/energetic-decoder/mandala-reading-view.tsx", "utf8").includes("keepFullLabels"));
});
check("every other Mandala (thumbnails, reports, public pages) keeps the original 300px compact behavior", () => {
  const html = mandala(false);
  assert.equal((html.match(/data-zodiac-label="full" class="hidden @min-\[300px\]\/mandala:inline"/g) ?? []).length, 12);
  assert.ok(!html.includes("@max-[420px]/mandala"));
});
check("small charts scale label type up within its band (CSS only, < 420px); the longest name still fits its 30° arc", () => {
  const html = mandala(true);
  assert.ok(html.includes("@max-[420px]/mandala:text-[5.2px]") && html.includes("@max-[420px]/mandala:text-[4.2px]") && html.includes("@max-[420px]/mandala:text-[5.25px]"));
  assert.ok(html.includes(`font-size="${MANDALA_TYPE.zodiacLabel}"`), "the SVG attribute (desktop size) is unchanged");
  assert.equal(LEGIBLE_LABEL_TYPE.zodiacGlyph / LEGIBLE_LABEL_TYPE.zodiacLabel, ZODIAC_GLYPH_SCALE);
  const arc = ((30 * Math.PI) / 180) * ((MANDALA_RINGS.zodiacOuter + MANDALA_RINGS.zodiacInner) / 2);
  const l = zodiacLabelLayout("Sagittarius", LEGIBLE_LABEL_TYPE.zodiacLabel);
  assert.ok(-2 * l.glyphX < arc * 0.6, `Sagittarius at ${LEGIBLE_LABEL_TYPE.zodiacLabel}: ${(-2 * l.glyphX).toFixed(1)} of ${arc.toFixed(1)}`);
  assert.ok(LEGIBLE_LABEL_TYPE.zodiacLabel < MANDALA_RINGS.zodiacOuter - MANDALA_RINGS.zodiacInner, "zodiac name fits the band's depth");
  assert.ok(LEGIBLE_LABEL_TYPE.quarterLabel < MANDALA_RINGS.quarterOuter - MANDALA_RINGS.quarterInner, "Quarter name fits the band's depth");
});

console.log(`\n${passed} checks passed.`);
