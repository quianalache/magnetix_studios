"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Render } from "@puckeditor/core";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { createPopupPuckConfig } from "@/components/pages-funnels/puck/popup-config";
import { sanitizePopupContent, validatePopupContent } from "@/lib/pages-funnels/popup-content";
import { overlayColor } from "@/lib/pages-funnels/popup-editor";
import type { PopupActionRuntime } from "@/lib/pages-funnels/action/execute";
import { automaticPopupPlan, browserExitIntent, startAutomaticPopupTriggers, type AutomaticPopupState } from "@/lib/pages-funnels/popup-triggers";
import { ActionSurfaceContext, PopupControllerContext } from "@/components/pages-funnels/puck/popup-action-context";
import type { PopupDefinitionMap } from "@/types/pages-funnels-popup";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";

const POPUP_Z_INDEX = 1000;
// The public/Preview registry (server config): a Form inside a Popup reads
// its pre-resolved form from metadata like every page Form — no client fetch.
const popupConfig = createPopupPuckConfig(serverPuckConfig);

export { ActionSurfaceContext, PopupControllerContext };

/**
 * Popup host (Slices 4–6): wraps a rendered page (Preview: DRAFT Popups;
 * public page: PUBLISHED Popups only) and owns the ONE dialog shell. Page
 * blocks reach it through `PopupControllerContext` (manual Open Popup);
 * blocks inside the Popup run in the "popup" surface (Close Popup).
 *
 * One active Popup at a time — opening while one is open does nothing.
 * Every way of closing (×, Esc, overlay, a Close Popup button) goes through
 * `closePopup`, which returns focus to the element that opened it.
 *
 * Slice 6: with `automaticTriggers`, Delay / Exit-intent Popups open through
 * this same `openPopup` path via the one coordinator (`popup-triggers.ts`).
 * Off by default, so nothing but Preview and the public page can auto-open.
 */
