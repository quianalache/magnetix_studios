import { comparePopupCreationOrder, type PopupDefinitionMap } from "@/types/pages-funnels-popup";

/**
 * Automatic Popup triggers (Wave 2A Slice 6) — the ONE coordinator that
 * decides whether a Delay or Exit-intent Popup opens. Pure (timers and the
 * exit-intent listener are injected) so arbitration is testable without a
 * browser; `PopupHost` wires it to the real window.
 *
 * Owner-approved rules:
 *  1. At most ONE automatic Popup per page view.
 *  2. The first qualifying trigger wins; everything else is then consumed.
 *  3/4. Equal delays, or several Exit-intent Popups: earliest created wins.
 *  5. ANY manual open consumes automatic eligibility for the page view.
 *  6. A new page view starts fresh (state lives in memory only).
 *  7. Never opens while a Popup is active.
 * Closing a Popup never restores eligibility.
 *
 * Because the earliest delay always fires before any later one, only ONE
 * timer is ever scheduled (the winning delay), plus at most one
 * exit-intent listener (the earliest-created Exit-intent Popup).
 */

export interface AutomaticPopupPlan {
  /** The Delay Popup that would win the clock, and when (ms from page start). */
  delay: { popupId: string; ms: number } | null;
  /** The Exit-intent Popup that would win an exit gesture. */
  exitIntent: string | null;
}

export function automaticPopupPlan(popups: PopupDefinitionMap): AutomaticPopupPlan {
  const ordered = Object.values(popups).sort(comparePopupCreationOrder);
  let delay: AutomaticPopupPlan["delay"] = null;
  let exitIntent: string | null = null;
  for (const popup of ordered) {
    const trigger = popup.trigger;
    // Strictly-less keeps the earlier-created Popup on an equal delay.
    if (trigger.type === "delay" && (!delay || trigger.delaySeconds * 1000 < delay.ms)) delay = { popupId: popup.id, ms: trigger.delaySeconds * 1000 };
    if (trigger.type === "exit_intent" && !exitIntent) exitIntent = popup.id;
  }
  return { delay, exitIntent };
}

/** The per-page-view flag. Held by the host (a ref), so effect re-runs can't reset it. */
export interface AutomaticPopupState { consumed: boolean }

export interface AutomaticTriggerEnv {
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Subscribes to real exit-intent gestures; returns an unsubscribe. */
  onExitIntent(callback: () => void): () => void;
}

export interface AutomaticTriggerOptions {
  plan: AutomaticPopupPlan;
  state: AutomaticPopupState;
  env: AutomaticTriggerEnv;
  /** ms the page has already been open (the clock started at first client mount). */
  elapsedMs: number;
  isPopupActive(): boolean;
  /** Opens through the shared Popup runtime. */
  open(popupId: string): void;
}

/** Starts the triggers; the returned function tears down every timer and listener (idempotent). */
export function startAutomaticPopupTriggers(options: AutomaticTriggerOptions): () => void {
  const { plan, state, env } = options;
  if (state.consumed) return () => {};
  let timer: unknown = null;
  let unsubscribe: (() => void) | null = null;
  const stop = () => {
    if (timer !== null) env.clearTimer(timer);
    timer = null;
    unsubscribe?.();
    unsubscribe = null;
  };
  const fire = (popupId: string) => {
    if (state.consumed) return stop();
    state.consumed = true;
    stop();
    if (!options.isPopupActive()) options.open(popupId);
  };
  if (plan.delay) {
    const { popupId, ms } = plan.delay;
    timer = env.setTimer(() => fire(popupId), Math.max(0, ms - options.elapsedMs));
  }
  if (plan.exitIntent) {
    const popupId = plan.exitIntent;
    unsubscribe = env.onExitIntent(() => fire(popupId));
  }
  return stop;
}

/** Desktop = a hovering fine pointer on a desktop-width window. Touch and phone layouts never get Exit intent. */
export const EXIT_INTENT_DESKTOP_QUERY = "(hover: hover) and (pointer: fine) and (min-width: 768px)";

/**
 * A real exit gesture: the pointer leaves the DOCUMENT (no element it moved
 * into) through the TOP edge — toward the tabs / address bar. Leaving by the
 * left, right or bottom edge, moving between elements, focus or visibility
 * changes, and scrolling are not exits.
 */
export function isTopExit(event: { relatedTarget: unknown; clientY: number }): boolean {
  return event.relatedTarget == null && event.clientY <= 0;
}

/** Browser exit-intent subscription (desktop only, checked at the moment of the gesture). */
export function browserExitIntent(doc: Document, win: Window): AutomaticTriggerEnv["onExitIntent"] {
  return (callback) => {
    const onMouseOut = (event: MouseEvent) => {
      if (isTopExit(event) && win.matchMedia(EXIT_INTENT_DESKTOP_QUERY).matches) callback();
    };
    doc.addEventListener("mouseout", onMouseOut);
    return () => doc.removeEventListener("mouseout", onMouseOut);
  };
}
