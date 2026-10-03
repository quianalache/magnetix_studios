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
  applyEditorPreset,
  buildEditorSavePayload,
  dirtySystems,
  editorNameError,
  initChartDesignEditorState,
  isEditorDirty,
  previewDesign,
  setEditorField,
  setEditorHouseSystem,
  setEditorName,
} from "../src/lib/energetics/chart-design-editor-state";
import { isGuardedNavigationClick } from "../src/lib/unsaved-changes";
import { CHART_DESIGN_SECTIONS } from "../src/components/energetic-decoder/chart-design-controls";

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
  assert.equal(s.houseSystem, null); // not the default design → no calculation setting
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
check("house system: only on the default design, sent as a calculation setting", () => {
  const other = initChartDesignEditorState(makeSet(false));
  assert.equal(setEditorHouseSystem(other, "equal"), other);
  let def = initChartDesignEditorState(makeSet(true));
  assert.equal(def.houseSystem, "whole");
  def = setEditorHouseSystem(def, "equal");
  assert.deepEqual(buildEditorSavePayload(def), { astrologyCalculation: { houseSystem: "equal" } });
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

console.log("\nPresets");
check("the four presets are exactly the ones on origin/main, value for value", () => {
  const original = execSync("git show origin/main:src/components/energetic-decoder/chart-designs-tab.tsx", { encoding: "utf8" });
  const block = original.slice(original.indexOf("const PRESETS"), original.indexOf("function ChartDesignCard("));
  for (const system of ["humanDesign", "mandala", "astrology"] as const) {
    assert.deepEqual(CHART_DESIGN_PRESETS[system].map((p) => p.name), ["Magnetix Violet", "Monochrome", "Warm Sunset", "Midnight"]);
    for (const preset of CHART_DESIGN_PRESETS[system]) {
      const literal = `{ name: "${preset.name}", swatch: ${JSON.stringify(preset.swatch).replace(/,/g, ", ")}, values: { ${Object.entries(preset.values)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ")} } }`;
      assert.ok(block.includes(literal), `${system} / ${preset.name} differs from origin/main`);
    }
  }
});
check("applying a preset changes only that system's unsaved values, never the 9 center colors", () => {
  let s = initChartDesignEditorState(makeSet(false));
  const before = structuredClone(s.values);
  s = applyEditorPreset(s, "mandala", "Midnight");
  const preset = CHART_DESIGN_PRESETS.mandala.find((p) => p.name === "Midnight")!;
  for (const [k, v] of Object.entries(preset.values)) assert.equal(s.values.mandala[k], v);
  assert.deepEqual(s.values.humanDesign, before.humanDesign);
  assert.deepEqual(s.values.astrology, before.astrology);
  assert.deepEqual(dirtySystems(s), ["mandala"]);
  let h = initChartDesignEditorState(makeSet(false));
  h = applyEditorPreset(h, "humanDesign", "Warm Sunset");
  assert.equal(h.values.humanDesign.headCenterColor, base.headCenterColor);
  assert.equal(applyEditorPreset(h, "humanDesign", "Not a preset"), h);
});
check("a preset is a starting point, not a saved design: nothing persists until Save", () => {
  let s = initChartDesignEditorState(makeSet(false));
  s = applyEditorPreset(s, "astrology", "Monochrome");
  s = setEditorField(s, "astrology", "backgroundColor", "#eeeeee");
  assert.deepEqual(buildEditorSavePayload(s), { astrology: { wheelAccentColor: "#27272a", backgroundColor: "#eeeeee" } });
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
