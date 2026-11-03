"use client";

import { useSyncExternalStore } from "react";

/**
 * Builder-only Navigation preview state (Wave 2B-1). Puck's canvas doesn't
 * pass clicks through to a block's own buttons, so the Settings panel drives
 * what the canvas shows instead: expanding a dropdown's row previews that
 * dropdown open, and the Mobile menu group can preview the open menu.
 * Never saved, never read outside the editor (the canvas renders in the same
 * JS context as the panel, so a module store reaches it).
 */
export interface NavigationEditorPreview {
  dropdownId: string | null;
  mobileOpen: boolean;
}

const EMPTY: NavigationEditorPreview = { dropdownId: null, mobileOpen: false };
const state = new Map<string, NavigationEditorPreview>();
const listeners = new Set<() => void>();

export function setNavigationPreview(blockId: string, patch: Partial<NavigationEditorPreview>) {
  if (!blockId) return;
  const next = { ...(state.get(blockId) ?? EMPTY), ...patch };
  state.set(blockId, next);
  listeners.forEach((l) => l());
}

export function getNavigationPreview(blockId: string): NavigationEditorPreview {
  return state.get(blockId) ?? EMPTY;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The preview for one block; always EMPTY when `enabled` is false (Preview / public pages). */
export function useNavigationPreview(blockId: string, enabled: boolean): NavigationEditorPreview {
  return useSyncExternalStore(
    subscribe,
    () => (enabled ? getNavigationPreview(blockId) : EMPTY),
    () => EMPTY,
  );
}
