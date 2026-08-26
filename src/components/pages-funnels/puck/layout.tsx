import type { PuckColumnWidth } from "@/types/pages-funnels-puck";
import { COLUMN_SPAN_CLASS } from "@/lib/pages-funnels/puck/constants";

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
 */

export type SectionBackground = "none" | "solid" | "gradient";
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
 * wrapping div, it silently breaks Row's column grid.
 */
export function SectionRender({
  background,
  maxWidth,
  paddingTop,
  paddingBottom,
  rows: Rows,
}: {
  background: SectionBackground;
  maxWidth: SectionMaxWidthOption;
  paddingTop: number;
  paddingBottom: number;
  rows: React.ComponentType<{ allow?: string[] }>;
}) {
  return (
    <section
      style={{
        paddingTop,
        paddingBottom,
        background:
          background === "gradient"
            ? "linear-gradient(120deg, var(--accent) 0%, var(--primary) 100%)"
            : background === "solid"
              ? "var(--muted)"
              : undefined,
      }}
      className="px-6"
    >
      <div
        className="mx-auto flex flex-col gap-8"
        style={{ maxWidth: SECTION_MAX_WIDTH_PX[maxWidth] }}
      >
        <Rows allow={["Row"]} />
      </div>
    </section>
  );
}

export function RowRender({
  gap,
  verticalAlign,
  columns: Columns,
}: {
  gap: number;
  verticalAlign: RowVerticalAlign;
  columns: React.ComponentType<{
    allow?: string[];
    className?: string;
    style?: React.CSSProperties;
  }>;
}) {
  return (
    <Columns
      allow={["Column"]}
      className="grid grid-cols-12"
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
 */
export function ColumnRender({
  width,
  alignment,
  elements: Elements,
  dragRef,
}: {
  width: PuckColumnWidth;
  alignment: ColumnContentAlignment;
  elements: React.ComponentType<{ allow?: string[] }>;
  dragRef: ((element: Element | null) => void) | null;
}) {
  return (
    <div
      ref={dragRef}
      className={
        `flex min-w-0 flex-col gap-4 ${COLUMN_SPAN_CLASS[width]}` +
        (alignment === "center"
          ? " items-center text-center"
          : alignment === "right"
            ? " items-end text-right"
            : "")
      }
    >
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
      />
    </div>
  );
}
