"use client";

import { useLayoutEffect } from "react";

/**
 * Applies the internal CRM's ONE visual system — Magnetix — by putting
 * `theme-magnetix` on <html> (element-level so portalled dialogs, sheets and
 * toasts inherit it). Renders nothing. Mounted in the CRM layouts; the class is
 * removed on unmount so public/tenant pages never carry it.
 *
 * 2026-10-13 (design-system Phase 0): the Agency → Settings → App theme picker
 * (green / LeadStack / neutral / magnetix) is RETIRED by owner decision — the
 * CRM shell no longer has competing full-app themes. The theme used to come
 * from the agency doc via a client Firestore listener, so every page first
 * painted the fallback palette (green) and only switched once the listener
 * resolved — and stayed on the fallback whenever it didn't. The class is now
 * applied immediately. `agencies/{id}.appTheme` is left in place, inert, for
 * backward compatibility (no data migration). Phase 1 folds the Magnetix
 * values into the :root system tokens and removes this class altogether.
 * Tenant branding on public surfaces is separate (styles/magnetix/tenant.css).
 */
const CRM_THEME_CLASS = "theme-magnetix";
const RETIRED_THEME_CLASSES = ["theme-green", "theme-leadstack"];

export function AppAccent() {
  useLayoutEffect(() => {
    const el = document.documentElement;
    el.classList.remove(...RETIRED_THEME_CLASSES);
    el.classList.add(CRM_THEME_CLASS);
    return () => {
      el.classList.remove(CRM_THEME_CLASS);
    };
  }, []);

  return null;
}
