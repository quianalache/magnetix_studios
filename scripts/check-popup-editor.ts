/**
 * Popup authoring (Wave 2A Slice 4.5) — pure editor-contract QA.
 * Run: pnpm check:popup-editor
 */
import assert from "node:assert/strict";
import type { Config, Data } from "@puckeditor/core";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { serverPuckConfig } from "../src/components/pages-funnels/puck/server-config";
import { createPopupPuckConfig } from "../src/components/pages-funnels/puck/popup-config";
import { createPopupEditorConfig } from "../src/components/pages-funnels/puck/popup-editor-config";
import { FIRESTORE_MAX_FIELD_DEPTH, POPUP_ALLOWED_BLOCKS, POPUP_CONTENT_MAX_DEPTH, fieldDepth, validatePopupContent, withPopupContent } from "../src/lib/pages-funnels/popup-content";
import {
  POPUP_BORDER_PRESETS,
  POPUP_SHADOW_PRESETS,
  applyPopupEditorChange,
  nextPopupName,
  overlayColor,
  popupFromEditorData,
  popupPublishState,
  popupToEditorData,
  presetFor,
  withPanelMaxWidth,
} from "../src/lib/pages-funnels/popup-editor";
import { DEFAULT_POPUP_STYLE, createDefaultPopup, encodePopupMapForStorage, normalizePopupMap, type PopupDefinition } from "../src/types/pages-funnels-popup";

let passed = 0;
const ok = (cond: unknown, label: string) => {
  assert.ok(cond, label);
  passed += 1;
};
const eq = (a: unknown, b: unknown, label: string) => {
  assert.deepEqual(a, b, label);
  passed += 1;
};

// ---- 1. Restricted registry: same renderers, curated set only ----
const editorConfig = createPopupEditorConfig(clientPuckConfig);
const allowed = [...POPUP_ALLOWED_BLOCKS].sort();
eq(Object.keys(editorConfig.components).sort(), allowed, "editor exposes exactly the curated Popup blocks");
for (const forbidden of ["Chart", "AnimatedCounter", "ProgressBar", "ProgressRing", "Stats", "CustomHtml", "ReadingTool", "OfferSummary", "Hero", "Tabs", "ImageGallery", "Popup"]) {
  ok(!(forbidden in editorConfig.components), `${forbidden} is not available in Popup mode`);
}
eq(
  Object.values(editorConfig.categories ?? {}).flatMap((c) => c.components ?? []).sort(),
  allowed,
  "drawer categories list exactly the curated blocks",
);
eq(Object.keys(editorConfig.categories ?? {}), ["layout", "elements", "business"], "drawer groups: Layout, Elements, Business");
for (const name of POPUP_ALLOWED_BLOCKS) {
  ok(editorConfig.components[name].render === clientPuckConfig.components[name].render, `${name} reuses the production renderer (no Popup-specific copy)`);
}
// Every slot inside a Popup only accepts Popup blocks (a slot with no allow list accepts the curated set, never nothing).
const slotProblems: string[] = [];
for (const [name, component] of Object.entries(editorConfig.components)) {
  for (const [key, field] of Object.entries((component as { fields?: Record<string, { type?: string; allow?: string[] }> }).fields ?? {})) {
    if (field?.type !== "slot") continue;
    if (!Array.isArray(field.allow) || field.allow.length === 0) slotProblems.push(`${name}.${key}: empty allow`);
    else if (field.allow.some((b) => !POPUP_ALLOWED_BLOCKS.has(b))) slotProblems.push(`${name}.${key}: ${field.allow.join(",")}`);
  }
}
eq(slotProblems, [], "every nested slot accepts only (and some) Popup blocks");
const columnAllow = (editorConfig.components.Column as unknown as { fields: { elements: { allow: string[] } } }).fields.elements.allow;
ok(columnAllow.includes("Form") && columnAllow.includes("Image") && columnAllow.includes("Video"), "a Popup Column accepts Form, Image and Video");

// ---- 2. Frame is the root ----
const root = editorConfig.root as { label?: string; fields?: Record<string, { type: string }>; render?: unknown };
eq(root.label, "Popup", "sidebar/breadcrumb root label is Popup");
eq(Object.keys(root.fields ?? {}), ["frame"], "root's only field is the Popup frame");
ok(typeof root.render === "function", "root renders the Popup editing canvas");
ok(!("pageBackground" in (root.fields ?? {})), "page background is not a Popup setting");

// ---- 3. Runtime config uses the public (server) Form ----
const runtime = createPopupPuckConfig(serverPuckConfig);
ok(runtime.components.Form.render === serverPuckConfig.components.Form.render, "runtime Popup Form is the server/public Form (reads pre-resolved forms)");
ok(runtime.components.Form.render !== clientPuckConfig.components.Form.render, "runtime Popup Form is not the editor's fetching Form");

