import type {
  PuckColumnWidth,
  BackgroundConfig,
} from "@/types/pages-funnels-puck";
import { COLUMN_SPAN_CLASS } from "@/lib/pages-funnels/puck/constants";
import { BackgroundLayer } from "@/components/pages-funnels/puck/background-layer";
import { cn } from "@/lib/utils";

/**
 * Production Section/Row/Column layout primitives — the approved Puck
 * production registry's LAYOUT category (master spec §4/§7). Pure,
 * hook-free presentational components, deliberately shared between the
 * client/editor config AND the server/public `<Render>` config (master
 * spec §10: "share prop types and pure helpers between configs, avoid
 * unnecessary duplication") — neither of these needs to differ between the
 * two contexts, unlike Form (see form-client.tsx/form-server.tsx).
 *
 * These are the RENDER bodies only. The actual Puck component definitions
 * (fields, defaultProps, the `slot` wiring) live in config.tsx, which
 * imports these — kept separate so config.tsx reads as pure registry
 * wiring, matching this repo's existing convention of separating renderer
 * components from their registry entry (see V1's blocks.ts vs.
 * block-view.tsx, and the POC's elements.tsx vs. config.tsx).
 *
 * Phase 2D: Section, Row, AND Column now all accept a `background` prop and
 * all render the exact same `<BackgroundLayer/>` (task §6: "use the same
 * shared data model and renderer helper for Section, Row, and Column
 * backgrounds... do not implement three unrelated copies"). Each of the
 * three root containers below is `relative overflow-hidden`:
 * `overflow-hidden` clips `BackgroundLayer`'s blur overscan (see that
 * component's own doc comment) and `relative` establishes the positioning
 * context `BackgroundLayer`'s `absolute` positioning resolves against.
 * Every container's actual content is then given `relative z-10` (not just
 * left as plain normal-flow content) — this is NOT decorative: per CSS 2.1
 * §E's stacking/painting order, a `position:absolute` layer paints AFTER
 * ordinary non-positioned in-flow content within the same stacking context,
 * meaning an unstacked background div would silently paint ON TOP of,
 * hiding, the section/row/column's real content. Giving content its own
 * `relative` (positioned) stacking context + `z-10` guarantees it paints
 * after (above) the background layer regardless of DOM order. Confirmed by
 * direct reasoning through the CSS painting-order spec during this phase —
 * do not remove `relative z-10` from content as "unnecessary," it is load-
 * bearing for background visibility to not invert.
 */

export type SectionMaxWidthOption = "contained" | "wide" | "full";
export type RowVerticalAlign = "top" | "center" | "bottom";
export type ColumnContentAlignment = "left" | "center" | "right";

const SECTION_MAX_WIDTH_PX: Record<SectionMaxWidthOption, number | undefined> =
  {
    contained: 1024,
    wide: 1280,
    full: undefined,
  };

/**
 * `Rows`/`Columns`/`Elements` below are Puck `SlotComponent` render props
 * (see config.tsx's `slot` field wiring) — NOT plain React children. Puck
 * requires className/style to be applied directly on the slot component
 * call itself, not on a wrapping `<div>` around it: Puck wraps each slot
 * item in its own internal DOM node for drag tracking, so a wrapping div
 * would put layout CSS (e.g. `display:grid`) one level too deep to actually
 * contain those wrapper nodes as its children. Proven in the POC (master
 * spec §3's Section→Row→Column note) — do not "simplify" this back to a
 * wrapping div, it silently breaks Row's column grid. Phase 2D's added
 * `relative z-10` classes are appended to those SAME direct slot-call
 * classNames, never moved to a wrapper, for exactly this reason.
 */
export function SectionRender({
  background,
  maxWidth,
  paddingTop,
  paddingBottom,
  rows: Rows,
}: {
  background: BackgroundConfig;
  maxWidth: SectionMaxWidthOption;
  paddingTop: number;
  paddingBottom: number;
  rows: React.ComponentType<{ allow?: string[] }>;
}) {
  return (
    <section
      style={{ paddingTop, paddingBottom }}
      className="relative overflow-hidden px-6"
    >
      <BackgroundLayer background={background} />
      <div
        className="relative z-10 mx-auto flex flex-col gap-8"
        style={{ maxWidth: SECTION_MAX_WIDTH_PX[maxWidth] }}
      >
        <Rows allow={["Row"]} />
      </div>
    </section>
  );
}

export function RowRender({
  background,
  gap,
  verticalAlign,
  columns: Columns,
}: {
  background: BackgroundConfig;
  gap: number;
  verticalAlign: RowVerticalAlign;
  columns: React.ComponentType<{
    allow?: string[];
    className?: string;
    style?: React.CSSProperties;
  }>;
}) {
  return (
    // This outer div carries ONLY relative/overflow-hidden for the
    // background layer — never grid/gap CSS, which must stay directly on
    // the Columns slot call below per this file's slot-styling rule.
    <div className="relative overflow-hidden">
      <BackgroundLayer background={background} />
      <Columns
        allow={["Column"]}
        className="relative z-10 grid grid-cols-12"
        style={{
          gap,
          alignItems:
            verticalAlign === "center"
              ? "center"
              : verticalAlign === "bottom"
                ? "flex-end"
                : "start",
        }}
      />
    </div>
  );
}

/**
 * Column needs `puck.dragRef` attached to its OWN root DOM node (via the
 * `puck` prop Puck injects into every component's render function) so that
 * node — not Puck's internal per-slot-item wrapper — is the actual CSS Grid
 * child Row's `col-span-*` sizing applies to. This is the `inline: true` +
 * `puck.dragRef` pairing from master spec §3/§7; `inline: true` itself is
 * set on the Column entry in config.tsx (it's a component-level config
 * flag, not something this render function controls), but the render
 * function must still accept and attach `puck.dragRef` for that flag to do
 * anything. Do not remove this even though nothing here "looks" like it
 * needs it — without it, width classes are silently inert (both columns
 * render full-width regardless of their `width` field), a real, once-
 * confirmed regression, not a hypothetical one.
 *
 * Phase 2D: `COLUMN_SPAN_CLASS[width]` (the grid-sizing class Row's grid
 * depends on) stays on this dragRef'd root div exactly as before — the
 * flex/gap/alignment classes that used to live here too have moved onto
 * the `Elements` slot call itself instead, alongside a new `relative z-10`,
 * matching the same direct-slot-styling pattern Row/Columns already uses.
 * The root div itself becomes `relative overflow-hidden` (for
 * `BackgroundLayer`) and otherwise just a sizing/positioning box.
 */
export function ColumnRender({
  background,
  width,
  alignment,
  elements: Elements,
  dragRef,
}: {
  background: BackgroundConfig;
  width: PuckColumnWidth;
  alignment: ColumnContentAlignment;
  elements: React.ComponentType<{
    allow?: string[];
    className?: string;
  }>;
  dragRef: ((element: Element | null) => void) | null;
}) {
  return (
    <div
      ref={dragRef}
      className={cn(
        "relative min-w-0 overflow-hidden",
        COLUMN_SPAN_CLASS[width]
      )}
    >
      <BackgroundLayer background={background} />
      <Elements
        allow={[
          "Heading",
          "Text",
          "Button",
          "Image",
          "Video",
          "Divider",
          "Spacer",
          "Accordion",
          "Form",
        ]}
        className={cn(
          "relative z-10 flex flex-col gap-4",
          alignment === "center"
            ? "items-center text-center"
            : alignment === "right"
              ? "items-end text-right"
              : ""
        )}
      />
    </div>
  );
}
