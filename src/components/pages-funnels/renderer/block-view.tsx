import Image from "next/image";
import { cn } from "@/lib/utils";
import type {
  BlockAlignment,
  BackgroundStyle,
  ButtonStyle,
  PageBlock,
} from "@/types/pages-funnels";
import { PublicForm } from "@/components/forms/public-form";
import type { LeadForm } from "@/types/forms";

/**
 * Pure, presentational renderer for ONE block — no editor concerns (no
 * selection, no dnd) live here. `PageRenderer` below maps a page's `blocks`
 * array through this component; the editor canvas wraps each rendered block
 * with its own selection/hover chrome rather than forking this file, so the
 * editor, the public preview, and (later) templates/AI output always paint
 * pixel-identical output from the same schema.
 */

const ALIGN_CLASS: Record<BlockAlignment, string> = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

/** Shared by every button-shaped link (Hero's primary CTA, the standalone
 *  Button block, CTA block) so "button style" means one visual vocabulary
 *  across blocks rather than each block inventing its own. */
const BUTTON_STYLE_CLASS: Record<ButtonStyle, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-border bg-transparent hover:bg-muted",
};

/** In the editor canvas, every rendered `<a href>` is a REAL anchor — that's
 *  correct for the public page, but inside the editor it means clicking a
 *  button/link navigates the browser away (losing unsaved edits) instead of
 *  just selecting the block. `href` stays put either way (so hovering still
 *  previews the destination in the browser's status bar); this only stops
 *  the click's default navigation. It deliberately does NOT stopPropagation
 *  — the click still bubbles up to the canvas's block-select handler. */
function editorLinkClickGuard(editing: boolean | undefined) {
  return editing ? (e: React.MouseEvent) => e.preventDefault() : undefined;
}

function backgroundClass(style: BackgroundStyle, variant: "hero" | "cta" = "hero") {
  if (style === "gradient") {
    return variant === "hero"
      ? "mx-hero-gradient bg-gradient-to-br from-rose-200 via-fuchsia-100 to-violet-300 text-foreground"
      : "mx-banner-gradient bg-gradient-to-r from-fuchsia-600 via-purple-600 to-violet-700 text-white";
  }
  if (style === "solid") return variant === "hero" ? "bg-muted" : "bg-primary text-primary-foreground";
  if (style === "image") return "bg-muted";
  return "";
}

function Section({
  block,
  className,
  children,
}: {
  block: PageBlock;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-block-id={block.id}
      data-block-type={block.type}
      style={{
        paddingTop: block.spacing.paddingTop,
        paddingBottom: block.spacing.paddingBottom,
      }}
      className={cn("px-6", className)}
    >
      {children}
    </section>
  );
}

interface BlockViewProps {
  block: PageBlock;
  /** Resolved when the block is a `form` block and its referenced form has
   *  been fetched by the caller — the renderer never reaches into Firestore
   *  itself, keeping it usable in server contexts too. */
  resolvedForm?: LeadForm | null;
  /** True only when rendering inside the editor canvas — neutralizes link
   *  clicks (see `editorLinkClickGuard`) so buttons/links are inert while
   *  editing instead of navigating the browser away. Left undefined (falsy)
   *  everywhere else — the public `/p/[pageId]` route and the editor's own
   *  "Preview" tab both render via the same `PageRenderer` without this
   *  flag, so real navigation is unaffected there. */
  editing?: boolean;
}

