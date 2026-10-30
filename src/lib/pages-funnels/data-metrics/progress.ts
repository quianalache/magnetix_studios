import { toFiniteNumber } from "./validation";

/**
 * Progress maths shared by the Progress Bar and Progress Ring blocks (pure —
 * no React). A progress value needs a current value and a target above zero;
 * anything else is "not set up yet" (null), never NaN or Infinity.
 */
export interface ProgressState {
  current: number;
  target: number;
  /** Real percentage, may exceed 100 (e.g. a goal beaten) or be negative. */
  percent: number;
  /** What the visual fills: clamped to 0–100. */
  fillPercent: number;
  /** aria-valuenow must sit inside 0..target. */
  ariaNow: number;
}

export function computeProgress(current: unknown, target: unknown): ProgressState | null {
  const c = toFiniteNumber(current);
  const t = toFiniteNumber(target);
  if (c == null || t == null || t <= 0) return null;
  const percent = (c / t) * 100;
  return {
    current: c,
    target: t,
    percent,
    fillPercent: Math.min(100, Math.max(0, percent)),
    ariaNow: Math.min(t, Math.max(0, c)),
  };
}

/** "75%" — whole numbers unless asked; -0 never shows. */
export function formatPercent(percent: number, decimals = 0): string {
  const d = Math.max(0, Math.min(2, Math.trunc(decimals)));
  const rounded = Number(percent.toFixed(d));
  return `${(Object.is(rounded, -0) ? 0 : rounded).toFixed(d)}%`;
}

export type ProgressThickness = "thin" | "medium" | "thick";
export const BAR_THICKNESS_PX: Record<ProgressThickness, number> = { thin: 6, medium: 12, thick: 20 };

/** Ring geometry in a fixed 120×120 viewBox, so any rendered size scales cleanly. */
export const RING_VIEWBOX = 120;
export const RING_STROKE: Record<ProgressThickness, number> = { thin: 6, medium: 10, thick: 14 };
export type RingSize = "small" | "medium" | "large";
export const RING_SIZE_PX: Record<RingSize, number> = { small: 120, medium: 160, large: 200 };

export function ringGeometry(thickness: ProgressThickness, fillPercent: number) {
  const stroke = RING_STROKE[thickness] ?? RING_STROKE.medium;
  const r = (RING_VIEWBOX - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const f = Math.min(100, Math.max(0, Number.isFinite(fillPercent) ? fillPercent : 0));
  const filled = (circumference * f) / 100;
  return { stroke, r, circumference, filled, dashArray: `${filled} ${circumference}` };
}
