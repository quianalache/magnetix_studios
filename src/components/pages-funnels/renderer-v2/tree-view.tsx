import Image from "next/image";
import { cn } from "@/lib/utils";
import { PublicForm } from "@/components/forms/public-form";
import type { LeadForm } from "@/types/forms";
import type { BlockAlignment, ButtonStyle } from "@/types/pages-funnels";
import type {
  ColumnNode,
  ElementNode,
  RowNode,
  SectionNode,
} from "@/types/pages-funnels-v2";

/**
 * V2 recursive renderer — Phase A only. `SectionView` → `RowView` →
 * `ColumnView` → `ElementView`, one small component per tree level, mapping
 * directly onto `src/types/pages-funnels-v2.ts`'s fixed 4-level shape.
 *
 * NOT wired into the editor canvas, `/p/[pageId]`, or the current
 * `PageRenderer` — this file exists so the tree types can be proven against
 * real render output (see the Phase A validation fixtures) without touching
 * anything V1 depends on. `src/components/pages-funnels/renderer/
 * block-view.tsx` (V1) is intentionally NOT imported from here: the two
 * renderers are kept decoupled on purpose during this phase so neither can
 * destabilize the other, even though a few small presentational choices
 * (alignment classes, button style classes) are consequently duplicated in
 * miniature below rather than shared. Once V2 is the only renderer (past
 * Phase D), that duplication goes away with V1's file, not before.
 */

const ALIGN_TEXT_CLASS: Record<BlockAlignment, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const ALIGN_JUSTIFY_CLASS: Record<BlockAlignment, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

const BUTTON_STYLE_CLASS: Record<ButtonStyle, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-border bg-transparent hover:bg-muted",
};

/** Same concept as V1's `editorLinkClickGuard` (block-view.tsx): while
 *  `editing` is true, a real link's default navigation is suppressed
 *  (click doesn't leave the editor) without stopping propagation, so a
 *  future selection handler up the tree can still see the click. This is
 *  the ONE behavior explicitly carried forward per the Phase A spec —
 *  intentionally not imported from V1's copy (see file doc comment) and
 *  intentionally not yet wired to anything, since V2 has no editor
 *  selection model until Phase D. */
function editorLinkClickGuard(editing: boolean | undefined) {
  return editing ? (e: React.MouseEvent) => e.preventDefault() : undefined;
}

const MAX_WIDTH_CLASS: Record<SectionNode["style"]["maxWidth"], string> = {
  contained: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

const COLUMN_WIDTH_CLASS: Record<ColumnNode["width"], string> = {
  auto: "flex-1",
  "1/4": "basis-1/4",
  "1/3": "basis-1/3",
  "1/2": "basis-1/2",
  "2/3": "basis-2/3",
  "3/4": "basis-3/4",
  full: "basis-full",
};

const VERTICAL_ALIGN_CLASS: Record<RowNode["layout"]["verticalAlign"], string> = {
  top: "items-start",
  center: "items-center",
  bottom: "items-end",
};

interface TreeViewProps {
  /** True only inside an editor canvas — neutralizes link clicks (see
   *  `editorLinkClickGuard`) instead of navigating away. Undefined/false
   *  everywhere else (public rendering), same contract V1 established. */
  editing?: boolean;
  /** Resolved `LeadForm`s for any `form` elements, keyed by `formId` — the
   *  renderer never reaches into Firestore itself, same as V1's BlockView. */
  resolvedForms?: Record<string, LeadForm | null>;
}

export function ElementView({
  element,
  editing,
  resolvedForms,
}: TreeViewProps & { element: ElementNode }) {
  switch (element.type) {
    case "heading": {
      const c = element.content;
      const Tag = c.level;
      const sizeClass =
        c.level === "h1" ? "text-4xl font-bold" : c.level === "h2" ? "text-3xl font-bold" : "text-2xl font-semibold";
      return <Tag className={cn(sizeClass, "tracking-tight", ALIGN_TEXT_CLASS[c.alignment])}>{c.text}</Tag>;
    }

    case "text": {
      const c = element.content;
      return <p className={cn("whitespace-pre-wrap text-base text-foreground/80", ALIGN_TEXT_CLASS[c.alignment])}>{c.text}</p>;
    }

    case "button": {
      const c = element.content;
      return (
        <div className={cn("flex", ALIGN_JUSTIFY_CLASS[c.alignment])}>
          <a
            href={c.link || "#"}
            target={c.openInNewTab ? "_blank" : undefined}
            rel={c.openInNewTab ? "noreferrer" : undefined}
            onClick={editorLinkClickGuard(editing)}
            className={cn("rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors", BUTTON_STYLE_CLASS[c.style])}
          >
            {c.text}
          </a>
        </div>
      );
    }

    case "image": {
      const c = element.content;
      const img = c.src ? (
        <Image src={c.src} alt={c.alt || ""} width={1200} height={675} unoptimized className="h-auto w-full rounded-xl object-cover" />
      ) : (
        <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
          No image set
        </div>
      );
      return c.link ? (
        <a href={c.link} onClick={editorLinkClickGuard(editing)}>
          {img}
        </a>
      ) : (
        img
      );
    }

    case "video": {
      const c = element.content;
      return c.url ? (
        <div className="space-y-1.5">
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
            <iframe src={c.url} title={c.caption || "Video"} className="h-full w-full" allowFullScreen />
          </div>
          {c.caption && <p className="text-xs text-muted-foreground">{c.caption}</p>}
        </div>
      ) : (
        <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
          No video set
        </div>
      );
    }

    case "divider":
      return element.content.style === "line" ? <hr className="border-border" /> : <div />;

    case "spacer":
      return <div style={{ height: element.content.height }} />;

    case "form": {
      const form = element.content.formId ? resolvedForms?.[element.content.formId] : null;
      return form ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--mx-shadow-card,none)]">
          <PublicForm form={form} />
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
          {element.content.formName ?? "No form selected"}
        </div>
      );
    }
  }
}

