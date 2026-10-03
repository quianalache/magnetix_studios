"use client";

import { useEffect } from "react";
import { isGuardedNavigationClick } from "@/lib/unsaved-changes";

/**
 * While `dirty`, asks before the page is left: the browser's own prompt on
 * refresh / close / typing a new address, and a confirmation before any
 * in-app link navigates away. (The browser Back button isn't intercepted:
 * the App Router has no supported way to block it.)
 */
export function useUnsavedChangesGuard(dirty: boolean, message = "You have unsaved changes. Leave without saving?") {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const guarded = isGuardedNavigationClick({
        dirty,
        href: anchor.getAttribute("href"),
        currentUrl: window.location.href,
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
        button: e.button,
        modifierKey: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
      });
      if (guarded && !window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
