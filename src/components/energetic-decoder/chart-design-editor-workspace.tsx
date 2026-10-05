"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EDITOR_TWO_COLUMN_MIN_WIDTH,
  STACKED_PREVIEW_MAX_HEIGHT,
  humanDesignFillLayout,
  previewFitScale,
  stickyPreviewChartMaxHeight,
} from "@/lib/energetics/chart-design-preview-fit";

/**
 * The shared Chart Design editor shell (2026-10). Every chart system uses
 * the same page: its own controls on the left and its live preview on the
 * right. Only the layout is shared — each system passes in its own controls
 * and its own renderer. Frequency will slot into the same shell later.
 *
 * One continuous page (no fixed-height box, no inner scrollbars): the header,
 * tabs and controls scroll with the page, and on wide screens only the
 * preview card is sticky — it stays beside the controls, sized to fit the
 * visible page area, and stops at the end of the editor. Narrow screens
 * stack (preview first, then controls) with nothing sticky.
 */

function useWorkspaceLayout(ref: RefObject<HTMLDivElement | null>, cardRef: RefObject<HTMLElement | null>) {
  const [layout, setLayout] = useState<{ wide: boolean; previewMaxHeight: number }>({
    wide: true,
    previewMaxHeight: STACKED_PREVIEW_MAX_HEIGHT,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const area = el.closest("main");

    const update = () => {
      const wide = el.clientWidth >= EDITOR_TWO_COLUMN_MIN_WIDTH;
      let previewMaxHeight = STACKED_PREVIEW_MAX_HEIGHT;
      const card = cardRef.current;
      const box = card?.querySelector<HTMLElement>("[data-chart-preview-box]");
      if (wide && card && box) {
        const cs = area ? getComputedStyle(area) : null;
        previewMaxHeight = stickyPreviewChartMaxHeight({
          areaHeight: area ? area.clientHeight : window.innerHeight,
          areaPaddingTop: cs ? parseFloat(cs.paddingTop) || 0 : 0,
          areaPaddingBottom: cs ? parseFloat(cs.paddingBottom) || 0 : 0,
          // The card's own title row, padding and borders around the chart box.
          cardChrome: card.offsetHeight - box.offsetHeight,
        });
      }
      setLayout((prev) => (prev.wide === wide && prev.previewMaxHeight === previewMaxHeight ? prev : { wide, previewMaxHeight }));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (area) ro.observe(area);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref, cardRef]);

  return layout;
}

export function ChartDesignEditorWorkspace({
  controls,
  preview,
  previewTitle,
  previewNote,
}: {
  controls: ReactNode;
  /** Render-prop: the preview fits the card's width, never taller than `maxHeight` (the visible page area when sticky). */
  preview: (fit: { maxHeight: number }) => ReactNode;
  previewTitle: string;
  previewNote?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const { wide, previewMaxHeight } = useWorkspaceLayout(ref, cardRef);

  // One root element in both layouts, so the size observers never lose it.
  return (
    <div
      ref={ref}
      data-editor-layout={wide ? "side-by-side" : "stacked"}
      className={cn(wide ? "grid grid-cols-[minmax(300px,min(30%,360px))_minmax(0,1fr)] items-start gap-4" : "flex flex-col gap-4")}
    >
      <div data-editor-controls className={cn("min-w-0 space-y-3", !wide && "order-2")}>
        {controls}
      </div>
      {/* Only the preview is sticky; it stops at the end of this grid, so it never overlaps what follows. */}
      <section
        ref={cardRef}
        aria-label={previewTitle}
        data-editor-preview
        className={cn("min-w-0 rounded-2xl border bg-card p-2", wide ? "sticky top-0" : "order-1")}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2 px-2 pt-1">
          <h2 className="text-sm font-semibold">{previewTitle}</h2>
          {previewNote && <span className="text-xs text-muted-foreground">{previewNote}</span>}
        </div>
        <div data-chart-preview-box className="overflow-hidden rounded-xl">
          {preview({ maxHeight: previewMaxHeight })}
        </div>
      </section>
    </div>
  );
}

/**
 * Lays a chart out at its natural width, then scales it uniformly to fit the
 * box's width, never taller than `maxHeight`. Uniform scaling can't distort,
 * and the box is exactly as tall as the scaled chart, so nothing is cropped.
 */
export function ChartPreviewFit({
  naturalWidth,
  maxScale = 1,
  maxHeight,
  children,
}: {
  naturalWidth: number;
  maxScale?: number;
  maxHeight: number;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ boxWidth: 0, naturalHeight: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const update = () => {
      const next = { boxWidth: box.clientWidth, naturalHeight: inner.offsetHeight };
      setSize((prev) => (prev.boxWidth === next.boxWidth && prev.naturalHeight === next.naturalHeight ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const scale = previewFitScale({ boxWidth: size.boxWidth, boxHeight: maxHeight, naturalWidth, naturalHeight: size.naturalHeight, maxScale });

  return (
    <div
      ref={boxRef}
      data-chart-preview-scale={scale ? scale.toFixed(3) : undefined}
      className="relative w-full overflow-hidden"
      style={{ height: scale ? Math.ceil(size.naturalHeight * scale) : 320 }}
    >
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          left: "50%",
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

/**
 * Human Design's preview fit: unlike ChartPreviewFit (a fixed natural width,
 * scaled to fit), this lays the full chart out exactly as wide as the
 * preview so its canvas fills it, and gives the BodyGraph the largest size
 * that fits the visible height (humanDesignFillLayout). It measures the
 * rendered chart for the parts that don't change with that size: the rails'
 * height, the padding + Variables above the BodyGraph, and the BodyGraph
 * box's height-to-width ratio.
 */
export function HumanDesignPreviewFit({
  maxHeight,
  maxScale = 1,
  children,
}: {
  maxHeight: number;
  maxScale?: number;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ boxWidth: 0, naturalHeight: 0, railsHeight: 0, centerFixedHeight: 0, bodygraphAspect: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const update = () => {
      const k = inner.offsetWidth ? inner.getBoundingClientRect().width / inner.offsetWidth : 1;
      const root = inner.firstElementChild as HTMLElement | null;
      const rail = inner.querySelector<HTMLElement>("[data-hd-rail]");
      const wrap = inner.querySelector('svg[aria-label="Human Design bodygraph"]')?.parentElement ?? null;
      let railsHeight = 0;
      let centerFixedHeight = 0;
      let bodygraphAspect = 0;
      if (root && rail && wrap && k > 0) {
        const rootTop = root.getBoundingClientRect().top;
        const padBottom = parseFloat(getComputedStyle(root).paddingBottom) || 0;
        const wr = wrap.getBoundingClientRect();
        railsHeight = Math.round((rail.getBoundingClientRect().bottom - rootTop) / k + padBottom);
        centerFixedHeight = Math.round((wr.top - rootTop) / k + padBottom);
        bodygraphAspect = wr.width ? Math.round((wr.height / wr.width) * 1000) / 1000 : 0;
      }
      const next = { boxWidth: box.clientWidth, naturalHeight: inner.offsetHeight, railsHeight, centerFixedHeight, bodygraphAspect };
      setM((prev) => (Object.keys(next).every((key) => prev[key as keyof typeof prev] === next[key as keyof typeof next]) ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const layout = humanDesignFillLayout({ ...m, maxHeight, maxScale });
  const scale = layout?.scale ?? 0;

  return (
    <div
      ref={boxRef}
      data-chart-preview-scale={scale ? scale.toFixed(3) : undefined}
      className="relative w-full overflow-hidden"
      style={{ height: scale && m.naturalHeight ? Math.ceil(m.naturalHeight * scale) : 320 }}
    >
      <div
        ref={innerRef}
        style={
          {
            position: "absolute",
            left: 0,
            top: 0,
            // Before the first measurement, lay out at the minimum width so the parts can be measured.
            width: layout?.naturalWidth ?? 836,
            transform: `scale(${scale || 1})`,
            transformOrigin: "top left",
            visibility: scale ? "visible" : "hidden",
            "--hd-bodygraph-max": `${layout?.bodygraphMax ?? 440}px`,
          } as CSSProperties
        }
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
