import type { ReactNode } from "react";
import type {
  PuckAlignment,
  PuckButtonStyle,
  PageAction,
  StyleConfig,
  BackgroundConfig,
} from "@/types/pages-funnels-puck";
import {
  resolveActionHref,
  actionOpensNewTab,
} from "@/lib/pages-funnels/puck/action";
import {
  resolveBaseStyleProps,
  resolveResponsiveCss,
} from "@/lib/pages-funnels/puck/style";
import { BackgroundLayer } from "@/components/pages-funnels/puck/background-layer";

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
 *
 * System A (master spec §24.3/§24.20): every element below except Spacer
 * (explicitly kept a pure semantic-height primitive, per that task's
 * instruction) now accepts an optional `id`/`style: StyleConfig` pair —
 * see layout.tsx's own doc comment for the exact additive-only mechanics
 * (`resolveBaseStyleProps` layered as extra inline style on top of each
 * element's existing Tailwind classes; `resolveResponsiveCss` emitting a
 * sibling `<style>` tag only when there's actually a responsive override
 * or a hidden device to express — `null`/no-op otherwise). Per-component
 * `StyleCompatibility` (which groups each editor exposes) lives in
 * config.tsx, not here — this file only needs to KNOW how to render
 * whatever `StyleConfig` groups happen to be set, unconditionally.
 */

// `text` is typed `ReactNode`, not `string` — required once a field has
// `contentEditable: true` (config.tsx). Per Puck's own documented behavior:
// "Enabling inline text editing changes the field value in the render
// function from a string to a React node." Puck owns the
// contentEditable<->Data sync internally; these components just need to
// stop assuming a string and render `text` as children, which JSX already
// does for any ReactNode.
export function HeadingRender({
  id,
  text,
  level,
  alignment,
  style,
}: {
  id: string;
  text: ReactNode;
  level: "h1" | "h2" | "h3";
  alignment: PuckAlignment;
  style?: StyleConfig;
}) {
  const Tag = level;
  const size =
    level === "h1"
      ? "text-4xl font-bold"
      : level === "h2"
        ? "text-3xl font-bold"
        : "text-2xl font-semibold";
  const responsiveCss = resolveResponsiveCss(id, style);
  return (
    <>
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
      <Tag
        id={id}
        className={`${size} tracking-tight ${ALIGN_CLASS[alignment]}`}
        style={resolveBaseStyleProps(style)}
      >
        {text}
      </Tag>
    </>
  );
}

export function TextRender({
  id,
  text,
  alignment,
  style,
}: {
  id: string;
  text: ReactNode;
  alignment: PuckAlignment;
  style?: StyleConfig;
}) {
  // TODO(Phase 2+): expand to real rich text (bold/italic/underline/links/
  // lists) via Puck's `richtext` field type (Tiptap-based — confirmed
  // present as a peer dependency in the feasibility audit). Kept as plain
  // text in Phase 1, matching the approved Launch-scope element inventory
  // ("Text / Rich Text" is one Launch line item, not required to ship with
  // rich text on day one of the foundation). System A's Typography system
  // (master spec §24 task §17) is deliberately built to work unchanged
  // once Rich Text lands — `resolveTypographyStyles` doesn't assume plain
  // text, it just resolves CSS.
  const responsiveCss = resolveResponsiveCss(id, style);
  return (
    <>
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
      <p
        id={id}
        className={`text-muted-foreground text-base whitespace-pre-wrap ${ALIGN_CLASS[alignment]}`}
        style={resolveBaseStyleProps(style)}
      >
        {text}
      </p>
    </>
  );
}

/**
 * Button already had an existing field literally named `style`
 * (`PuckButtonStyle` — the primary/secondary/outline preset) before
 * System A. Per this file's additive-only rule, that field is kept
 * completely unchanged — the new shared System A styling prop is named
 * `styleConfig` instead of `style` for Button specifically (every other
 * element in this file has no such collision and uses the plain name
 * `style`), rather than renaming the pre-existing preset field, which
 * would be a breaking prop-shape change touching config.tsx's defaultProps
 * and every migrate-v1.ts Button mapping for zero real benefit.
 */