export function ColumnView({ column, editing, resolvedForms }: TreeViewProps & { column: ColumnNode }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        COLUMN_WIDTH_CLASS[column.width],
        column.style.alignment === "center" && "items-center text-center",
        column.style.alignment === "right" && "items-end text-right",
      )}
    >
      {column.elements.map((element) => (
        <ElementView key={element.id} element={element} editing={editing} resolvedForms={resolvedForms} />
      ))}
    </div>
  );
}

export function RowView({ row, editing, resolvedForms }: TreeViewProps & { row: RowNode }) {
  return (
    <div
      className={cn("flex flex-col flex-wrap sm:flex-row", VERTICAL_ALIGN_CLASS[row.layout.verticalAlign])}
      style={{ gap: row.layout.gap }}
    >
      {row.columns.map((column) => (
        <ColumnView key={column.id} column={column} editing={editing} resolvedForms={resolvedForms} />
      ))}
    </div>
  );
}

export function SectionView({ section, editing, resolvedForms }: TreeViewProps & { section: SectionNode }) {
  return (
    <section
      data-section-id={section.id}
      style={{ paddingTop: section.spacing.paddingTop, paddingBottom: section.spacing.paddingBottom }}
      className={cn(
        "px-6",
        section.style.background === "solid" && "bg-muted",
        section.style.background === "gradient" && "mx-hero-gradient bg-gradient-to-br from-rose-200 via-fuchsia-100 to-violet-300",
      )}
    >
      <div className={cn("mx-auto flex flex-col gap-8", MAX_WIDTH_CLASS[section.style.maxWidth])}>
        {section.rows.map((row) => (
          <RowView key={row.id} row={row} editing={editing} resolvedForms={resolvedForms} />
        ))}
      </div>
    </section>
  );
}

/** Convenience wrapper mapping a whole `PageSectionTree` — the Phase C
 *  analogue of V1's `PageRenderer`. Not used anywhere yet; included so
 *  Phase C has an obvious, already-typed place to start rather than
 *  reinventing this shape then. */
export function SectionTreeView({
  sections,
  editing,
  resolvedForms,
}: TreeViewProps & { sections: SectionNode[] }) {
  return (
    <div>
      {sections.map((section) => (
        <SectionView key={section.id} section={section} editing={editing} resolvedForms={resolvedForms} />
      ))}
    </div>
  );
}
