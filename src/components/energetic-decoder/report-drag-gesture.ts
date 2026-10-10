/**
 * Report Builder element gestures (2026-10-10) — pure lifecycle for
 * dragging and resizing a canvas element. No React, no DOM: the component
 * feeds pointer events in, applies the returned preview offset, and commits
 * at most ONCE per gesture (one Undo step).
 *
 * Why this exists: the old drag kept "dragging" in React state and moved on
 * every pointermove while that state was set. Any time the browser did not
 * deliver pointerup — pointercancel (touch / native drag of an image or
 * selected text), a right-click or two-finger trackpad click whose release
 * went to the context menu, lost pointer capture — the state stayed set and
 * the element kept following the cursor until a later click happened to
 * reset it. Movement was also in screen pixels on a scaled canvas, so at
 * 42% the element ran ~2.4× ahead of the cursor.
 *
 * Rules enforced here:
 *   - only the primary button of the primary pointer starts a gesture;
 *   - nothing moves until the pointer travels DRAG_THRESHOLD px (a click
 *     never moves anything);
 *   - a move whose `buttons` no longer has the primary bit ends the
 *     gesture (a missed pointerup can never leave it "stuck");
 *   - moves from any other pointer are ignored;
 *   - deltas are converted from screen px to page units (÷ scale);
 *   - the element stays inside its own page (no cross-page transfer).
 */

export const DRAG_THRESHOLD = 3;

export interface PointerSample {
  pointerId: number;
  clientX: number;
  clientY: number;
  /** MouseEvent.button — 0 = primary. */
  button?: number;
  /** MouseEvent.buttons bitmask — bit 1 = primary pressed. */
  buttons: number;
  isPrimary?: boolean;
}

export interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  /** Becomes true once the pointer passes the threshold. */
  active: boolean;
  /** Preview offset in page units. */
  dx: number;
  dy: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns a gesture for a primary-button press, or null (right-click, pen eraser, second finger…). */
export function startGesture(e: PointerSample): Gesture | null {
  if ((e.button ?? 0) !== 0 || e.isPrimary === false) return null;
  return { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, dx: 0, dy: 0 };
}

export type MoveResult =
  | { kind: "ignore" }
  /** Primary button is no longer down: the pointerup was missed. Finish now. */
  | { kind: "released" }
  | { kind: "move"; gesture: Gesture };

export function moveGesture(g: Gesture, e: PointerSample, scale: number, clamp?: (dx: number, dy: number) => { dx: number; dy: number }): MoveResult {
  if (e.pointerId !== g.pointerId) return { kind: "ignore" };
  if ((e.buttons & 1) === 0) return { kind: "released" };
  const sx = e.clientX - g.startX;
  const sy = e.clientY - g.startY;
  const active = g.active || Math.hypot(sx, sy) >= DRAG_THRESHOLD;
  if (!active) return { kind: "move", gesture: g };
  const s = scale > 0 ? scale : 1;
  const raw = { dx: sx / s, dy: sy / s };
  const next = clamp ? clamp(raw.dx, raw.dy) : raw;
  return { kind: "move", gesture: { ...g, active: true, dx: next.dx, dy: next.dy } };
}

/** The offset to commit when a gesture ends normally, or null when nothing moved (a click). */
export function finishGesture(g: Gesture | null): { dx: number; dy: number } | null {
  if (!g || !g.active) return null;
  if (g.dx === 0 && g.dy === 0) return null;
  return { dx: g.dx, dy: g.dy };
}

/** Keeps a dragged element fully inside its own page. */
export function clampMoveToPage(box: Box, page: { width: number; height: number }) {
  return (dx: number, dy: number) => {
    const maxX = Math.max(0, page.width - box.width);
    const maxY = Math.max(0, page.height - box.height);
    const x = Math.min(maxX, Math.max(0, box.x + dx));
    const y = Math.min(maxY, Math.max(0, box.y + dy));
    return { dx: x - box.x, dy: y - box.y };
  };
}

export const MIN_ELEMENT_WIDTH = 80;
export const MIN_ELEMENT_HEIGHT = 50;

/** Resize handle: min size, and never past the page's right/bottom edge. */
export function clampResizeToPage(box: Box, page: { width: number; height: number }) {
  return (dw: number, dh: number) => {
    const w = Math.min(Math.max(MIN_ELEMENT_WIDTH, box.width + dw), Math.max(MIN_ELEMENT_WIDTH, page.width - box.x));
    const h = Math.min(Math.max(MIN_ELEMENT_HEIGHT, box.height + dh), Math.max(MIN_ELEMENT_HEIGHT, page.height - box.y));
    return { dx: w - box.width, dy: h - box.height };
  };
}