// ---- 4. Default content ----
const fresh = createDefaultPopup("popup_t", "New popup");
const section = fresh.content.content[0] as { type: string; props: { rows: { type: string; props: { columns: { type: string; props: { width: string; elements: { type: string; props: Record<string, unknown> }[] } }[] } }[] } };
eq(section.type, "Section", "default content starts with a Section");
const column = section.props.rows[0].props.columns[0];
eq([section.props.rows[0].type, column.type], ["Row", "Column"], "Section → Row → Column");
eq(column.props.elements.map((e) => e.type), ["Heading", "Text", "Button"], "Column holds Heading, Text, Button");
eq(column.props.width, "full", "default column is full width");
eq(validatePopupContent(fresh.content), [], "default content is valid Popup content");
eq((column.props.elements[2].props.action as { type: string }).type, "none", "default Button has no action (Slice 5 adds Open/Close Popup)");
ok(!JSON.stringify(fresh.content).match(/\$\d|testimonial|guarantee|free/i), "default copy has no prices, offers or claims");
eq(fresh.trigger, { type: "manual" }, "trigger stays manual (not exposed)");

// ---- 5. Editor data mapping ----
const popupA: PopupDefinition = { ...createDefaultPopup("popup_a", "Popup A"), style: { ...DEFAULT_POPUP_STYLE, overlayOpacity: 0.4 } };
const popupB: PopupDefinition = createDefaultPopup("popup_b", "Popup B");
const editorData = popupToEditorData(popupA);
eq((editorData.root.props as { frame: { name: string } }).frame.name, "Popup A", "editor root carries the frame name");
eq((editorData.root.props as { frame: { style: { overlayOpacity: number } } }).frame.style.overlayOpacity, 0.4, "editor root carries the frame style");
eq(editorData.content, popupA.content.content, "editor content is the Popup's own tree");
const edited: Data = {
  root: { props: { frame: { name: "Renamed A", style: { ...popupA.style, panelPadding: 12 } } } },
  content: [{ type: "Heading", props: { id: "h-edit", text: "QA Popup Version B" } }],
} as Data;
const back = popupFromEditorData(popupA, edited);
eq([back.name, back.style.panelPadding], ["Renamed A", 12], "frame edits fold back onto the Popup");
eq(back.content.root, { props: {} }, "saved Popup content root stays empty (frame never leaks into content)");
eq(back.id, "popup_a", "stable id survives editing");
eq(back.trigger, popupA.trigger, "trigger is untouched by editing");
const map = { popup_a: popupA, popup_b: popupB };
const after = applyPopupEditorChange(map, "popup_a", edited);
ok(after.popup_b === popupB, "editing Popup A never touches Popup B");
eq(after.popup_a.content.content[0], edited.content[0], "Popup A gets the edit");
ok(applyPopupEditorChange(map, "popup_missing", edited) === map, "a change for a deleted Popup is dropped, not resurrected");
const roundTrip = popupFromEditorData(popupB, popupToEditorData(popupB));
eq(JSON.stringify(roundTrip), JSON.stringify(popupB), "unchanged round trip is byte-identical (no phantom autosave)");

// ---- 6. Manager helpers ----
eq(popupPublishState(popupA, null), "draft", "never published = Draft");
eq(popupPublishState(popupA, { popup_a: popupA }), "published", "unchanged since publish = Published");
eq(popupPublishState(back, { popup_a: popupA }), "changed", "edited since publish = Unpublished changes");
eq(nextPopupName({ x: { ...popupA, name: "Popup 1" } }), "Popup 2", "next default name skips taken names");

// ---- 7. Frame presets ----
eq(presetFor(POPUP_BORDER_PRESETS, DEFAULT_POPUP_STYLE.panelBorder), "subtle", "default border reads as Subtle");
eq(presetFor(POPUP_SHADOW_PRESETS, DEFAULT_POPUP_STYLE.panelShadow), "medium", "default shadow reads as Medium");
eq(presetFor(POPUP_SHADOW_PRESETS, "0 1px 2px red"), "custom", "an older custom shadow is kept and shown as Custom");
eq(withPanelMaxWidth(DEFAULT_POPUP_STYLE, 800), { ...DEFAULT_POPUP_STYLE, panelMaxWidth: 800, panelWidth: "100%" }, "width sets max width and fills up to it");
eq(withPanelMaxWidth(DEFAULT_POPUP_STYLE, 50).panelMaxWidth, 280, "width is clamped to 280px minimum");
eq(overlayColor("#160b2f", 0.58), "rgba(22, 11, 47, 0.58)", "overlay color = runtime overlay color");

// ---- 8. Popup content resolves on the page ----
const withForm: PopupDefinition = { ...popupA, content: { root: { props: {} }, content: [{ type: "Form", props: { id: "f", formId: "form_x" } }] } as Data };
const pageData = { root: { props: {} }, content: [{ type: "Heading", props: { id: "p", text: "Page" } }] } as Data;
const collectable = withPopupContent(pageData, { popup_a: withForm });
ok(JSON.stringify(collectable).includes("form_x"), "a Form inside a Popup is collected for server resolution");
ok(withPopupContent(pageData, {}) === pageData, "no Popups = page data unchanged");