export function ButtonRender({
  id,
  text,
  action,
  style: buttonStyle,
  alignment,
  background,
  styleConfig,
}: {
  id: string;
  text: string;
  action: PageAction;
  style: PuckButtonStyle;
  alignment: PuckAlignment;
  background?: BackgroundConfig;
  styleConfig?: StyleConfig;
}) {
  const href = resolveActionHref(action);
  const responsiveCss = resolveResponsiveCss(id, styleConfig);
  return (
    <div className={`flex ${JUSTIFY_CLASS[alignment]}`}>
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
      <a
        id={id}
        href={href || "#"}
        target={actionOpensNewTab(action) ? "_blank" : undefined}
        rel={actionOpensNewTab(action) ? "noreferrer" : undefined}
        aria-disabled={!href}
        className={`relative overflow-hidden rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors ${BUTTON_STYLE_CLASS[buttonStyle]}`}
        style={resolveBaseStyleProps(styleConfig)}
      >
        {/* System A: an OPTIONAL real BackgroundConfig (Solid/Gradient,
            same shared system Section/Row/Column use) layered behind the
            label — only rendered (and only visually present) when the
            user has actually set `background.source !== "none"`; when
            unset (the default, and every migrated Button), this renders
            null and the existing `BUTTON_STYLE_CLASS` Tailwind preset
            (bg-primary/bg-accent/outline) shows through exactly as before.
            Same "layer new capability behind the preset, never remove it"
            additive rule as everywhere else in this file. */}
        <BackgroundLayer background={background} />
        <span className="relative z-10">{text}</span>
      </a>
    </div>
  );
}

export function ImageRender({
  id,
  src,
  alt,
  action,
  style,
}: {
  id: string;
  src: string;
  alt: string;
  action: PageAction;
  style?: StyleConfig;
}) {
  const href = resolveActionHref(action);
  const responsiveCss = resolveResponsiveCss(id, style);
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-entered URLs, same as V1/V2's Image renderer.
    <img
      src={src}
      alt={alt}
      className="h-auto w-full rounded-xl object-cover"
      style={resolveBaseStyleProps(style)}
    />
  ) : (
    <div className="border-border bg-muted text-muted-foreground flex h-56 w-full items-center justify-center rounded-xl border border-dashed text-sm">
      No image set
    </div>
  );
  return (
    <div id={id}>
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
      {href ? (
        <a
          href={href}
          target={actionOpensNewTab(action) ? "_blank" : undefined}
          rel={actionOpensNewTab(action) ? "noreferrer" : undefined}
        >
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  );
}

/** Minimal implementation only, per the master spec's Phase 1 scope — a raw
 *  embeddable URL (YouTube/Vimeo/Loom/mp4) in an iframe, no oEmbed/provider
 *  parsing. Identical contract to V2's "video" case
 *  (renderer-v2/tree-view.tsx) — same primitive, ported as-is. */
export function VideoRender({
  id,
  url,
  caption,
  style,
}: {
  id: string;
  url: string;
  caption: string;
  style?: StyleConfig;
}) {
  const responsiveCss = resolveResponsiveCss(id, style);
  return (
    <div id={id} className="space-y-1.5">
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
      {url ? (
        <>
          <div
            className="border-border aspect-video w-full overflow-hidden rounded-xl border bg-black"
            style={resolveBaseStyleProps(style)}
          >
            <iframe
              src={url}
              title={caption || "Video"}
              className="h-full w-full"
              allowFullScreen
            />
          </div>
          {caption && (
            <p className="text-muted-foreground text-xs">{caption}</p>
          )}
        </>
      ) : (
        <div className="border-border bg-muted text-muted-foreground flex h-56 w-full items-center justify-center rounded-xl border border-dashed text-sm">
          No video set
        </div>
      )}
    </div>
  );
}

/** Same `style`-name collision as `ButtonRender` — Divider already had an
 *  existing `style: "line" | "space"` field before System A, so the new
 *  shared styling prop is `styleConfig` here too, not `style`. */
export function DividerRender({
  id,
  style: dividerStyle,
  styleConfig,
}: {
  id: string;
  style: "line" | "space";
  styleConfig?: StyleConfig;
}) {
  const responsiveCss = resolveResponsiveCss(id, styleConfig);
  return (
    <div id={id} style={resolveBaseStyleProps(styleConfig)}>
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
      {dividerStyle === "line" ? <hr className="border-border" /> : <div />}
    </div>
  );
}

/** Spacer deliberately does NOT gain a `style: StyleConfig` prop — System A
 *  task §6: "Spacer remains its own semantic height element." Its one job
 *  is the `height` field it already has. */
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
  style,
}: {
  id: string;
  items: AccordionItemData[];
  allowMultiple?: boolean;
  style?: StyleConfig;
}) {
  // Scoped to this Accordion instance's own id (not a fixed string) — a page
  // can hold more than one Accordion, and native `<details name="...">`
  // grouping is global to the whole document by name, so two different
  // Accordion elements sharing one name would incorrectly close each
  // other's items. Same fix V2's renderer already uses (element.id).
  const groupName = allowMultiple === false ? id : undefined;
  const responsiveCss = resolveResponsiveCss(id, style);
  return (
    <div id={id} className="space-y-3" style={resolveBaseStyleProps(style)}>
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
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
