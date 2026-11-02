"use client";

import { createContext, useContext, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Render, createUsePuck, type Data } from "@puckeditor/core";
import { clientPuckConfig } from "@/components/pages-funnels/puck/client-config";
import { overlayColor } from "@/lib/pages-funnels/popup-editor";
import type { PopupFrameValue } from "@/lib/pages-funnels/popup-editor";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";

const useTypedPuck = createUsePuck();

/**
 * What the Popup editing canvas needs from the shell: the Page it belongs to
 * (drawn dimmed underneath, never editable) and the way back to it.
 * Provided around `<Puck>`; React context reaches the canvas iframe because
 * Puck renders it through a portal of the same tree.
 */
export const PopupEditorContext = createContext<{ pageData: Data; onBackToPage: () => void } | null>(null);

/**
 * Popup Edit Mode canvas (Slice 4.5, approved mockup panel B) — the Popup
 * editor config's ROOT render. The Page stays visible for context but is
 * inert (no pointer events, not focusable, hidden from assistive tech);
 * the overlay uses the Popup's real overlay settings; the panel is the
 * Popup frame and holds the Popup's own content tree (`children`).
 * Clicking the panel or the overlay outside a content block selects the
 * frame (Puck's "nothing selected" = root = frame settings).
 *
 * The public dialog behavior (focus trap, inert page, Esc) lives only in
 * popup-runtime.tsx — none of it is used here, so it can never trap the
 * authoring UI.
 */
export function PopupEditCanvas({ frame, metadata, children }: { frame?: PopupFrameValue; metadata?: PuckPageMetadata; children?: ReactNode }) {
  const ctx = useContext(PopupEditorContext);
  const frameSelected = useTypedPuck((s) => !s.selectedItem);
  const dispatch = useTypedPuck((s) => s.dispatch);
  if (!frame) return <>{children}</>;
  const style = frame.style;

  const selectFrame = (event: MouseEvent) => {
    if ((event.target as Element).closest("[data-puck-component]")) return;
    dispatch({ type: "setUi", ui: { itemSelector: null } });
  };

  return (
    <div className="relative min-h-[max(760px,100vh)]" style={{ isolation: "isolate" }} data-popup-edit-canvas="">
      {ctx ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true" inert data-popup-page-context="">
          <Render config={clientPuckConfig} data={ctx.pageData} metadata={metadata} />
        </div>
      ) : null}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: overlayColor(style.overlayColor, style.overlayOpacity), backdropFilter: style.blurPx ? `blur(${style.blurPx}px)` : undefined }}
        aria-hidden="true"
        data-popup-overlay=""
      />
      <div
        className="relative flex min-h-[760px] px-4 pt-16 pb-10"
        style={{
          alignItems: style.panelPlacement === "top" ? "flex-start" : style.panelPlacement === "bottom" ? "flex-end" : "center",
          justifyContent: style.panelAlignment === "left" ? "flex-start" : style.panelAlignment === "right" ? "flex-end" : "center",
        }}
        onClick={selectFrame}
      >
        <div className="relative" style={{ width: style.panelWidth, maxWidth: `min(${style.panelMaxWidth}px, calc(100vw - 32px))` }}>
          <span
            className={`absolute -top-7 left-0 rounded-md px-2 py-0.5 text-xs font-semibold ${frameSelected ? "bg-tag-violet-fg text-white" : "bg-card text-tag-violet-fg"}`}
            data-popup-frame-chip=""
          >
            Popup (Frame)
          </span>
          <div
            className={`relative ${frameSelected ? "outline-tag-violet-fg outline-2 outline-offset-2" : "outline-tag-violet-fg/40 outline-1 outline-offset-2 outline-dashed"}`}
            style={{
              background: style.panelBackground,
              border: style.panelBorder,
              boxShadow: style.panelShadow,
              borderRadius: style.panelBorderRadius,
              padding: style.panelPadding,
            }}
            data-popup-frame=""
            data-popup-frame-selected={frameSelected ? "true" : "false"}
          >
            {/* Mirrors the runtime close button (popup-runtime.tsx); decorative while editing. */}
            <span className="text-muted-foreground absolute top-3 right-3 z-10 flex size-7 items-center justify-center rounded-md" aria-hidden="true">
              <X className="size-4" />
            </span>
            {children}
          </div>
        </div>
      </div>
      {ctx ? (
        <button
          type="button"
          onClick={ctx.onBackToPage}
          className="bg-card text-foreground border-border hover:bg-muted absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm"
          data-popup-back-to-page="canvas"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to Page
        </button>
      ) : null}
    </div>
  );
}
