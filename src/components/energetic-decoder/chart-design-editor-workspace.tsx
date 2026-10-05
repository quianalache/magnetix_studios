"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EDITOR_TWO_COLUMN_MIN_WIDTH,
  editorWorkspaceHeight,
  editorWorkspaceHeightBelowStickyBar,
  previewFitScale,
} from "@/lib/energetics/chart-design-preview-fit";

/**
 * The shared Chart Design editor shell (2026-10). Every chart system uses
 * the same workspace: its own controls on the left (scrolling on their own)
 * and its live preview on the right (always visible). Only the layout is
 * shared — each system passes in its own controls and its own renderer.
 * Frequency will slot into the same shell once its editor exists.
 *
 * Wide workspaces (≥ EDITOR_TWO_COLUMN_MIN_WIDTH) sit side by side. With a
 * sticky bar (the editor's tabs) they fill the page area below that bar: the
 * header above scrolls away and the workspace gets nearly the full height.
 * The controls column scrolls on its own; at its ends the scroll carries on
 * to the page (no overscroll trap), so the header is always reachable.
 * Narrower ones stack: preview first, then the controls, scrolling with the page.
 */

function useWorkspaceLayout(ref: RefObject<HTMLDivElement | null>, stickyBarRef?: RefObject<HTMLElement | null>) {
  const [layout, setLayout] = useState<{ wide: boolean; height: number }>({ wide: true, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const area = el.closest("main");

    const update = () => {
      const wide = el.clientWidth >= EDITOR_TWO_COLUMN_MIN_WIDTH;
      let height = 0;
      if (wide) {
        const rect = el.getBoundingClientRect();
        if (area) {
          const areaRect = area.getBoundingClientRect();
          // Bottom padding/borders of the page area and every wrapper between it and the workspace.
          let bottomGap = 0;
          for (let node: HTMLElement | null = el.parentElement; node; node = node === area ? null : node.parentElement) {
            const cs = getComputedStyle(node);
            bottomGap += (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
          }
          const bar = stickyBarRef?.current;
          height = bar
            ? // Header scrolls away; the workspace fills the page area below the sticky bar.
              editorWorkspaceHeightBelowStickyBar({
                areaHeight: area.clientHeight,
                stickyBarHeight: bar.offsetHeight,
                gapAbove: parseFloat(getComputedStyle(el).marginTop) || 0,
                bottomGap,
              })
            : editorWorkspaceHeight({ workspaceTop: rect.top + area.scrollTop, areaBottom: areaRect.bottom - bottomGap });
        } else {
          height = editorWorkspaceHeight({ workspaceTop: rect.top + window.scrollY, areaBottom: window.innerHeight - 24 });
        }
      }
      setLayout((prev) => (prev.wide === wide && prev.height === height ? prev : { wide, height }));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // The header above can change height (unsaved / view-only notices), which moves the workspace.
    if (el.parentElement) ro.observe(el.parentElement);
    if (area) ro.observe(area);
    if (stickyBarRef?.current) ro.observe(stickyBarRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref, stickyBarRef]);

  return layout;
}

export function ChartDesignEditorWorkspace({
  controls,
  preview,
  previewTitle,
  previewNote,
  stickyBarRef,
}: {
  controls: ReactNode;
  /** Render-prop so the preview can fill the box in the side-by-side layout and size itself by width when stacked. */
  preview: (fit: { fill: boolean }) => ReactNode;
  previewTitle: string;
  previewNote?: string;
  /** The editor's sticky tab bar: when given, the side-by-side workspace is sized to fill the page area below it once the header has scrolled away. */
  stickyBarRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { wide, height } = useWorkspaceLayout(ref, stickyBarRef);

  const previewCard = (
    <section
      aria-label={previewTitle}
      className={cn("flex min-w-0 flex-col rounded-2xl border bg-card p-4", wide && "h-full min-h-0")}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{previewTitle}</h2>
        {previewNote && <span className="text-xs text-muted-foreground">{previewNote}</span>}
      </div>
      <div className={cn("rounded-xl border bg-white p-2", wide && "min-h-0 flex-1")}>{preview({ fill: wide })}</div>
    </section>
  );

  // One root element in both layouts, so the size observers never lose it.
  return (
    <div
      ref={ref}
      data-editor-layout={wide ? "side-by-side" : "stacked"}
      className={cn(wide ? "grid grid-cols-[minmax(300px,340px)_minmax(0,1fr)] gap-5" : "flex flex-col gap-4")}
      style={wide && height ? { height } : undefined}
    >
      <div
        data-editor-controls
        className={cn("space-y-3", wide ? "min-h-0 overflow-y-auto pr-1" : "order-2")}
      >
        {controls}
      </div>
      <div className={cn("min-w-0", wide ? "h-full min-h-0" : "order-1")}>{previewCard}</div>
    </div>
  );
}

/**
 * Lays a chart out at its natural width, then scales it uniformly to fit:
 * `fill` = fit inside the box's width AND height (side by side);
 * otherwise fit the width, capped at `maxHeight` (stacked).
 */
export function ChartPreviewFit({
  naturalWidth,
  maxScale = 1,
  fill,
  maxHeight,
  children,
}: {
  naturalWidth: number;
  maxScale?: number;
  fill: boolean;
  maxHeight?: number;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ boxWidth: 0, boxHeight: 0, naturalHeight: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const update = () => {
      const next = { boxWidth: box.clientWidth, boxHeight: fill ? box.clientHeight : 0, naturalHeight: inner.offsetHeight };
      setSize((prev) =>
        prev.boxWidth === next.boxWidth && prev.boxHeight === next.boxHeight && prev.naturalHeight === next.naturalHeight ? prev : next,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [fill]);

  const cap = fill ? size.boxHeight : (maxHeight ?? 0);
  const scale = previewFitScale({ boxWidth: size.boxWidth, boxHeight: cap, naturalWidth, naturalHeight: size.naturalHeight, maxScale });

  return (
    <div
      ref={boxRef}
      data-chart-preview-scale={scale ? scale.toFixed(3) : undefined}
      className={cn("relative w-full overflow-hidden", fill && "h-full")}
      style={fill ? undefined : { height: scale ? Math.ceil(size.naturalHeight * scale) : 320 }}
    >
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          left: "50%",
          // Top-aligned: a chart limited by width starts right under the preview title, with any spare room below it.
          top: 0,
          width: naturalWidth,
          transform: `translate(-50%, 0) scale(${scale || 1})`,
          transformOrigin: "top center",
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** One collapsible group of a system's controls. */
export function ChartDesignControlSection({
  title,
  description,
  icon: Icon,
  open,
  onToggle,
  hasChanges,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  open: boolean;
  onToggle: () => void;
  hasChanges?: boolean;
  children: ReactNode;
}) {
  const bodyId = `cd-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="rounded-2xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {title}
            {hasChanges && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="unsaved changes" />}
          </span>
          {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
        </span>
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={bodyId} className="space-y-2.5 border-t px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}
