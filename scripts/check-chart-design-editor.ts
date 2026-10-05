/**
 * Unified Chart Designs (Batch 2: library + editor) — pure checks for the
 * editor's state logic, presets and the unsaved-changes rule. No emulator.
 *
 * Run: pnpm exec tsx scripts/check-chart-design-editor.ts
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import type { ChartDesign, ChartDesignSystem } from "../src/types/chart-design";
import type { ChartDesignSetWithMembers } from "../src/types/chart-design-set";
import { CHART_DESIGN_SYSTEM_FIELDS } from "../src/lib/energetics/chart-design-fields";
import { CHART_DESIGN_PRESETS } from "../src/lib/energetics/chart-design-presets";
import {
  buildEditorSavePayload,
  dirtyFields,
  dirtySystems,
  editorNameError,
  initChartDesignEditorState,
  isEditorDirty,
  previewDesign,
  setEditorField,
  setEditorName,
} from "../src/lib/energetics/chart-design-editor-state";
import { isGuardedNavigationClick } from "../src/lib/unsaved-changes";
import { readFileSync } from "node:fs";
import {
  CHART_DESIGN_STARTERS,
  planStarterDesigns,
  starterPresetValues,
  starterSetId,
  starterSystemValues,
} from "../src/lib/energetics/chart-design-starters";
import type { ChartDesignSet } from "../src/types/chart-design-set";
import { CHART_DESIGN_SECTIONS } from "../src/components/energetic-decoder/chart-design-controls";
import {
  CHART_PREVIEW_MAX_SCALE,
  CHART_PREVIEW_NATURAL_WIDTH,
  EDITOR_WORKSPACE_MIN_HEIGHT,
  editorWorkspaceHeight,
  editorWorkspaceHeightBelowStickyBar,
  previewFitScale,
} from "../src/lib/energetics/chart-design-preview-fit";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const base = {
  subAccountId: "sa",
  agencyId: "ag",
  isDefault: false,
  createdAt: null,
  updatedAt: null,
  chartDefinedColor: "#d4d4d8",
  channelsColor: "#52525b",
  gatesColor: "#18181b",
  personalityActivationColor: "#18181b",
  designActivationColor: "#9a3412",
  arrowColor: "#3f3f46",
  arrowStyle: "solid",
  planetBoxColor: "#f4f4f5",
  planetBoxMode: "fullBox",
  planetBoxBorderRadius: 6,
  centersMode: "uniform",
  headCenterColor: "#e49e4b",
  ajnaCenterColor: "#a19a5c",
  throatCenterColor: "#bf5a0f",
  gCenterColor: "#e49e4b",
  heartCenterColor: "#a23423",
  spleenCenterColor: "#bf5a0f",
  sacralCenterColor: "#a23423",
  solarPlexusCenterColor: "#bf5a0f",
  rootCenterColor: "#bf5a0f",
  backgroundColor: "#ffffff",
  houseSystem: "placidus",
  wheelAccentColor: "#5E2574",
  mandalaZodiacColor: "#8b5cf6",
  mandalaGateRingColor: "#71717a",
  mandalaQuadrantColor: "#71717a",
} as const;

function record(id: string, system: ChartDesignSystem, extra: Partial<ChartDesign> = {}): ChartDesign {
  return { ...base, id, system, name: "Design", ownerSetId: "set1", ...extra } as ChartDesign;
}

function makeSet(isDefault: boolean): ChartDesignSetWithMembers {
  return {
    id: "set1",
    subAccountId: "sa",
    agencyId: "ag",
    name: "Client Premium",
    isDefault,
    members: { humanDesign: "hd", mandala: "md", astrology: "as", frequency: null },
    createdAt: null,
    updatedAt: null,
    designs: {
      humanDesign: record("hd", "humanDesign", { chartDefinedColor: "#c2410c" }),
      mandala: record("md", "mandala", { chartDefinedColor: "#111111", backgroundColor: "#fefefe" }),
      astrology: record("as", "astrology", { houseSystem: "whole" }),
    },
  };
}

console.log("\nEditor state");
check("loads each system's own values (only its own fields) and starts clean", () => {
  const s = initChartDesignEditorState(makeSet(false));
  for (const system of ["humanDesign", "mandala", "astrology"] as const) {
    assert.deepEqual(Object.keys(s.values[system]).sort(), [...CHART_DESIGN_SYSTEM_FIELDS[system]].sort());
  }
  assert.equal(s.values.humanDesign.chartDefinedColor, "#c2410c");
  assert.equal(s.values.mandala.chartDefinedColor, "#111111");
  assert.equal(isEditorDirty(s), false);
  assert.equal(buildEditorSavePayload(s), null);
});
check("editing one system never changes another (independent customization)", () => {
  let s = initChartDesignEditorState(makeSet(false));
  s = setEditorField(s, "humanDesign", "backgroundColor", "#000000");
  assert.equal(s.values.humanDesign.backgroundColor, "#000000");
  assert.equal(s.values.mandala.backgroundColor, "#fefefe");
  assert.equal(s.values.astrology.backgroundColor, "#ffffff");
  assert.deepEqual(dirtySystems(s), ["humanDesign"]);
});
check("fields outside a system's allow-list are ignored", () => {
  const s = initChartDesignEditorState(makeSet(true));
  assert.equal(setEditorField(s, "astrology", "houseSystem", "equal"), s);
  assert.equal(setEditorField(s, "mandala", "arrowStyle", "outline"), s);
});
check("edits in several sections survive switching and all go in one save", () => {
  let s = initChartDesignEditorState(makeSet(false));
  s = setEditorField(s, "humanDesign", "chartDefinedColor", "#123456");
  s = setEditorField(s, "mandala", "mandalaZodiacColor", "#654321");
  s = setEditorField(s, "astrology", "wheelAccentColor", "#abcdef");
  s = setEditorName(s, "  Renamed  ");
  assert.deepEqual(buildEditorSavePayload(s), {
    name: "Renamed",
    humanDesign: { chartDefinedColor: "#123456" },
    mandala: { mandalaZodiacColor: "#654321" },
    astrology: { wheelAccentColor: "#abcdef" },
  });
});
check("reverting an edit makes it clean again; empty names are refused", () => {
  let s = initChartDesignEditorState(makeSet(false));
  s = setEditorField(s, "humanDesign", "chartDefinedColor", "#000000");
  s = setEditorField(s, "humanDesign", "chartDefinedColor", "#c2410c");
  assert.equal(isEditorDirty(s), false);
  assert.equal(buildEditorSavePayload(s), null);
  assert.ok(editorNameError(setEditorName(s, "   ")));
  assert.equal(editorNameError(s), null);
});
check("a design save never carries a calculation setting (house system lives in Reading Configuration)", () => {
  const def = initChartDesignEditorState(makeSet(true));
  assert.equal("houseSystem" in def, false);
  assert.equal(setEditorField(def, "astrology", "houseSystem", "equal"), def);
  let s = setEditorField(def, "astrology", "wheelAccentColor", "#818cf8");
  s = setEditorField(s, "astrology", "backgroundColor", "#000000");
  const payload = buildEditorSavePayload(s)!;
  assert.deepEqual(Object.keys(payload), ["astrology"]);
  assert.equal("houseSystem" in payload.astrology!, false);
});
check("preview shows the saved record with unsaved values on top", () => {
  let s = initChartDesignEditorState(makeSet(false));
  s = setEditorField(s, "mandala", "mandalaQuadrantColor", "#00ff00");
  const p = previewDesign(makeSet(false).designs.mandala, s.values.mandala)!;
  assert.equal(p.mandalaQuadrantColor, "#00ff00");
  assert.equal(p.id, "md");
  assert.equal(previewDesign(null, s.values.mandala), null);
});
check("every editable field appears in exactly one editor section", () => {
  for (const system of ["humanDesign", "mandala", "astrology"] as const) {
    const inSections = CHART_DESIGN_SECTIONS[system].flatMap((sec) => sec.fields);
    assert.equal(new Set(inSections).size, inSections.length, `${system}: a field is listed twice`);
    assert.deepEqual([...inSections].sort(), [...CHART_DESIGN_SYSTEM_FIELDS[system]].sort(), `${system}: sections don't match the allow-list`);
  }
});

console.log("\nReady-made designs (former presets)");
check("the four looks keep exactly their established values (pre-unification source, 0046d99)", () => {
  const original = execSync("git show 0046d99:src/components/energetic-decoder/chart-designs-tab.tsx", { encoding: "utf8" });
  const block = original.slice(original.indexOf("const PRESETS"), original.indexOf("function ChartDesignCard("));
  for (const system of ["humanDesign", "mandala", "astrology"] as const) {
    assert.deepEqual(CHART_DESIGN_PRESETS[system].map((p) => p.name), ["Magnetix Violet", "Monochrome", "Warm Sunset", "Midnight"]);
    for (const preset of CHART_DESIGN_PRESETS[system]) {
      const literal = `{ name: "${preset.name}", swatch: ${JSON.stringify(preset.swatch).replace(/,/g, ", ")}, values: { ${Object.entries(preset.values)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ")} } }`;
      assert.ok(block.includes(literal), `${system} / ${preset.name} differs from the established values`);
    }
  }
  assert.deepEqual(CHART_DESIGN_STARTERS.map((x) => x.name), ["Magnetix Violet", "Monochrome", "Warm Sunset", "Midnight"]);
});
check("each system gets only its own preset values; everything else comes from the Default", () => {
  const def = makeSet(true);
  for (const starter of CHART_DESIGN_STARTERS) {
    for (const system of ["humanDesign", "mandala", "astrology"] as const) {
      const preset = CHART_DESIGN_PRESETS[system].find((p) => p.name === starter.name)!;
      assert.deepEqual(starterPresetValues(starter.key, system), preset.values, `${starter.key}/${system}`);
      const values = starterSystemValues(def.designs[system]!, starter.key, system);
      for (const [k, v] of Object.entries(preset.values)) assert.equal(values[k], v, `${starter.key}/${system}.${k}`);
      for (const [k, v] of Object.entries(def.designs[system]!)) {
        if (["id", "subAccountId", "agencyId", "system", "name", "isDefault", "ownerSetId", "createdAt", "updatedAt"].includes(k)) {
          assert.equal(k in values, false, `${k} must not be copied`);
        } else if (!(k in preset.values)) assert.deepEqual(values[k], v, `${starter.key}/${system}.${k} should come from the Default`);
      }
    }
  }
  // Human Design colors never land on Mandala/Astrology: the Mandala record keeps its own (Default) center colors etc.
  const mandala = starterSystemValues(makeSet(true).designs.mandala!, "warm-sunset", "mandala");
  assert.equal(mandala.channelsColor, base.channelsColor);
  assert.equal(mandala.chartDefinedColor, "#c2410c"); // Warm Sunset's own Mandala value
  const astro = starterSystemValues(makeSet(true).designs.astrology!, "midnight", "astrology");
  assert.equal(astro.chartDefinedColor, base.chartDefinedColor);
  assert.equal(astro.houseSystem, "whole"); // copied from the Default record as is; not a design setting
});
function setsFor(...extra: Partial<ChartDesignSet>[]): ChartDesignSet[] {
  const def = makeSet(true);
  const { designs: _d, ...defSet } = def;
  void _d;
  return [defSet, ...extra.map((e, i) => ({ ...defSet, id: `custom${i}`, isDefault: false, name: "Custom", members: { humanDesign: "x", mandala: "y", astrology: "z", frequency: null }, ...e }) as ChartDesignSet)];
}
const defDesigns = Object.values(makeSet(true).designs) as ChartDesign[];
check("plans four complete, independent designs with deterministic ids from the Default", () => {
  const plan = planStarterDesigns({ subAccountId: "sa", designs: defDesigns, sets: setsFor(), marker: null });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.creates.map((c) => [c.key, c.name, c.setId]), CHART_DESIGN_STARTERS.map((s) => [s.key, s.name, starterSetId("sa", s.key)]));
  const ids = plan.creates.flatMap((c) => Object.values(c.members).map((m) => m.id));
  assert.equal(new Set(ids).size, 12, "12 distinct records — nothing shared");
  for (const c of plan.creates) {
    assert.deepEqual(Object.keys(c.members).sort(), ["astrology", "humanDesign", "mandala"]);
    assert.deepEqual(Object.values(c.members).map((m) => m.copiedFrom).sort(), ["as", "hd", "md"]);
  }
});
check("name collisions: the workspace's own design is untouched; the ready-made one gets a distinct name", () => {
  const plan = planStarterDesigns({
    subAccountId: "sa",
    designs: defDesigns,
    sets: setsFor({ name: "monochrome " }, { id: "c2", name: "Midnight" }, { id: "c3", name: "Midnight (ready-made)" }),
    marker: null,
  });
  const byKey = Object.fromEntries(plan.creates.map((c) => [c.key, c]));
  assert.equal(byKey.monochrome.name, "Monochrome (ready-made)");
  assert.equal(byKey.monochrome.renamedBecauseTaken, "Monochrome");
  assert.equal(byKey.midnight.name, "Midnight (ready-made 2)");
  assert.equal(byKey["magnetix-violet"].name, "Magnetix Violet");
});
check("idempotent: already-added (even if deleted since) or existing ready-made designs are never added again", () => {
  const marked = planStarterDesigns({ subAccountId: "sa", designs: defDesigns, sets: setsFor(), marker: { version: 1, seeded: ["magnetix-violet", "monochrome"] } });
  assert.deepEqual(marked.creates.map((c) => c.key), ["warm-sunset", "midnight"]);
  const existing = planStarterDesigns({ subAccountId: "sa", designs: defDesigns, sets: setsFor({ id: "renamedStarter", name: "My Sunset", starter: { key: "warm-sunset", version: 1 } }), marker: null });
  assert.equal(existing.creates.some((c) => c.key === "warm-sunset"), false);
  const all = planStarterDesigns({ subAccountId: "sa", designs: defDesigns, sets: setsFor(), marker: { version: 1, seeded: CHART_DESIGN_STARTERS.map((x) => x.key) } });
  assert.equal(all.status, "nothing-to-do");
});
check("unmigrated or incomplete workspaces are never seeded", () => {
  assert.equal(planStarterDesigns({ subAccountId: "sa", designs: defDesigns, sets: [], marker: null }).status, "not-migrated");
  const broken = setsFor();
  broken[0] = { ...broken[0], members: { ...broken[0].members, mandala: "missing" } };
  assert.equal(planStarterDesigns({ subAccountId: "sa", designs: defDesigns, sets: broken, marker: null }).status, "blocked");
});
check("the editor has no color presets any more", () => {
  for (const file of ["src/components/energetic-decoder/chart-design-editor.tsx", "src/components/energetic-decoder/chart-design-controls.tsx", "src/lib/energetics/chart-design-editor-state.ts"]) {
    const src = readFileSync(file, "utf8");
    for (const banned of ["Color presets", "ChartDesignPresetChips", "applyEditorPreset", "CHART_DESIGN_PRESETS", "chart-design-presets"]) {
      assert.equal(src.includes(banned), false, `${file} still contains ${banned}`);
    }
  }
});

console.log("\nEditor layout (shared shell: controls left, live preview right)");
check("the preview scales uniformly to fit both width and height — never cropped, never distorted", () => {
  // width-bound
  assert.equal(previewFitScale({ boxWidth: 540, boxHeight: 900, naturalWidth: 1080, naturalHeight: 700 }), 0.5);
  // height-bound
  assert.equal(previewFitScale({ boxWidth: 800, boxHeight: 320, naturalWidth: 640, naturalHeight: 640 }), 0.5);
  // never above the system's cap; width-only when no height is given (stacked layout)
  assert.equal(previewFitScale({ boxWidth: 2000, boxHeight: 2000, naturalWidth: 640, naturalHeight: 640, maxScale: 1.2 }), 1.2);
  assert.equal(previewFitScale({ boxWidth: 320, boxHeight: 0, naturalWidth: 640, naturalHeight: 9999 }), 0.5);
  // nothing shown until sizes are known
  assert.equal(previewFitScale({ boxWidth: 0, boxHeight: 500, naturalWidth: 640, naturalHeight: 640 }), 0);
  assert.equal(previewFitScale({ boxWidth: 500, boxHeight: 500, naturalWidth: 640, naturalHeight: 0 }), 0);
  for (const [w, h, nw, nh] of [[708, 490, 1080, 672], [548, 390, 640, 640], [940, 670, 1080, 672]]) {
    const k = previewFitScale({ boxWidth: w, boxHeight: h, naturalWidth: nw, naturalHeight: nh, maxScale: 1.2 });
    assert.ok(nw * k <= w + 1e-9 && nh * k <= h + 1e-9, "scaled chart fits inside the box");
  }
  for (const system of ["humanDesign", "mandala", "astrology"] as const) assert.ok(CHART_PREVIEW_MAX_SCALE[system] >= 1);
});
check("Human Design previews at a width that keeps its Design | BodyGraph | Personality columns", () => {
  const renderer = readFileSync("src/components/energetic-decoder/human-design-full-chart.tsx", "utf8");
  // The renderer switches to three columns at its own container's @5xl (64rem = 1024px of inner width) and pads 1rem each side.
  assert.ok(renderer.includes("@5xl/hdfc:grid-cols-["), "renderer breakpoint moved — re-check CHART_PREVIEW_NATURAL_WIDTH");
  assert.ok(/@container\/hdfc rounded-2xl p-4/.test(renderer), "renderer padding moved — re-check CHART_PREVIEW_NATURAL_WIDTH");
  assert.ok(CHART_PREVIEW_NATURAL_WIDTH.humanDesign - 32 >= 1024);
});
check("the side-by-side workspace fills the page area below the header, with a floor for short windows", () => {
  assert.equal(editorWorkspaceHeight({ workspaceTop: 278, areaBottom: 876 }), 598);
  assert.equal(editorWorkspaceHeight({ workspaceTop: 600, areaBottom: 700 }), EDITOR_WORKSPACE_MIN_HEIGHT);
});
check("with the sticky tab bar, the workspace fills the page area below it once the header scrolls away", () => {
  // 1440×900: page area 836px tall, tab bar 49px, 16px gap, 48px of bottom padding (page + wrapper).
  assert.equal(editorWorkspaceHeightBelowStickyBar({ areaHeight: 836, stickyBarHeight: 49, gapAbove: 16, bottomGap: 48 }), 723);
  // independent of how tall the header above is — that part scrolls away
  assert.ok(
    editorWorkspaceHeightBelowStickyBar({ areaHeight: 836, stickyBarHeight: 49, gapAbove: 16, bottomGap: 48 }) >
      editorWorkspaceHeight({ workspaceTop: 278, areaBottom: 812 }),
    "reclaims the header's height",
  );
  assert.equal(editorWorkspaceHeightBelowStickyBar({ areaHeight: 300, stickyBarHeight: 49, gapAbove: 16, bottomGap: 48 }), EDITOR_WORKSPACE_MIN_HEIGHT);
});
check("the tab bar is the one sticky element: header scrolls away, Save stays reachable, no scroll trap", () => {
  const editor = readFileSync("src/components/energetic-decoder/chart-design-editor.tsx", "utf8");
  const shell = readFileSync("src/components/energetic-decoder/chart-design-editor-workspace.tsx", "utf8");
  const layout = readFileSync("src/app/(dashboard)/layout.tsx", "utf8");
  assert.equal(editor.match(/data-editor-sticky-bar/g)?.length, 1, "exactly one tab bar");
  assert.equal(editor.match(/className="[^"]*\bsticky\b/g)?.length, 1, "only the tab bar is sticky (the header scrolls)");
  // The bar's negative offset must equal the page area's padding (p-4 / md:p-6) so it pins flush to the top.
  assert.ok(layout.includes('"flex-1 overflow-y-auto p-4 md:p-6"'), "page padding changed — update the tab bar's -top-4 / md:-top-6");
  assert.ok(/sticky -top-4 [^"]*md:-top-6/.test(editor));
  assert.ok(editor.includes("stickyBarRef={tabBarRef}"), "the workspace sizes itself below the tab bar");
  assert.ok(editor.includes("data-editor-compact-save") && /!readOnly && !headerActionsVisible/.test(editor), "compact Save only for admins, only once the header's Save is out of view");
  assert.ok(!shell.includes("overscroll-contain"), "the controls column must let scrolling continue to the page at its ends");
});
check("each section can tell whether its own fields have unsaved edits", () => {
  let s = initChartDesignEditorState(makeSet(false));
  assert.deepEqual(dirtyFields(s, "humanDesign"), []);
  s = setEditorField(s, "humanDesign", "arrowStyle", "outline");
  s = setEditorField(s, "mandala", "mandalaZodiacColor", "#000000");
  assert.deepEqual(dirtyFields(s, "humanDesign"), ["arrowStyle"]);
  assert.deepEqual(dirtyFields(s, "mandala"), ["mandalaZodiacColor"]);
  assert.deepEqual(dirtyFields(s, "astrology"), []);
});
check("every system's sections are described, and each system keeps only its own options", () => {
  for (const system of ["humanDesign", "mandala", "astrology"] as const) {
    for (const section of CHART_DESIGN_SECTIONS[system]) assert.ok(section.description.trim().length > 0, `${system}/${section.title}`);
  }
  assert.deepEqual(CHART_DESIGN_SECTIONS.astrology.map((x) => x.title), ["Wheel", "Background"]);
  assert.equal(CHART_DESIGN_SECTIONS.astrology.flatMap((x) => x.fields).includes("houseSystem"), false);
  assert.equal(CHART_DESIGN_SECTIONS.mandala.flatMap((x) => x.fields).includes("arrowStyle"), false);
});
check("one shared shell hosts every system's controls + preview (no per-system layout copies)", () => {
  const editor = readFileSync("src/components/energetic-decoder/chart-design-editor.tsx", "utf8");
  assert.equal(editor.match(/<ChartDesignEditorWorkspace\b/g)?.length, 1);
  assert.equal(editor.match(/<ChartPreviewFit\b/g)?.length, 1);
  assert.ok(editor.includes('size="large"'), "the editor previews with the real large renderers");
  assert.ok(!/lg:col-span-|lg:grid-cols-12/.test(editor), "the old preview/controls grid is gone");
  assert.ok(editor.includes("Frequency styling is coming soon"), "Frequency stays Coming soon");
});

console.log("\nUnsaved-changes guard");
check("asks only before a plain click that leaves this page with unsaved changes", () => {
  const at = "https://crm.example.com/sa/x/energetic-decoder/chart-designs/set1";
  const click = (href: string | null, extra: Partial<Parameters<typeof isGuardedNavigationClick>[0]> = {}) =>
    isGuardedNavigationClick({ dirty: true, href, currentUrl: at, target: null, download: false, button: 0, modifierKey: false, ...extra });
  assert.equal(click("/sa/x/energetic-decoder?tab=chartDesigns"), true);
  assert.equal(click("/sa/x/contacts"), true);
  assert.equal(click("https://other.example.com/"), true);
  assert.equal(click("/sa/x/energetic-decoder?tab=chartDesigns", { dirty: false }), false);
  assert.equal(click("#section"), false);
  assert.equal(click(at), false);
  assert.equal(click("/sa/x/contacts", { target: "_blank" }), false);
  assert.equal(click("/sa/x/contacts", { modifierKey: true }), false);
  assert.equal(click("/sa/x/contacts", { button: 1 }), false);
  assert.equal(click("/file.pdf", { download: true }), false);
  assert.equal(click("mailto:a@b.c"), false);
  assert.equal(click(null), false);
});

console.log(`\n${passed} checks passed.`);