export function PopupHost({
  popups,
  metadata,
  initialPopupId,
  automaticTriggers = false,
  children,
}: {
  popups: PopupDefinitionMap;
  metadata?: PuckPageMetadata;
  /** QA opener (`?popup=` in Preview, `?qa_popup=` on QA pages) — counts as a manual open. */
  initialPopupId?: string | null;
  /** Run Delay / Exit-intent triggers (Preview + public page only; never the editor). */
  automaticTriggers?: boolean;
  children?: ReactNode;
}) {
  // Starts closed on BOTH server and client: the server renders nothing, so
  // the first client render must too (a portal there broke hydration on the
  // public page). `initialPopupId` opens it right after mount, below.
  const [activePopupId, setActivePopupId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const active = activePopupId ? popups[activePopupId] : null;
  const issues = useMemo(() => (active ? validatePopupContent(active.content) : []), [active]);

  // Page-view state for automatic triggers: in memory only, never reset by
  // an effect re-run (React may run effects twice) — only by a new page view.
  const autoStateRef = useRef<AutomaticPopupState>({ consumed: false });
  const autoStartRef = useRef<number | null>(null);
  const stopAutoRef = useRef<(() => void) | null>(null);
  const [openKind, setOpenKind] = useState<"manual" | "automatic">("manual");

  const showPopup = useCallback((id: string, opener: HTMLElement | null, kind: "manual" | "automatic") => {
    if (activeRef.current || !popups[id]) return false;
    // An automatic Popup has no opener: focus goes back to whatever had it
    // before (if anything real did), never to an arbitrary element.
    const previous = document.activeElement as HTMLElement | null;
    openerRef.current = opener ?? (previous && previous !== document.body ? previous : null);
    activeRef.current = id;
    setOpenKind(kind);
    setActivePopupId(id);
    return true;
  }, [popups]);
  const openPopup = useCallback((id: string, opener?: HTMLElement | null) => {
    const opened = showPopup(id, opener ?? null, "manual");
    if (opened) {
      // Rule 5: any manual open ends automatic Popups for this page view.
      autoStateRef.current.consumed = true;
      stopAutoRef.current?.();
    }
    return opened;
  }, [showPopup]);
  const closePopup = useCallback(() => {
    if (!activeRef.current) return false;
    activeRef.current = null;
    setActivePopupId(null);
    const opener = openerRef.current;
    openerRef.current = null;
    // After the page is interactive again (the effect below removes `inert`).
    requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
    return true;
  }, []);
  const controller = useMemo<PopupActionRuntime>(() => ({ openPopup, closePopup, hasPopup: (id) => !!popups[id] }), [openPopup, closePopup, popups]);
  useEffect(() => { if (initialPopupId) openPopup(initialPopupId); }, [initialPopupId, openPopup]);

  const plan = useMemo(() => (automaticTriggers ? automaticPopupPlan(popups) : null), [automaticTriggers, popups]);
  useEffect(() => {
    if (!plan || (!plan.delay && !plan.exitIntent)) return;
    // The clock starts at the first client mount and survives effect re-runs.
    if (autoStartRef.current === null) autoStartRef.current = performance.now();
    const stop = startAutomaticPopupTriggers({
      plan,
      state: autoStateRef.current,
      elapsedMs: performance.now() - autoStartRef.current,
      env: {
        setTimer: (callback, ms) => window.setTimeout(callback, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number),
        onExitIntent: browserExitIntent(document, window),
      },
      isPopupActive: () => activeRef.current !== null,
      open: (id) => showPopup(id, null, "automatic"),
    });
    stopAutoRef.current = stop;
    return () => {
      stop();
      if (stopAutoRef.current === stop) stopAutoRef.current = null;
    };
  }, [plan, showPopup]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter((child) => child !== document.querySelector("[data-popup-portal]") && child instanceof HTMLElement);
    siblings.forEach((element) => { element.setAttribute("aria-hidden", "true"); (element as HTMLElement).inert = true; });
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closePopup(); return; }
      if (event.key !== "Tab") return;
      const root = document.querySelector("[data-popup-dialog]") as HTMLElement | null;
      const focusable = root ? [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute("disabled")) : [];
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index + 1) % focusable.length;
      if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === focusable.length - 1)) { event.preventDefault(); focusable[next]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; siblings.forEach((element) => { element.removeAttribute("aria-hidden"); (element as HTMLElement).inert = false; }); document.removeEventListener("keydown", onKeyDown); };
  }, [active, closePopup]);

  const style = active?.style;
  const labelId = active ? `popup-title-${active.id}` : "";
  return (
    <PopupControllerContext.Provider value={controller}>
      {children}
      {active && style && typeof document !== "undefined"
        ? createPortal(
            <div data-popup-portal="" data-active-popup={active.id} data-popup-open-kind={openKind} className="fixed inset-0 flex p-4" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: overlayColor(style.overlayColor, style.overlayOpacity), backdropFilter: style.blurPx ? `blur(${style.blurPx}px)` : undefined, alignItems: style.panelPlacement === "top" ? "flex-start" : style.panelPlacement === "bottom" ? "flex-end" : "center", justifyContent: style.panelAlignment === "left" ? "flex-start" : style.panelAlignment === "right" ? "flex-end" : "center" }} onMouseDown={(event) => { if (event.target === event.currentTarget && style.closeOnOverlayClick) closePopup(); }}>
              <div data-popup-dialog="" role="dialog" aria-modal="true" aria-labelledby={labelId} aria-describedby={issues.length ? `${labelId}-warning` : undefined} className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-reduce:animate-none" style={{ width: style.panelWidth, maxWidth: `min(${style.panelMaxWidth}px, calc(100vw - 32px))`, background: style.panelBackground, border: style.panelBorder, boxShadow: style.panelShadow, borderRadius: style.panelBorderRadius, padding: style.panelPadding }}>
                <h2 id={labelId} className="sr-only">{active.name}</h2>
                <Button ref={closeRef} type="button" variant="ghost" size="icon-sm" aria-label={`Close ${active.name}`} className="absolute right-3 top-3 z-10" onClick={closePopup}><X /></Button>
                {issues.length > 0 && <p id={`${labelId}-warning`} role="status" className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Some Popup blocks are unavailable and were safely omitted.</p>}
                <ActionSurfaceContext.Provider value="popup">
                  <Render config={popupConfig} data={sanitizePopupContent(active.content)} metadata={metadata} />
                </ActionSurfaceContext.Provider>
              </div>
            </div>,
            document.body,
          )
        : null}
    </PopupControllerContext.Provider>
  );
}
