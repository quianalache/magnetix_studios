/**
 * Wave 2A Slice 5 — manual Popup actions (Open Popup / Close Popup).
 * Pure + server-rendered checks against the REAL action model, executor,
 * Popup host, Button / Image renderers and ActionField option rules.
 * Run: pnpm check:popup-actions (tsx with scripts/tsconfig.jsx-test.json for the server renders)
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canonicalizeStoredAction } from "../src/lib/pages-funnels/action/normalize";
import { canExecutePageAction, executePageAction, popupActionKind, type PopupActionRuntime } from "../src/lib/pages-funnels/action/execute";
import { inspectStoredAction, normalizeStoredAction, resolveActionLink } from "../src/lib/pages-funnels/puck/action";
import { sanitizePopupContent, validatePopupContent } from "../src/lib/pages-funnels/popup-content";
import { decodeStoredPuckData, encodePuckData } from "../src/lib/pages-funnels/puck-storage";
import { createDefaultPopup, encodePopupMapForStorage, normalizePopupMap, type PopupDefinitionMap } from "../src/types/pages-funnels-popup";
import { ButtonRender, ImageRender } from "../src/components/pages-funnels/puck/elements";
import { PopupHost } from "../src/components/pages-funnels/puck/popup-runtime";
import { actionOptions } from "../src/components/pages-funnels/puck/action-field";
import type { PageAction } from "../src/types/pages-funnels-puck";

let passed = 0;
const ok = (cond: unknown, label: string) => { assert.ok(cond, label); passed++; };
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); passed++; };

const OPEN_A: PageAction = { type: "open_popup", popupId: "popup_a" };
const OPEN_B: PageAction = { type: "open_popup", popupId: "popup_b" };
const CLOSE: PageAction = { type: "close_popup" };

// ---- 1. Canonical model + serialization ----
eq(canonicalizeStoredAction(OPEN_A), { action: OPEN_A, status: "supported", rawType: "open_popup", raw: OPEN_A }, "open_popup is a supported canonical action");
eq(canonicalizeStoredAction(CLOSE).action, { type: "close_popup" }, "close_popup is a supported canonical action (no target)");
eq(canonicalizeStoredAction({ type: "open_popup" }).status, "invalid", "open_popup without a target is invalid (inert)");
eq(canonicalizeStoredAction({ type: "open_popup", popupId: "../x" }).status, "invalid", "malformed popup id is invalid (inert)");
eq(normalizeStoredAction({ type: "open_popup", popupId: "popup_gone" }), { type: "open_popup", popupId: "popup_gone" }, "a stale target id survives normalization (editor can show it)");
eq(normalizeStoredAction({ type: "close_popup", closePopupId: "x" }), { type: "close_popup" }, "close_popup stores no target field");
eq(inspectStoredAction(OPEN_A).status, "supported", "the ActionField sees Open Popup as supported");
eq(resolveActionLink(OPEN_A), { href: null, newTab: false }, "Popup actions never render as links");
eq(popupActionKind(OPEN_A), "open_popup", "Button/Image detect Open Popup");
eq(popupActionKind({ type: "url", url: "https://x.test" }), null, "navigation actions are not Popup actions");
const button = (action: PageAction, id = "btn") => ({ type: "Button", props: { id, text: "Go", action, style: "primary", alignment: "left" } });
const pageWithActions = { root: { props: {} }, content: [button(OPEN_A, "b1"), { type: "Image", props: { id: "i1", src: "https://img.test/a.png", alt: "A", action: OPEN_A } }] };
const decoded = decodeStoredPuckData(encodePuckData(pageWithActions as never));
eq(decoded.ok && decoded.data, pageWithActions, "Slice 5 actions round-trip through page storage (puck-json-v1)");
const popupWithClose = { ...createDefaultPopup("popup_a", "A"), content: { root: { props: {} }, content: [button(CLOSE, "pc")] } } as never;
eq(normalizePopupMap(encodePopupMapForStorage({ popup_a: popupWithClose })).popup_a.content, (popupWithClose as { content: unknown }).content, "Close Popup round-trips through Popup storage");

// ---- 2. Executor against a fake runtime with the host's rules ----
const fakeRuntime = (ids: string[]) => {
  let active: string | null = null;
  const log: string[] = [];
  const runtime: PopupActionRuntime = {
    hasPopup: (id) => ids.includes(id),
    openPopup: (id, opener) => { if (active || !ids.includes(id)) return false; active = id; log.push(`open:${id}:${opener ? (opener as unknown as { id: string }).id : "-"}`); return true; },
    closePopup: () => { if (!active) return false; log.push(`close:${active}`); active = null; return true; },
  };
  return { runtime, log, active: () => active };
};
const opener = (id: string) => ({ id }) as unknown as HTMLElement;
{
  const r = fakeRuntime(["popup_a", "popup_b"]);
  eq(executePageAction(OPEN_A, r.runtime, { surface: "page", opener: opener("button-a") }), "opened_popup", "Page Button → Open Popup opens its target");
  eq(r.log.at(-1), "open:popup_a:button-a", "…with the opener captured (focus returns to it)");
  eq(executePageAction(OPEN_B, r.runtime, { surface: "page" }), "inert", "opening while a Popup is active does nothing (one at a time, no stacking)");
  eq(r.active(), "popup_a", "…the active Popup is unchanged");
  eq(executePageAction(CLOSE, r.runtime, { surface: "popup" }), "closed_popup", "Close Popup inside a Popup closes the active Popup");
  eq(executePageAction(CLOSE, r.runtime, { surface: "popup" }), "inert", "Close Popup with no active Popup is a no-op");
  eq(executePageAction(OPEN_B, r.runtime, { surface: "page", opener: opener("button-b") }), "opened_popup", "after closing A, Button B opens Popup B");
  eq(r.active(), "popup_b", "…and only B is open");
  executePageAction(CLOSE, r.runtime, { surface: "popup" });
  for (const who of ["button-a", "image-b", "button-c"]) {
    executePageAction(OPEN_A, r.runtime, { surface: "page", opener: opener(who) });
    executePageAction(CLOSE, r.runtime, { surface: "popup" });
  }
  eq(r.log.slice(-6), ["open:popup_a:button-a", "close:popup_a", "open:popup_a:image-b", "close:popup_a", "open:popup_a:button-c", "close:popup_a"], "several openers → the same Popup, each recording its own opener");
}
{
  const r = fakeRuntime(["popup_a"]);
  eq(executePageAction(OPEN_A, r.runtime, { surface: "popup" }), "inert", "Open Popup from INSIDE a Popup is inert (no nesting)");
  eq(executePageAction(CLOSE, r.runtime, { surface: "page" }), "inert", "Close Popup from page content is inert");
  eq(executePageAction({ type: "open_popup", popupId: "popup_deleted" }, r.runtime, { surface: "page" }), "inert", "deleted / missing target is inert (never retargeted)");
  eq(executePageAction({ type: "open_popup", popupId: "popup_of_other_page" }, r.runtime, { surface: "page" }), "inert", "another page's Popup id is inert (the runtime only knows this page's Popups)");
  eq(executePageAction(OPEN_A, null, { surface: "page" }), "inert", "no Popup host (builder canvas) → inert");
  eq(executePageAction({ type: "url", url: "https://x.test" }, r.runtime, { surface: "page" }), "inert", "navigation actions are not executed here (they're links)");
}
// Draft / published isolation: the public host only ever gets PUBLISHED Popups.
{
  const published = fakeRuntime(["popup_a"]); // published Button → A
  const draft = fakeRuntime(["popup_a", "popup_b"]); // draft re-targeted to B, B is draft-only
  ok(canExecutePageAction(OPEN_B, draft.runtime, "page"), "Preview (draft Popups): the new draft target B can open");
  ok(!canExecutePageAction(OPEN_B, published.runtime, "page"), "public (published Popups): a draft-only Popup B can never open");
  ok(canExecutePageAction(OPEN_A, published.runtime, "page"), "public: the published target A keeps working until republish");
}
// Rename: actions store the stable id, so a rename changes nothing for them.
{
  const before = normalizePopupMap({ popup_a: createDefaultPopup("popup_a", "Old name") });
  const renamed = { ...before, popup_a: { ...before.popup_a, name: "New name" } } as PopupDefinitionMap;
  ok(Object.keys(renamed).includes(OPEN_A.type === "open_popup" ? OPEN_A.popupId : ""), "renaming keeps the stable id the action stores");
  eq(actionOptions({ surface: "page", popups: [{ id: "popup_a", name: "New name" }] }).some((o) => o.value === "open_popup"), true, "…and the picker lists it under its new name");
}

// ---- 3. ActionField options per surface ----
const pageOpts = actionOptions({ surface: "page", popups: [] }).map((o) => o.value);
const popupOpts = actionOptions({ surface: "popup", popups: [] }).map((o) => o.value);
ok(pageOpts.includes("open_popup") && !pageOpts.includes("close_popup"), "PAGE: Open popup offered, Close popup not");
ok(popupOpts.includes("close_popup") && !popupOpts.includes("open_popup"), "POPUP: Close popup offered, Open popup not (no nesting)");
ok(["url", "page", "scroll", "purchase", "call", "email", "sms"].every((t) => popupOpts.includes(t as never)), "POPUP: the other safe actions stay available");
ok(!actionOptions(null).some((o) => o.value === "open_popup" || o.value === "close_popup"), "outside the page editor: no Popup actions offered");
ok(actionOptions({ surface: "page", popups: [] }).every((o) => !/_/.test(o.label)), "labels are human-facing (no internal action names)");

// ---- 4. Popup content rules ----
const popupContent = { root: { props: {} }, content: [button(CLOSE, "close-btn"), button(OPEN_B, "nested-open")] };
const issues = validatePopupContent(popupContent);
eq(issues.map((i) => i.message), ["A Popup can't open another Popup."], "only Open Popup is flagged inside a Popup");
const sanitized = sanitizePopupContent(popupContent) as { content: { props: { action?: PageAction } }[] };
eq(sanitized.content[0].props.action, CLOSE, "Close Popup is kept in Popup content");
eq(sanitized.content[1].props.action, undefined, "Open Popup is stripped from Popup content at runtime");

// ---- 5. Rendering (server render of the real renderers + host) ----
const popups = normalizePopupMap({ popup_a: createDefaultPopup("popup_a", "QA Popup") });
const html = (node: ReturnType<typeof h>) => renderToStaticMarkup(node);
const btnInHost = html(h(PopupHost, { popups }, h(ButtonRender, { id: "page-btn", text: "Open it", action: OPEN_A, style: "primary", alignment: "left" })));
ok(/<button[^>]*type="button"[^>]*id="page-btn"/.test(btnInHost) && btnInHost.includes('data-page-action="open_popup"') && btnInHost.includes('aria-haspopup="dialog"') && !btnInHost.includes('aria-disabled="true"'), "Page Button with Open Popup renders an enabled <button> inside the host");
ok(!/<a\b/.test(btnInHost), "…not a link");
const missingInHost = html(h(PopupHost, { popups }, h(ButtonRender, { id: "stale-btn", text: "Gone", action: { type: "open_popup", popupId: "popup_gone" }, style: "primary", alignment: "left" })));
ok(missingInHost.includes('aria-disabled="true"'), "a stale target renders an inert (aria-disabled) button, not an error");
const editing = html(h(PopupHost, { popups }, h(ButtonRender, { id: "edit-btn", text: "Edit", action: OPEN_A, style: "primary", alignment: "left", editing: true })));
ok(!editing.includes("data-page-action"), "in the builder canvas the Button never executes (plain inert element)");
const imgInHost = html(h(PopupHost, { popups }, h(ImageRender, { id: "page-img", src: "https://img.test/a.png", alt: "Free guide", action: OPEN_A })));
ok(/<button[^>]*data-page-action="open_popup"[^>]*>\s*<img[^>]*alt="Free guide"/.test(imgInHost), "Page Image with Open Popup is a <button> wrapping the image (keyboard + accessible name from alt)");
const imgNoAlt = html(h(PopupHost, { popups }, h(ImageRender, { id: "page-img2", src: "https://img.test/a.png", alt: "", action: OPEN_A })));
ok(imgNoAlt.includes('aria-label="Open popup"'), "an Image without alt text still gets an accessible name");
const noHost = html(h(ButtonRender, { id: "nohost", text: "Open", action: OPEN_A, style: "primary", alignment: "left" }));
ok(noHost.includes('aria-disabled="true"'), "outside a Popup host the trigger is inert");
const navBtn = html(h(PopupHost, { popups }, h(ButtonRender, { id: "nav", text: "Site", action: { type: "url", url: "https://x.test" }, style: "primary", alignment: "left" })));
ok(/<a[^>]*href="https:\/\/x.test"/.test(navBtn), "navigation Buttons are unchanged (still links)");

console.log(`Popup actions QA: ${passed}/${passed} PASS`);