// ---- 9. Firestore nesting limit (production: 20 levels saved, 21 failed — 2026-11-02 probe) ----
const probeBg = (extra: boolean) => ({ source: "none", color: { mode: "solid", solid: "", gradient: { type: "linear", angle: 135, stops: [{ id: "s1", color: "#5E2574", position: 0, ...(extra ? { probe: { x: 1 } } : {}) }, { id: "s2", color: "#E8B7C8", position: 100 }] } }, blur: { enabled: false, intensity: 0 } });
const probePopup = (extra: boolean) => ({ qa_depth_probe: { id: "qa_depth_probe", name: "p", trigger: { type: "manual" }, style: DEFAULT_POPUP_STYLE,
  content: { root: { props: {} }, content: [{ type: "Section", props: { id: "s", rows: [{ type: "Row", props: { id: "r", columns: [{ type: "Column", props: { id: "c", elements: [{ type: "Button", props: { id: "b", background: probeBg(extra) } }] } }] } }] } }] } } });
eq(fieldDepth(probePopup(false)), FIRESTORE_MAX_FIELD_DEPTH, "calibration: the payload production accepted measures exactly the limit");
eq(fieldDepth(probePopup(true)), FIRESTORE_MAX_FIELD_DEPTH + 1, "calibration: the payload production rejected measures limit + 1");
// The deepest Popup a customer can build today: Section → Row → Column → every allowed element, all with real defaultProps.
const withDefaults = (type: string, id: string, extra: Record<string, unknown> = {}) => ({ type, props: { ...(clientPuckConfig.components[type].defaultProps ?? {}), id, ...extra } });
const elements = [...POPUP_ALLOWED_BLOCKS].filter((n) => !["Section", "Row", "Column"].includes(n)).map((n, i) => withDefaults(n, `e${i}`));
const deepestPopup = (extraElements: unknown[] = []) => ({ id: "p", name: "p", trigger: { type: "manual" as const }, style: DEFAULT_POPUP_STYLE, content: { root: { props: {} }, content: [
  withDefaults("Section", "s", { rows: [withDefaults("Row", "r", { columns: [withDefaults("Column", "c", { elements: [...elements, ...extraElements] })] })] }),
] } as Data });
const asMaps = fieldDepth({ p: deepestPopup() });
eq(asMaps, FIRESTORE_MAX_FIELD_DEPTH, `OLD storage (content as maps): deepest real Popup = ${asMaps} — zero headroom (why storage changed)`);
const stored = encodePopupMapForStorage({ p: deepestPopup() });
const storedDepth = fieldDepth(stored);
ok(storedDepth <= 3, `NEW storage (content as JSON string): stored Popup map depth = ${storedDepth}, whatever the blocks contain`);
eq(normalizePopupMap(stored).p.content, deepestPopup().content, "NEW storage round-trips the Puck tree exactly");
// Future Slice 5 Button: an Open Popup action with destination metadata, plus several extra nested props.
const futureButton = withDefaults("Button", "future", {
  action: { type: "open_popup", popupId: "popup_x", destination: { kind: "popup", target: { id: "popup_x", meta: { analytics: { label: "cta", tags: ["a"] } } } } },
  styleConfig: { responsive: { mobile: { spacing: { padding: { top: { value: 8, unit: "px" } } } } } },
});
const futureStored = encodePopupMapForStorage({ p: deepestPopup([futureButton]) });
const futureContentDepth = fieldDepth(deepestPopup([futureButton]).content);
ok(fieldDepth(futureStored) <= 3, `Slice-5-style nested action + extra nested props: stored depth still ${fieldDepth(futureStored)} (content depth ${futureContentDepth}, no longer limited by Firestore)`);
ok(futureContentDepth > FIRESTORE_MAX_FIELD_DEPTH - 2, "…and that content is deeper than the OLD storage could ever have saved");
ok(POPUP_CONTENT_MAX_DEPTH - fieldDepth(deepestPopup().content) >= 25, `sanity cap leaves ${POPUP_CONTENT_MAX_DEPTH - fieldDepth(deepestPopup().content)} levels above today's deepest Popup content (${fieldDepth(deepestPopup().content)})`);
console.log(`  (stored Popup map depth ${storedDepth}/${FIRESTORE_MAX_FIELD_DEPTH}; deepest real content ${fieldDepth(deepestPopup().content)} levels, capped at ${POPUP_CONTENT_MAX_DEPTH})`);

// ---- 10. Storage codec: legacy map content, malformed entries ----
const legacy = { p: deepestPopup() };
eq(normalizePopupMap(legacy).p.content, deepestPopup().content, "legacy map-content Popups (Slices 3–4.5) still read");
eq(Object.keys(normalizePopupMap({ p: { ...stored.p, contentJson: "{not json" } })), [], "unreadable contentJson → dropped, never thrown");
eq(Object.keys(normalizePopupMap({ p: { ...stored.p, contentJson: JSON.stringify({ root: {} }) } })), [], "contentJson without a content array → dropped");
ok(!("createdAt" in encodePopupMapForStorage({ p: deepestPopup() }).p), "no undefined fields reach Firestore");

// Type-level guard: the editor config is a real Puck Config.
const _typed: Config = editorConfig;
void _typed;

console.log(`Popup editor QA: ${passed}/${passed} PASS`);
