"use client";

import { useSyncExternalStore } from "react";

/**
 * Builder-only Checkout preview state (Checkout Phase 3). Puck's canvas
 * doesn't pass clicks through to a block's own buttons, so the Settings
 * panel's Step 1 / Step 2 switcher drives which step of a two-step checkout
 * the canvas shows (same pattern as navigation-preview.ts). Display only:
 * never saved, never sent anywhere, never changes checkout state.
 */
const state = new Map<string, 1 | 2>();
const listeners = new Set<() => void>();

export function setCheckoutPreviewStep(blockId: string, step: 1 | 2) {
  if (!blockId) return;
  state.set(blockId, step);
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCheckoutPreviewStep(blockId: string, enabled: boolean): 1 | 2 {
  return useSyncExternalStore(
    subscribe,
    () => (enabled ? (state.get(blockId) ?? 1) : 1),
    () => 1,
  );
}
