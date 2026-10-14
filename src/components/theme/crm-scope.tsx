"use client";

import { useLayoutEffect, type ReactNode } from "react";

/**
 * The internal CRM's ONE visual system (design-system Phase 1, 2026-10-13).
 *
 * Wraps CRM layouts in the `.mx-crm` scope (src/styles/magnetix/semantic.css).
 * The wrapper is server-rendered, so the Magnetix system is present in the
 * very first HTML — no flash of another palette before hydration — and it is
 * `display: contents`, so it adds no box and can't affect layout. The class is
 * also mirrored onto <html> (removed on unmount) because dialogs, sheets,
 * menus and toasts portal to <body>, outside the wrapper.
 *
 * Replaces the retired runtime app-theme switching (AppAccent + the Agency →
 * Settings App theme picker). `agencies/{id}.appTheme` stays inert in Firestore
 * for backward compatibility — nothing reads it. Public/tenant pages never
 * render this scope; they keep their neutral defaults or the tenant-brand
 * boundary (styles/magnetix/tenant.css).
 */
export const CRM_SCOPE_CLASS = "mx-crm";

export function CrmScope({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const el = document.documentElement;
    el.classList.add(CRM_SCOPE_CLASS);
    return () => {
      el.classList.remove(CRM_SCOPE_CLASS);
    };
  }, []);

  return <div className={`${CRM_SCOPE_CLASS} contents`}>{children}</div>;
}
