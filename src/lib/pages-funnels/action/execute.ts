import { canonicalizeStoredAction } from "@/lib/pages-funnels/action/normalize";

/**
 * The ONE place a Page Action is EXECUTED on click (Wave 2A Slice 5).
 *
 * Navigation actions (URL, page, section, Offer, call, email, SMS) render as
 * real links through `resolveActionLink` — the browser follows them, so they
 * need no executor. Interaction actions run here:
 *   - open_popup  → the page's Popup host opens that Popup by its stable id
 *   - close_popup → the Popup host closes the active Popup
 * Blocks never route Popup actions themselves: they call this with the
 * runtime they're rendered in.
 *
 * Rules (V1):
 *   - Open Popup works only from PAGE content (no Popup opens another Popup).
 *   - Close Popup works only from POPUP content.
 *   - One active Popup at a time; opening while one is open does nothing.
 *   - A target the runtime doesn't have (deleted, draft-only on the public
 *     page, another page's id) does nothing — never retargeted.
 */

export type ActionSurface = "page" | "popup";

export interface PopupActionRuntime {
  /** Opens the Popup with this id from THIS runtime's Popup set; false when it can't. */
  openPopup(popupId: string, opener?: HTMLElement | null): boolean;
  /** Closes the active Popup; false when none is open. */
  closePopup(): boolean;
  /** Whether this runtime has a Popup with this id. */
  hasPopup(popupId: string): boolean;
}

export type PageActionOutcome = "opened_popup" | "closed_popup" | "inert";

/** Whether a stored action is a Popup interaction (rendered as a button, run by `executePageAction`). */
export function popupActionKind(raw: unknown): "open_popup" | "close_popup" | null {
  const { action, status } = canonicalizeStoredAction(raw);
  if (status !== "supported") return null;
  return action.type === "open_popup" || action.type === "close_popup" ? action.type : null;
}

/** Whether this action can do anything here (drives the trigger's enabled/disabled state). */
export function canExecutePageAction(raw: unknown, runtime: PopupActionRuntime | null, surface: ActionSurface): boolean {
  const { action, status } = canonicalizeStoredAction(raw);
  if (status !== "supported" || !runtime) return false;
  if (action.type === "open_popup") return surface === "page" && runtime.hasPopup(action.popupId);
  if (action.type === "close_popup") return surface === "popup";
  return false;
}

export function executePageAction(
  raw: unknown,
  runtime: PopupActionRuntime | null,
  opts: { surface: ActionSurface; opener?: HTMLElement | null },
): PageActionOutcome {
  if (!canExecutePageAction(raw, runtime, opts.surface) || !runtime) return "inert";
  const { action } = canonicalizeStoredAction(raw);
  if (action.type === "open_popup") return runtime.openPopup(action.popupId, opts.opener) ? "opened_popup" : "inert";
  if (action.type === "close_popup") return runtime.closePopup() ? "closed_popup" : "inert";
  return "inert";
}