export function BlockView({ block, resolvedForm, editing }: BlockViewProps) {
  switch (block.type) {
    case "hero": {
      const c = block.content;
      return (
        <Section block={block} className={backgroundClass(c.backgroundStyle, "hero")}>
          <div className={cn("mx-auto flex max-w-3xl flex-col gap-4", ALIGN_CLASS[c.alignment])}>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{c.headline}</h1>
            {c.subheadline && (
              <p className="max-w-2xl text-lg text-foreground/80">{c.subheadline}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-4" style={{ justifyContent: c.alignment === "center" ? "center" : c.alignment === "right" ? "flex-end" : "flex-start" }}>
              {c.buttonText && (
                <a
                  href={c.buttonLink || "#"}
                  target={c.buttonOpenInNewTab ? "_blank" : undefined}
                  rel={c.buttonOpenInNewTab ? "noreferrer" : undefined}
                  onClick={editorLinkClickGuard(editing)}
                  className={cn(
                    "rounded-full px-6 py-3 text-sm font-semibold shadow-sm transition-transform hover:scale-[1.02]",
                    BUTTON_STYLE_CLASS[c.buttonStyle ?? "primary"],
                  )}
                >
                  {c.buttonText}
                </a>
              )}
              {c.secondaryLinkText && (
                <a
                  href={c.secondaryLinkLink || "#"}
                  onClick={editorLinkClickGuard(editing)}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  {c.secondaryLinkText}
                </a>
              )}
            </div>
          </div>
        </Section>
      );
    }

    case "heading": {
      const c = block.content;
      const Tag = c.level;
      const sizeClass =
        c.level === "h1" ? "text-4xl font-bold" : c.level === "h2" ? "text-3xl font-bold" : "text-2xl font-semibold";
      return (
        <Section block={block}>
          <Tag className={cn(sizeClass, "tracking-tight", ALIGN_CLASS[c.alignment].split(" ")[0])}>
            {c.text}
          </Tag>
        </Section>
      );
    }

    case "text": {
      const c = block.content;
      return (
        <Section block={block}>
          <p className={cn("mx-auto max-w-3xl whitespace-pre-wrap text-base text-foreground/80", ALIGN_CLASS[c.alignment].split(" ")[0])}>
            {c.text}
          </p>
        </Section>
      );
    }

    case "button": {
      const c = block.content;
      return (
        <Section block={block}>
          <div className={cn("flex", c.alignment === "center" ? "justify-center" : c.alignment === "right" ? "justify-end" : "justify-start")}>
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
        </Section>
      );
    }

    case "image": {
      const c = block.content;
      const img = c.src ? (
        <Image
          src={c.src}
          alt={c.alt || ""}
          width={1200}
          height={675}
          unoptimized
          className="mx-auto h-auto w-full max-w-3xl rounded-xl object-cover"
        />
      ) : (
        <div className="mx-auto flex h-56 w-full max-w-3xl items-center justify-center rounded-xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
          No image set
        </div>
      );
      return (
        <Section block={block}>
          {c.link ? (
            <a href={c.link} onClick={editorLinkClickGuard(editing)}>
              {img}
            </a>
          ) : (
            img
          )}
        </Section>
      );
    }

    case "features": {
      const c = block.content;
      return (
        <Section block={block}>
          <div className="mx-auto max-w-5xl text-center">
            {c.eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.eyebrow}</p>}
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{c.headline}</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {c.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-card p-6 text-left shadow-[var(--mx-shadow-card,none)]">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      );
    }

    case "testimonials": {
      const c = block.content;
      return (
        <Section block={block}>
          <div className="mx-auto max-w-5xl text-center">
            {c.eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.eyebrow}</p>}
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{c.headline}</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {c.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-card p-6 text-left shadow-[var(--mx-shadow-card,none)]">
                  <p className="text-sm italic text-foreground/90">&ldquo;{item.quote}&rdquo;</p>
                  <p className="mt-3 text-sm font-semibold">— {item.name}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      );
    }

    case "faq": {
      const c = block.content;
      return (
        <Section block={block}>
          <div className="mx-auto max-w-3xl text-center">
            {c.eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.eyebrow}</p>}
            <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{c.headline}</h2>
            <div className="mt-8 space-y-3 text-left">
              {c.items.map((item) => (
                <details key={item.id} className="rounded-xl border border-border bg-card p-4">
                  <summary className="cursor-pointer text-sm font-semibold">{item.question}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </Section>
      );
    }

    case "cta": {
      const c = block.content;
      return (
        <Section block={block} className={cn("rounded-none", backgroundClass(c.backgroundStyle, "cta"))}>
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.headline}</h2>
            {c.subheadline && <p className="text-base opacity-90">{c.subheadline}</p>}
            {c.buttonText && (
              <a
                href={c.buttonLink || "#"}
                onClick={editorLinkClickGuard(editing)}
                className="mt-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-white/90"
              >
                {c.buttonText}
              </a>
            )}
          </div>
        </Section>
      );
    }

    case "divider":
      return (
        <Section block={block}>
          {block.content.style === "line" ? <hr className="mx-auto max-w-5xl border-border" /> : <div />}
        </Section>
      );

    case "spacer":
      return <div data-block-id={block.id} data-block-type="spacer" style={{ height: block.content.height }} />;

    case "form":
      return (
        <Section block={block}>
          <div className="mx-auto max-w-xl">
            {resolvedForm ? (
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--mx-shadow-card,none)]">
                <PublicForm form={resolvedForm} />
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
                {block.content.formName ?? "No form selected — pick one from the Content tab."}
              </div>
            )}
          </div>
        </Section>
      );
  }
}
