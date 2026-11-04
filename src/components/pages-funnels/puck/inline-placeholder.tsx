import type { CSSProperties } from "react";

/**
 * Builder-only placeholders for EMPTY canvas-editable text (Wave 3 — same
 * idea as the Pricing block's placeholders, shared by every block that edits
 * text on the canvas). Puck renders an empty `[contenteditable]` with no
 * width; the ::before gives it a visible, clickable label. Never rendered on
 * the live page or in Preview (callers pass `editing`).
 */
export const INLINE_PLACEHOLDER_CSS =
  "[data-inline-placeholder] [contenteditable]:empty::before,[data-inline-placeholder][contenteditable]:empty::before{content:var(--inline-placeholder);color:var(--muted-foreground);opacity:.7;pointer-events:none}";

export function InlinePlaceholderStyle({ editing }: { editing: boolean }) {
  return editing ? <style dangerouslySetInnerHTML={{ __html: INLINE_PLACEHOLDER_CSS }} /> : null;
}

/** Spread onto the element that wraps an inline-editable value. */
export function placeholderProps(editing: boolean, label: string): { "data-inline-placeholder"?: ""; style?: CSSProperties } {
  if (!editing) return {};
  return { "data-inline-placeholder": "", style: { ["--inline-placeholder" as string]: JSON.stringify(label) } as CSSProperties };
}
