"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Render } from "@puckeditor/core";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientPuckConfig } from "@/components/pages-funnels/puck/client-config";
import { createPopupPuckConfig } from "@/components/pages-funnels/puck/popup-config";
import { sanitizePopupContent, validatePopupContent } from "@/lib/pages-funnels/popup-content";
import type { PopupDefinitionMap } from "@/types/pages-funnels-popup";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";

const POPUP_Z_INDEX = 1000;
const popupConfig = createPopupPuckConfig(clientPuckConfig);

export function PopupRuntime({ popups, metadata, initialPopupId, onActiveChange }: { popups: PopupDefinitionMap; metadata?: PuckPageMetadata; initialPopupId?: string | null; onActiveChange?: (id: string | null) => void }) {
  const [activePopupId, setActivePopupId] = useState<string | null>(initialPopupId ?? null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const active = activePopupId ? popups[activePopupId] : null;
  const issues = useMemo(() => active ? validatePopupContent(active.content) : [], [active]);
  const openPopup = useCallback((id: string, opener?: HTMLElement) => { if (!popups[id]) return; openerRef.current = opener ?? document.activeElement as HTMLElement; setActivePopupId(id); onActiveChange?.(id); }, [onActiveChange, popups]);
  const closePopup = useCallback(() => { setActivePopupId(null); onActiveChange?.(null); requestAnimationFrame(() => openerRef.current?.focus?.()); }, [onActiveChange]);
  useEffect(() => { if (initialPopupId) openPopup(initialPopupId); }, [initialPopupId, openPopup]);

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

  if (!active || typeof document === "undefined") return null;
  const style = active.style;
  const sanitized = sanitizePopupContent(active.content);
  const labelId = `popup-title-${active.id}`;
  return createPortal(
    <div data-popup-portal="" className="fixed inset-0 flex p-4" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: withOpacity(style.overlayColor, style.overlayOpacity), backdropFilter: style.blurPx ? `blur(${style.blurPx}px)` : undefined, alignItems: style.panelPlacement === "top" ? "flex-start" : style.panelPlacement === "bottom" ? "flex-end" : "center", justifyContent: style.panelAlignment === "left" ? "flex-start" : style.panelAlignment === "right" ? "flex-end" : "center" }} onMouseDown={(event) => { if (event.target === event.currentTarget && style.closeOnOverlayClick) closePopup(); }}>
      <div data-popup-dialog="" role="dialog" aria-modal="true" aria-labelledby={labelId} aria-describedby={issues.length ? `${labelId}-warning` : undefined} className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-reduce:animate-none" style={{ width: style.panelWidth, maxWidth: `min(${style.panelMaxWidth}px, calc(100vw - 32px))`, background: style.panelBackground, border: style.panelBorder, boxShadow: style.panelShadow, borderRadius: style.panelBorderRadius, padding: style.panelPadding }}>
        <h2 id={labelId} className="sr-only">{active.name}</h2>
        <Button ref={closeRef} type="button" variant="ghost" size="icon-sm" aria-label={`Close ${active.name}`} className="absolute right-3 top-3 z-10" onClick={closePopup}><X /></Button>
        {issues.length > 0 && <p id={`${labelId}-warning`} role="status" className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Some Popup blocks are unavailable and were safely omitted.</p>}
        <Render config={popupConfig} data={sanitized} metadata={metadata} />
      </div>
    </div>,
    document.body,
  );
}

function withOpacity(hex: string, opacity: number) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return `rgba(22, 11, 47, ${opacity})`;
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}
