/**
 * Wave 2A Slice 6 — automatic Popup triggers (Delay + Exit intent).
 * Deterministic checks against the REAL trigger model, creation order,
 * coordinator (fake clock + fake exit gestures), browser exit-intent
 * listener (fake document/window), editor frame round trip, manager
 * summary, publish state and the Popup host's server render.
 * Run: pnpm check:popup-triggers
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  comparePopupCreationOrder,
  createDefaultPopup,
  encodePopupMapForStorage,
  normalizePopupMap,
  normalizePopupTrigger,
  parsePopupTrigger,
  popupTriggerSummary,
  type PopupDefinition,
  type PopupDefinitionMap,
  type PopupTrigger,
} from "../src/types/pages-funnels-popup";
import {
  EXIT_INTENT_DESKTOP_QUERY,
  automaticPopupPlan,
  browserExitIntent,
  isTopExit,
  startAutomaticPopupTriggers,
  type AutomaticPopupState,
} from "../src/lib/pages-funnels/popup-triggers";
import { popupFromEditorData, popupPublishState, popupToEditorData } from "../src/lib/pages-funnels/popup-editor";
import { PopupHost } from "../src/components/pages-funnels/puck/popup-runtime";

let passed = 0;
const ok = (cond: unknown, label: string) => { assert.ok(cond, label); passed++; };
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); passed++; };

// ---- 1. Trigger model + validation ----
eq(parsePopupTrigger({ type: "manual" }), { ok: true, trigger: { type: "manual" } }, "manual is valid");
eq(parsePopupTrigger({ type: "delay", delaySeconds: 10 }), { ok: true, trigger: { type: "delay", delaySeconds: 10 } }, "delay 10s is valid");
eq(parsePopupTrigger({ type: "delay", delaySeconds: 1 }).ok, true, "delay 1s (minimum) is valid");
eq(parsePopupTrigger({ type: "delay", delaySeconds: 3600 }).ok, true, "delay 3600s (maximum) is valid");
eq(parsePopupTrigger({ type: "exit_intent" }), { ok: true, trigger: { type: "exit_intent" } }, "exit intent is valid");
eq(parsePopupTrigger({ type: "delay", delaySeconds: 5, oncePerPageView: true }), { ok: true, trigger: { type: "delay", delaySeconds: 5 } }, "legacy oncePerPageView flag is dropped, not duplicated");
eq(parsePopupTrigger({ type: "exit_intent", oncePerPageView: false }), { ok: true, trigger: { type: "exit_intent" } }, "legacy exit-intent flag is dropped");
eq(parsePopupTrigger(undefined), { ok: true, trigger: { type: "manual" } }, "a missing (legacy) trigger is Manual");
for (const [raw, label] of [
  [{ type: "delay" }, "delay without seconds"],
  [{ type: "delay", delaySeconds: 0 }, "delay zero"],
  [{ type: "delay", delaySeconds: -5 }, "delay negative"],
  [{ type: "delay", delaySeconds: "10" }, "delay as a string"],
  [{ type: "delay", delaySeconds: Number.NaN }, "delay NaN"],
  [{ type: "delay", delaySeconds: Number.POSITIVE_INFINITY }, "delay Infinity"],
  [{ type: "delay", delaySeconds: 3601 }, "delay above 3600"],
  [{ type: "delay", delaySeconds: 1e12 }, "absurd delay"],
  [{ type: "delay", delaySeconds: 2.5 }, "fractional delay"],
  [{ type: "scroll", percent: 50 }, "unknown trigger type"],
  ["delay", "a bare string"],
] as const) {
  eq(parsePopupTrigger(raw).ok, false, `save rejects ${label}`);
  eq(normalizePopupTrigger(raw), { type: "manual" }, `rendering reads ${label} as Manual (never auto-opens)`);
}
ok(/1 to 3600/.test((parsePopupTrigger({ type: "delay", delaySeconds: 0 }) as { error: string }).error), "the delay error names the accepted range");
eq(createDefaultPopup("popup_new").trigger, { type: "manual" }, "a new Popup starts Manual");
eq(popupTriggerSummary({ type: "manual" }), "Manual", "summary: Manual");
eq(popupTriggerSummary({ type: "delay", delaySeconds: 10 }), "Delay · 10s", "summary: Delay · 10s");
eq(popupTriggerSummary({ type: "exit_intent" }), "Exit intent", "summary: Exit intent");

// ---- 2. Storage + reads ----
const popup = (id: string, trigger: PopupTrigger, createdAt?: string): PopupDefinition => ({ ...createDefaultPopup(id, id), trigger, ...(createdAt ? { createdAt } : {}) });
const stored = encodePopupMapForStorage({ popup_d: popup("popup_d", { type: "delay", delaySeconds: 7 }, "2026-11-03T10:00:00.000Z") });
eq(stored.popup_d.trigger, { type: "delay", delaySeconds: 7 }, "trigger is stored as plain Popup metadata");
ok(!stored.popup_d.contentJson.includes("delaySeconds"), "trigger is not inside the puck-json-v1 content");
eq(normalizePopupMap(stored).popup_d.trigger, { type: "delay", delaySeconds: 7 }, "trigger round-trips through storage");
const legacy = normalizePopupMap({ popup_l: { id: "popup_l", name: "Legacy", style: {}, content: { root: { props: {} }, content: [] } } });
eq(legacy.popup_l?.trigger, { type: "manual" }, "a stored Popup with no trigger is kept and reads as Manual");
const badStored = normalizePopupMap({ popup_x: { ...stored.popup_d, id: "popup_x", trigger: { type: "delay", delaySeconds: -1 } } });
eq(badStored.popup_x?.trigger, { type: "manual" }, "a malformed stored trigger reads as Manual (public page stays safe)");

// ---- 3. Creation order ----
const order = [
  { id: "popup_b", createdAt: "2026-11-03T10:00:00.000Z" },
  { id: "popup_a", createdAt: "2026-11-03T10:00:00.000Z" },
  { id: "popup_c", createdAt: "2026-11-01T09:00:00.000Z" },
  { id: "popup_z" },
].sort(comparePopupCreationOrder).map((p) => p.id);
eq(order, ["popup_z", "popup_c", "popup_a", "popup_b"], "creation order: legacy (no timestamp) first, then createdAt, then stable id");

// ---- 4. Plan (who would win) ----
const T = (n: number) => `2026-11-03T10:00:0${n}.000Z`;
const map = (...ps: PopupDefinition[]): PopupDefinitionMap => Object.fromEntries(ps.map((p) => [p.id, p]));
eq(automaticPopupPlan(map(popup("popup_m", { type: "manual" }, T(1)))), { delay: null, exitIntent: null }, "Manual Popups are never scheduled");
eq(automaticPopupPlan(map(popup("popup_a", { type: "delay", delaySeconds: 5 }, T(1)), popup("popup_b", { type: "delay", delaySeconds: 2 }, T(2)))).delay, { popupId: "popup_b", ms: 2000 }, "shortest delay wins regardless of creation");
eq(automaticPopupPlan(map(popup("popup_second", { type: "delay", delaySeconds: 5 }, T(2)), popup("popup_first", { type: "delay", delaySeconds: 5 }, T(1)))).delay, { popupId: "popup_first", ms: 5000 }, "equal delay: earliest created wins (not insertion order)");
eq(automaticPopupPlan(map(popup("popup_e2", { type: "exit_intent" }, T(2)), popup("popup_e1", { type: "exit_intent" }, T(1)))).exitIntent, "popup_e1", "several Exit-intent Popups: earliest created wins");

// ---- 5. Coordinator against a fake clock + fake exit gestures ----
function harness(popups: PopupDefinitionMap, { elapsedMs = 0, active = false } = {}) {
  let now = 0;
  let timers: { at: number; cb: () => void; id: number }[] = [];
  let nextId = 1;
  const exitListeners = new Set<() => void>();
  const opened: string[] = [];
  let activeId: string | null = active ? "popup_manual" : null;
  const state: AutomaticPopupState = { consumed: false };
  const start = () => startAutomaticPopupTriggers({
    plan: automaticPopupPlan(popups),
    state,
    elapsedMs,
    env: {
      setTimer: (cb, ms) => { const t = { at: now + ms, cb, id: nextId++ }; timers.push(t); return t.id; },
      clearTimer: (id) => { timers = timers.filter((t) => t.id !== id); },
      onExitIntent: (cb) => { exitListeners.add(cb); return () => exitListeners.delete(cb); },
    },
    isPopupActive: () => activeId !== null,
    open: (id) => { activeId = id; opened.push(id); },
  });
  const stop = start();
  return {
    state, opened, stop, start,
    advance: (ms: number) => { now += ms; for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= now && timers.includes(t)) { timers = timers.filter((x) => x !== t); t.cb(); } },
    exit: () => [...exitListeners].forEach((cb) => cb()),
    close: () => { activeId = null; },
    manualOpen: (id: string) => { activeId = id; state.consumed = true; stop(); },
    pending: () => ({ timers: timers.length, listeners: exitListeners.size }),
  };
}
{
  const r = harness(map(popup("popup_a", { type: "delay", delaySeconds: 2 }, T(1))));
  r.advance(1999); eq(r.opened, [], "single delay: nothing before 2s");
  r.advance(1); eq(r.opened, ["popup_a"], "single delay: opens at 2s");
  r.close(); r.advance(60_000); eq(r.opened, ["popup_a"], "single delay: opens once, never again after close");
  eq(r.state.consumed, true, "close does not restore eligibility");
  eq(r.pending(), { timers: 0, listeners: 0 }, "nothing left scheduled after it fires");
}
{
  const r = harness(map(popup("popup_a", { type: "delay", delaySeconds: 5 }, T(1)), popup("popup_b", { type: "delay", delaySeconds: 10 }, T(2)), popup("popup_c", { type: "delay", delaySeconds: 30 }, T(3))));
  eq(r.pending().timers, 1, "multiple delays: ONE timer (the earliest)");
  r.advance(5000); r.close(); r.advance(60_000);
  eq(r.opened, ["popup_a"], "multiple delays: A at 5s only; B and C never");
}
{
  const r = harness(map(popup("popup_b", { type: "delay", delaySeconds: 5 }, T(2)), popup("popup_a", { type: "delay", delaySeconds: 5 }, T(1))));
  r.advance(5000); r.close(); r.advance(10_000);
  eq(r.opened, ["popup_a"], "same delay: earliest-created A only");
}
{
  const r = harness(map(popup("popup_e1", { type: "exit_intent" }, T(1)), popup("popup_e2", { type: "exit_intent" }, T(2))));
  eq(r.pending().listeners, 1, "multiple exit-intent Popups: ONE listener");
  r.exit(); eq(r.opened, ["popup_e1"], "exit intent: earliest-created opens");
  r.close(); r.exit(); eq(r.opened, ["popup_e1"], "a second exit gesture does nothing");
  eq(r.pending(), { timers: 0, listeners: 0 }, "the exit listener is removed once consumed");
}
const delayVsExit = () => map(popup("popup_a", { type: "delay", delaySeconds: 10 }, T(1)), popup("popup_b", { type: "exit_intent" }, T(2)));
{
  const r = harness(delayVsExit());
  r.advance(4000); r.exit(); eq(r.opened, ["popup_b"], "exit at 4s beats a 10s delay");
  r.close(); r.advance(20_000); eq(r.opened, ["popup_b"], "the delay is cancelled after exit intent wins");
  eq(r.pending(), { timers: 0, listeners: 0 }, "delay timer cleared when exit wins");
}
{
  const r = harness(delayVsExit());
  r.advance(10_000); eq(r.opened, ["popup_a"], "a 10s delay beats a later exit");
  r.close(); r.exit(); eq(r.opened, ["popup_a"], "exit intent is disabled after the delay wins");
  eq(r.pending().listeners, 0, "exit listener removed when the delay wins");
}
{
  const r = harness(map(popup("popup_a", { type: "delay", delaySeconds: 10 }, T(1)), popup("popup_e", { type: "exit_intent" }, T(2))));
  r.advance(3000); r.manualOpen("popup_b");
  r.close(); r.advance(20_000); r.exit();
  eq(r.opened, [], "manual open of ANOTHER Popup suppresses every automatic Popup");
  eq(r.pending(), { timers: 0, listeners: 0 }, "manual open tears down timers + listeners");
}
{
  const r = harness(map(popup("popup_a", { type: "delay", delaySeconds: 10 }, T(1))));
  r.advance(3000); r.manualOpen("popup_a"); r.close(); r.advance(20_000);
  eq(r.opened, [], "manually opening the automatic Popup itself: it never auto-reopens");
}
{
  const r = harness(map(popup("popup_a", { type: "delay", delaySeconds: 2 }, T(1))), { active: true });
  r.advance(2000);
  eq(r.opened, [], "never opens over an active Popup");
  eq(r.state.consumed, true, "eligibility stays consumed after the blocked attempt");
}
{
  // React may run an effect twice (mount → cleanup → mount): the second run must not duplicate.
  const r = harness(map(popup("popup_a", { type: "delay", delaySeconds: 2 }, T(1)), popup("popup_e", { type: "exit_intent" }, T(2))));
  r.stop(); r.stop();
  eq(r.pending(), { timers: 0, listeners: 0 }, "teardown is complete and idempotent");
  const stop2 = r.start();
  eq(r.pending(), { timers: 1, listeners: 1 }, "re-run registers exactly one timer + one listener");
  r.advance(2000); r.exit(); r.advance(5000);
  eq(r.opened, ["popup_a"], "double effect: one delay → one open");
  stop2();
  const stop3 = r.start();
  eq(r.pending(), { timers: 0, listeners: 0 }, "a re-run after consumption schedules nothing");
  stop3();
}
{
  // The clock starts at first client mount: a re-run 1.5s in only waits the remaining 0.5s.
  const r = harness(map(popup("popup_a", { type: "delay", delaySeconds: 2 }, T(1))), { elapsedMs: 1500 });
  r.advance(499); eq(r.opened, [], "re-run honours elapsed time (not yet)");
  r.advance(1); eq(r.opened, ["popup_a"], "re-run honours elapsed time (fires at the original 2s)");
}
{
  const r = harness(map(popup("popup_m", { type: "manual" }, T(1))));
  r.advance(3_600_000); r.exit();
  eq(r.opened, [], "Manual Popups never auto-open");
  eq(r.pending(), { timers: 0, listeners: 0 }, "Manual-only page registers nothing");
}

// ---- 6. Real exit-intent listener (fake document + window) ----
eq(isTopExit({ relatedTarget: null, clientY: 0 }), true, "pointer leaving through the top edge is an exit");
eq(isTopExit({ relatedTarget: null, clientY: -3 }), true, "pointer above the viewport is an exit");
eq(isTopExit({ relatedTarget: null, clientY: 400 }), false, "leaving by the left/right edge (mid-height) is not an exit");
eq(isTopExit({ relatedTarget: {}, clientY: 0 }), false, "moving onto another element is not an exit");
{
  const handlers = new Map<string, (e: unknown) => void>();
  const doc = { addEventListener: (t: string, f: (e: unknown) => void) => handlers.set(t, f), removeEventListener: (t: string, f: unknown) => { if (handlers.get(t) === f) handlers.delete(t); } } as unknown as Document;
  let desktop = true;
  const queries: string[] = [];
  const win = { matchMedia: (q: string) => { queries.push(q); return { matches: desktop }; } } as unknown as Window;
  let fired = 0;
  const unsubscribe = browserExitIntent(doc, win)(() => fired++);
  eq([...handlers.keys()], ["mouseout"], "listens to mouseout only (no blur/visibility/scroll)");
  handlers.get("mouseout")!({ relatedTarget: null, clientY: 300 });
  eq(fired, 0, "side exit ignored");
  handlers.get("mouseout")!({ relatedTarget: null, clientY: 0 });
  eq(fired, 1, "top exit on desktop fires");
  desktop = false;
  handlers.get("mouseout")!({ relatedTarget: null, clientY: 0 });
  eq(fired, 1, "top exit on touch / phone layout never fires");
  eq(queries.at(-1), EXIT_INTENT_DESKTOP_QUERY, "desktop check uses the hover + fine-pointer + width query");
  ok(EXIT_INTENT_DESKTOP_QUERY.includes("pointer: fine") && EXIT_INTENT_DESKTOP_QUERY.includes("hover: hover"), "desktop query requires a real mouse");
  unsubscribe();
  eq(handlers.size, 0, "unsubscribe removes the global handler");
}

// ---- 7. Editor frame + manager + publish state ----
const p = popup("popup_f", { type: "manual" }, T(1));
const editorData = popupToEditorData(p);
eq((editorData.root.props as { frame: { trigger: unknown } }).frame.trigger, { type: "manual" }, "the frame carries the trigger into the editor");
const changed = popupFromEditorData(p, { ...editorData, root: { props: { frame: { ...(editorData.root.props as { frame: object }).frame, trigger: { type: "delay", delaySeconds: 2 } } } } } as never);
eq(changed.trigger, { type: "delay", delaySeconds: 2 }, "a trigger change in the frame lands on the Popup");
eq((changed.content.root as { props: object }).props, {}, "the trigger never leaks into the saved content root");
const badFrame = popupFromEditorData(p, { ...editorData, root: { props: { frame: { ...(editorData.root.props as { frame: object }).frame, trigger: { type: "delay", delaySeconds: -4 } } } } } as never);
eq(badFrame.trigger, { type: "manual" }, "a malformed frame trigger normalizes to Manual");
eq(popupPublishState(changed, { popup_f: p }), "changed", "a trigger-only change marks the Popup as changed since publish");
eq(popupPublishState(changed, { popup_f: changed }), "published", "same trigger → published");
const renamed = { ...changed, name: "Renamed" };
eq(popupTriggerSummary(renamed.trigger), "Delay · 2s", "rename leaves the trigger summary unchanged");

// ---- 8. Host server render: nothing opens on the server ----
const autoPopups = map(popup("popup_a", { type: "delay", delaySeconds: 1 }, T(1)), popup("popup_e", { type: "exit_intent" }, T(2)));
const html = renderToStaticMarkup(h(PopupHost, { popups: autoPopups, automaticTriggers: true }, h("main", null, "Page")));
eq(html, "<main>Page</main>", "server render: page only — automatic Popups open on the client, after mount");
ok(!html.includes("data-popup-portal"), "server render: no dialog portal");

console.log(`Popup triggers: ${passed} checks passed`);
