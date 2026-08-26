import type { ReactNode } from "react";
import type {
  PuckAlignment,
  PuckButtonStyle,
  PageAction,
} from "@/types/pages-funnels-puck";
import {
  resolveActionHref,
  actionOpensNewTab,
} from "@/lib/pages-funnels/puck/action";

/**
 * Production ELEMENTS category render primitives (master spec §4/§7):
 * Heading, Text, Button, Image, Video, Divider, Spacer, Accordion. Pure,
 * hook-free — genuinely shared between the client/editor config
 * (client-config.tsx) and the server/public `<Render>` config
 * (server-config.tsx) with zero client-only code in this file. Unlike the
 * POC's single elements.tsx (which needed "use client" because Form's
 * interactive fetch logic lived in the same file), Form has its own two
 * variants here (form-client.tsx / form-server.tsx) — see config.tsx's doc
 * comment — so nothing in THIS file needs a client boundary at all.
 *
 * Visual style intentionally reuses the same shadcn/Tailwind theme tokens
 * (`border-border`, `bg-muted`, `text-muted-foreground`, etc.) the V2
 * reference renderer already uses (see
 * src/components/pages-funnels/renderer-v2/tree-view.tsx) — one visual
 * vocabulary across the V2 reference tree and the new Puck primitives, not
 * a third dialect. This is placeholder styling, not the Magnetix visual
 * reskin (master spec §13 defers full pixel-polish).
 */

// `text` is typed `ReactNode`, not `string` — required once a field has
// `contentEditable: true` (config.tsx). Per Puck's own documented behavior:
// "Enabling inline text editing changes the field value in the render
// function from a string to a React node." Puck owns the
// contentEditable<->Data sync internally; these components just need to
// stop assuming a string and render `text` as children, which JSX already
// does for any ReactNode.
export function HeadingRender({
  text,
  level,
  alignment,
}: {
  text: ReactNode;
  level: "h1" | "h2" | "h3";
  alignment: PuckAlignment;
}) {
  const Tag = level;
  const size =
    level === "h1"
      ? "text-4xl font-bold"
      : level === "h2"
        ? "text-3xl font-bold"
        : "text-2xl font-semibold";
  return (
    <Tag className={`${size} tracking-tight ${ALIGN_CLASS[alignment]}`}>
      {text}
    </Tag>
  );
}

export function TextRender({
  text,
  alignment,
}: {
  text: ReactNode;
  alignment: PuckAlignment;
}) {
  // TODO(Phase 2+): expand to real rich text (bold/italic/underline/links/
  // lists) via Puck's `richtext` field type (Tiptap-based — confirmed
  // present as a peer dependency in the feasibility audit). Kept as plain
  // text in Phase 1, matching the approved Launch-scope element inventory
  // ("Text / Rich Text" is one Launch line item, not required to ship with
  // rich text on day one of the foundation).
  return (
    <p
      className={`text-muted-foreground text-base whitespace-pre-wrap ${ALIGN_CLASS[alignment]}`}
    >
      {text}
    </p>
  );
}

export function ButtonRender({
  text,
  action,
  style,
  alignment,
}: {
  text: string;
  action: PageAction;
  style: PuckButtonStyle;
  alignment: PuckAlignment;
}) {
  const href = resolveActionHref(action);
  return (
    <div className={`flex ${JUSTIFY_CLASS[alignment]}`}>
      <a
        href={href || "#"}
        target={actionOpensNewTab(action) ? "_blank" : undefined}
        rel={actionOpensNewTab(action) ? "noreferrer" : undefined}
        aria-disabled={!href}
        className={`rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors ${BUTTON_STYLE_CLASS[style]}`}
      >
        {text}
      </a>
    </div>
  );
}

export function ImageRender({
  src,
  alt,
  action,
}: {
  src: string;
  alt: string;
  action: PageAction;
}) {
  const href = resolveActionHref(action);
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-entered URLs, same as V1/V2's Image renderer.
    <img
      src={src}
      alt={alt}
      className="h-auto w-full rounded-xl object-cover"
    />
  ) : (
    <div className="border-border bg-muted text-muted-foreground flex h-56 w-full items-center justify-center rounded-xl border border-dashed text-sm">
      No image set
    </div>
  );
  return href ? (
    <a
      href={href}
      target={actionOpensNewTab(action) ? "_blank" : undefined}
      rel={actionOpensNewTab(action) ? "noreferrer" : undefined}
    >
      {img}
    </a>
  ) : (
    img
  );
}

/** Minimal implementation only, per the master spec's Phase 1 scope — a raw
 *  embeddable URL (YouTube/Vimeo/Loom/mp4) in an iframe, no oEmbed/provider
 *  parsing. Identical contract to V2's "video" case
 *  (renderer-v2/tree-view.tsx) — same primitive, ported as-is. */
export function VideoRender({
  url,
  caption,
}: {
  url: string;
  caption: string;
}) {
  return url ? (
    <div className="space-y-1.5">
      <div className="border-border aspect-video w-full overflow-hidden rounded-xl border bg-black">
        <iframe
          src={url}
          title={caption || "Video"}
          className="h-full w-full"
          allowFullScreen
        />
      </div>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </div>
  ) : (
    <div className="border-border bg-muted text-muted-foreground flex h-56 w-full items-center justify-center rounded-xl border border-dashed text-sm">
      No video set
    </div>
  );
}

export function DividerRender({ style }: { style: "line" | "space" }) {
  return style === "line" ? <hr className="border-border" /> : <div />;
}

export function SpacerRender({ height }: { height: number }) {
  return <div style={{ height }} />;
}

export interface AccordionItemData {
  id: string;
  title: string;
  content: string;
}

/**
 * General-purpose expand/collapse list — deliberately NOT FAQ-specific
 * (same rule as V2's `AccordionElement`: FAQ becomes a Section *template*
 * that inserts one of these, not a dedicated element type). Native
 * `<details>`/`<summary>`, identical markup/behavior to V2's proven
 * renderer (renderer-v2/tree-view.tsx's "accordion" case) — zero-JS,
 * keyboard-accessible by default, ported as-is rather than reinvented.
 */
export function AccordionRender({
  id,
  items,
  allowMultiple,
}: {
  id: string;
  items: AccordionItemData[];
  allowMultiple?: boolean;
}) {
  // Scoped to this Accordion instance's own id (not a fixed string) — a page
  // can hold more than one Accordion, and native `<details name="...">`
  // grouping is global to the whole document by name, so two different
  // Accordion elements sharing one name would incorrectly close each
  // other's items. Same fix V2's renderer already uses (element.id).
  const groupName = allowMultiple === false ? id : undefined;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.id}
          name={groupName}
          className="group border-border bg-card rounded-xl border p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold group-open:mb-2 marker:content-none">
            {item.title}
          </summary>
          <p className="text-muted-foreground text-sm">{item.content}</p>
        </details>
      ))}
    </div>
  );
}

// ---------- shared style maps ----------

const ALIGN_CLASS: Record<PuckAlignment, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};
const JUSTIFY_CLASS: Record<PuckAlignment, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};
const BUTTON_STYLE_CLASS: Record<PuckButtonStyle, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-accent text-accent-foreground hover:bg-accent/80",
  outline: "border border-primary text-primary hover:bg-primary/10",
};
