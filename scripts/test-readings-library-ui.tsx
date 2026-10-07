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
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateHumanDesignProfile } from "../src/lib/energetics/human-design";
import { calculateAstrologyChart } from "../src/lib/energetics/astrology";
import { assembleReadingsLibrary, sunSignOf, type ReadingsLibraryPage } from "../src/lib/energetic-decoder/readings-library";
import { ReadingsLibraryTable } from "../src/components/energetic-decoder/readings-library-table";
import { GeneratedReportsPanel, chartDesignLabel, reportDesignNote } from "../src/components/energetic-decoder/generated-reports-panel";
import { HumanDesignReadingWorkspace } from "../src/components/energetic-decoder/human-design-reading-workspace";
import { MandalaChart, LEGIBLE_LABEL_TYPE, PHONE_LABEL_BASELINE_EM, phoneLabelBaselineRadius } from "../src/components/energetic-decoder/mandala-chart";
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
check("Generate Report in the Reports tab uses the existing dialog and the one generation POST", () => {
  assert.ok(tab.includes("onGenerate={openGenerateDialog}"));
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
      showReports, onShowReports: () => {}, reportsPanel: createElement("div", { "data-test-reports": true }), deletingReadingId: null, onDeleteReading: () => {},
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
check("header: no Generate Report (reports are generated from the Reports tab); Chart Design + ⋮ remain and wrap under the identity on phones", () => {
  for (const html of [ws(false), ws(true)]) {
    const header = html.slice(html.indexOf("data-reading-header"), html.indexOf("data-workspace-tabs"));
    assert.ok(!header.includes("Generate Report") && !header.includes("data-generate-report"), "no header-level Generate Report");
    assert.ok(header.includes("More Actions"), "⋮ menu kept");
    assert.ok(html.includes("flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:max-w-full"));
  }
  assert.ok(!readFileSync("src/components/energetic-decoder/human-design-reading-workspace.tsx", "utf8").includes("onOpenGenerateDialog"));
});
check("the Reports tab's Generate Report is the workspace's only report-generation entry, wired to the existing dialog", () => {
  assert.ok(panel([]).includes("Generate Report") && panel(reports).includes("Generate Report"));
  assert.ok(tab.includes("onGenerate={openGenerateDialog}"));
  assert.ok(!tab.includes("onOpenGenerateDialog"));
});
check("tab strips re-reveal the selected tab when their contents/size change (late Mandala tab, font swap) but never fight the user's own swipe", () => {
  const hook = readFileSync("src/components/energetic-decoder/tab-strip.ts", "utf8");
  assert.ok(hook.includes("new ResizeObserver(relayout)") && hook.includes("new MutationObserver(relayout)"));
  assert.ok(hook.includes("mo?.observe(strip, { childList: true, subtree: true, characterData: true });"));
  assert.ok(hook.includes('strip.addEventListener("scroll", update, { passive: true });'), "scrolling only updates the fade cue");
  assert.ok(!/addEventListener\("scroll", relayout/.test(hook));
});
check("tab strips scroll sideways only, inside themselves (touch pan-x, no vertical movement, no page overscroll, hidden scrollbar)", () => {
  for (const c of ["touch-pan-x", "overflow-x-auto", "overflow-y-hidden", "overscroll-x-contain", "[scrollbar-width:none]", "min-w-0"]) assert.ok(TAB_STRIP_CLASS.includes(c), c);
  assert.ok(ws(false).includes("touch-pan-x") && ws(false).includes("data-workspace-tabs"));
  const page = readFileSync("src/app/(dashboard)/sa/[subAccountId]/energetic-decoder/page.tsx", "utf8");
  assert.ok(page.includes("className={`${TAB_STRIP_CLASS}") && page.includes("data-module-tabs") && page.includes("useActiveTabVisible(tabStripRef, tab)"));
});

console.log("\nReading history (2+ snapshots only)");
const wsWith = (history: { id: string; createdAt: string | null }[]) =>
  renderToStaticMarkup(
    createElement(HumanDesignReadingWorkspace, {
      reading, selectedProfile: null, subAccountId: "sa", subAccount: null, chartDesigns: [], reportDesigns: [], hdDesign: null, mandalaDesign: null, astroDesign: null,
      savingDesignFor: null, onSaveDesignOverride: () => {}, availableSystems: [{ key: "hd", label: "Human Design" }],
      currentSystem: "hd", onSetSystem: () => {}, hdStyleView: "traditional", onSetHdStyleView: () => {}, onBack: () => {},
      showReports: false, onShowReports: () => {}, reportsPanel: null, deletingReadingId: null, onDeleteReading: () => {},
      readingHistory: history, onSelectReading: () => {},
    }),
  );
check("one reading → no history control", () => {
  assert.ok(!wsWith([{ id: "rB", createdAt: "2026-06-01T00:00:00Z" }]).includes("data-reading-history"));
  assert.ok(!wsWith([]).includes("data-reading-history"));
});
check("two+ readings → 'Reading from [date]', newest first and marked latest, the open snapshot selected", () => {
  const html = wsWith([{ id: "rB", createdAt: "2026-06-01T12:00:00Z" }, { id: "rA", createdAt: "2026-01-01T12:00:00Z" }]);
  assert.ok(html.includes("data-reading-history") && html.includes(">Reading from<"));
  const opts = [...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<!-- -->([^<]*)<\/option>|<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map((m) => m[1] ?? m[4]);
  assert.deepEqual(opts, ["rB", "rA"]);
  assert.ok(html.includes("Jun 1, 2026") && html.includes("Jan 1, 2026") && html.includes("(latest)"));
  assert.ok(/<option value="rB" selected=""/.test(html), "the snapshot on screen is selected");
});
check("selecting a snapshot is a navigation: pushes ?readingId= (none for the latest) and keeps the workspace tab; no history rows in the library", () => {
  assert.ok(tab.includes("router.push(build({ profileId, readingId: isLatest ? null : id, view: searchParams.get(\"view\") }), { scroll: false });"));
  assert.ok(tab.includes("readingHistory={profileId ? readingHistory : []}"));
  assert.ok(!readFileSync("src/components/energetic-decoder/readings-library-table.tsx", "utf8").includes("readingHistory"));
});

console.log("\nReport Design naming");
check("rows say 'Report Design' (Report Builder's own term) — renamed/deleted designs are called out; no 'template' anywhere", () => {
  const r = reports[1];
  assert.equal(reportDesignNote(r, []), "Report Design");
  assert.equal(reportDesignNote(r, [{ id: "d", title: "Human Design Overview" }]), "Report Design");
  assert.equal(reportDesignNote(r, [{ id: "d", title: "HD Overview v2" }]), "Report Design (now “HD Overview v2”)");
  assert.equal(reportDesignNote(r, [{ id: "other", title: "x" }]), "Report Design (since deleted)");
  assert.ok(panel(reports).includes("data-report-design"));
  for (const f of ["generated-reports-panel.tsx", "readings-tab.tsx", "human-design-reading-workspace.tsx"]) {
    assert.ok(!/template/i.test(readFileSync(`src/components/energetic-decoder/${f}`, "utf8")), `${f} says "template"`);
  }
});

console.log("\nModule entry + routing");
const page = readFileSync("src/app/(dashboard)/sa/[subAccountId]/energetic-decoder/page.tsx", "utf8");
check("sidebar entry (no ?tab=) opens Home — the tab is derived from the URL every render, never one-time state", () => {
  const sidebar = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
  assert.ok(/href: "\/energetic-decoder",\s*label: "Energetic Decoder"/.test(sidebar), "sidebar links to the module root with no query");
  assert.ok(page.includes('const tab: Tab = VALID_TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "home";'));
  assert.ok(!/useState<Tab>/.test(page), "no sticky tab state");
  assert.ok(page.includes("router.push(`${pathname}?tab=${next}`"), "tab changes are navigations (Back works)");
});
check("deep links keep naming their tab, so they still land where they point", () => {
  assert.ok(readFileSync("src/components/contacts/contact-energetic-decoding.tsx", "utf8").includes("/energetic-decoder?tab=readings&profileId="));
  assert.ok(readFileSync("src/components/energetic-decoder/report-editor.tsx", "utf8").includes("energetic-decoder?tab=builder"));
});
check("the Readings tab never auto-opens a reading on its own (no profileId/readingId → library)", () => {
  assert.ok(tab.includes("if (profileId || readingId) {") && tab.includes("return <ReadingsLibraryView />;"));
  assert.ok(!tab.includes("list[0]?.id"), "no 'select the first reading' fallback");
});
check("workspace tab mirrors to ?view= synchronously (history.replaceState), so a reload right after a tab click keeps it", () => {
  assert.ok(tab.includes('window.history.replaceState(window.history.state, "", `${pathname}?${sp.toString()}`);'));
});

console.log("\nMandala on phones");
const mandala = (keepFullLabels: boolean) =>
  renderToStaticMarkup(createElement(MandalaChart, { profile: hd, gateColor: "#7c3aed", backgroundColor: "#ffffff", keepFullLabels }));
const phoneLayer = (html: string) => html.slice(html.indexOf("data-mandala-phone-labels"), html.indexOf("</g>", html.lastIndexOf("data-phone-sign")));
check("Reading → Mandala phone layer (< 420px): all four Quarters as number + name, all 12 zodiac glyphs + FULL names — no compact labels", () => {
  const html = mandala(true);
  assert.ok(html.includes('class="hidden @max-[420px]/mandala:inline" data-mandala-phone-labels'));
  const layer = phoneLayer(html);
  for (const q of ["1 – Initiation", "2 – Civilization", "3 – Duality", "4 – Mutation"]) assert.ok(layer.includes(q), q);
  for (const s of ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]) {
    assert.ok(layer.includes(`data-phone-sign="${s}"`) && layer.includes(`<tspan>${s}</tspan>`), s);
  }
  assert.equal((layer.match(/\uFE0E/g) ?? []).length, 12, "every zodiac glyph, text presentation");
  assert.ok(!/>(ARI|TAU|GEM|CAN|LEO|VIR|LIB|SCO|SAG|CAP|AQU|PIS)</.test(layer) && !/>[1-4]</.test(layer), "no abbreviations / bare quarter numbers");
  assert.ok(readFileSync("src/components/energetic-decoder/mandala-reading-view.tsx", "utf8").includes("keepFullLabels"));
});
check("phone labels are centered without dominant-baseline (WebKit ignores it on textPath): baseline arc offset by 0.35em toward the band center", () => {
  const layer = phoneLayer(mandala(true));
  assert.ok(!layer.includes("dominant-baseline"), "phone layer uses the alphabetic baseline only");
  assert.equal(PHONE_LABEL_BASELINE_EM, 0.35);
  const qMid = (MANDALA_RINGS.quarterOuter + MANDALA_RINGS.quarterInner) / 2;
  // upper half (text tops outward) → baseline inside the centerline; lower half (tops inward) → outside
  assert.equal(phoneLabelBaselineRadius({ mid: 270 }, qMid, 5.2), qMid - 0.35 * 5.2);
  assert.equal(phoneLabelBaselineRadius({ mid: 90 }, qMid, 5.2), qMid + 0.35 * 5.2);
  // the shifted baseline + the label's height stay inside each band
  for (const [mid, fs, rIn, rOut] of [[(MANDALA_RINGS.zodiacOuter + MANDALA_RINGS.zodiacInner) / 2, LEGIBLE_LABEL_TYPE.zodiacLabel, MANDALA_RINGS.zodiacInner, MANDALA_RINGS.zodiacOuter], [qMid, LEGIBLE_LABEL_TYPE.quarterLabel, MANDALA_RINGS.quarterInner, MANDALA_RINGS.quarterOuter]] as const) {
    assert.ok(mid - 0.35 * fs - 0.2 * fs > rIn && mid + 0.35 * fs + 0.2 * fs < rOut, "cap height + descender fit the band");
  }
});
check("≥ 420px (desktop): the original labels, unchanged attributes; the phone layer is hidden there", () => {
  const html = mandala(true);
  assert.equal((html.match(/class="@max-\[420px\]\/mandala:hidden" font-size="3.1" font-weight="700" fill="[^"]+" dominant-baseline="central"/g) ?? []).length, 12);
  assert.equal((html.match(/class="@max-\[420px\]\/mandala:hidden" font-size="3.9" font-weight="700" letter-spacing="0.35" fill="[^"]+" dominant-baseline="central"/g) ?? []).length, 4);
  assert.ok(html.includes(`font-size="${MANDALA_TYPE.zodiacLabel * 1.25}"`), "desktop glyph size unchanged");
});
check("every other Mandala (thumbnails, reports, public pages) keeps the original markup and 300px compact behavior; no phone layer", () => {
  const html = mandala(false);
  assert.equal((html.match(/data-zodiac-label="full" class="hidden @min-\[300px\]\/mandala:inline"/g) ?? []).length, 12);
  assert.ok(!html.includes("@max-[420px]/mandala") && !html.includes("data-mandala-phone-labels") && !html.includes("mandala-phone-arc"));
});
check("phone type fits: Sagittarius uses < 60% of its 30° arc; each label fits its band's depth", () => {
  const arc = ((30 * Math.PI) / 180) * ((MANDALA_RINGS.zodiacOuter + MANDALA_RINGS.zodiacInner) / 2);
  const l = zodiacLabelLayout("Sagittarius", LEGIBLE_LABEL_TYPE.zodiacLabel);
  assert.ok(-2 * l.glyphX < arc * 0.6, `Sagittarius at ${LEGIBLE_LABEL_TYPE.zodiacLabel}: ${(-2 * l.glyphX).toFixed(1)} of ${arc.toFixed(1)}`);
  assert.equal(LEGIBLE_LABEL_TYPE.zodiacGlyph / LEGIBLE_LABEL_TYPE.zodiacLabel, ZODIAC_GLYPH_SCALE);
  assert.ok(LEGIBLE_LABEL_TYPE.zodiacLabel < MANDALA_RINGS.zodiacOuter - MANDALA_RINGS.zodiacInner);
  assert.ok(LEGIBLE_LABEL_TYPE.quarterLabel < MANDALA_RINGS.quarterOuter - MANDALA_RINGS.quarterInner);
});
check("Mandala PDF renderer untouched by this work", () => {
  assert.equal(execSync("git diff 950c2b7 -- src/lib/energetics/reading-pdf-document.tsx src/lib/energetics/report-design-pdf-document.tsx src/lib/energetics/mandala-spec.ts", { encoding: "utf8" }), "");
});

console.log(`\n${passed} checks passed.`);
