"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { ButtonRender } from "@/components/pages-funnels/puck/elements";
import { resolveNavColor } from "@/lib/pages-funnels/navigation";
import { cellFor, hasText, normalizePricing, plainText, type PricingCard, type PricingProps, type PricingText } from "@/lib/pages-funnels/pricing";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import type { ResolvedActionTargets, StyleConfig } from "@/types/pages-funnels-puck";

/**
 * Pricing / Comparison block (Wave 2C) — presentation only (see
 * lib/pages-funnels/pricing.ts). One card list, three layouts:
 *  - Grid: wrapping cards (up to 5 across where the width allows, stacked
 *    on phones), equal height, a restrained featured emphasis.
 *  - Carousel: the same cards in a horizontal scroll-snap track with named
 *    Previous / Next buttons (keyboard + touch; no auto-advance; smooth
 *    scrolling only when the visitor hasn't asked for reduced motion).
 *  - Comparison table: a real <table> — a first-column heading the owner
 *    names (or leaves blank), one row per comparison row, one column per
 *    card; horizontally scrollable with a sticky first column on narrow
 *    screens.
 * In the builder every visible text is inline-editable (Puck
 * `contentEditable` fields) and buttons never navigate (`editing`).
 */
export interface PricingRenderProps extends Partial<Record<keyof PricingProps, unknown>> {
  id: string;
  style?: StyleConfig;
  editing?: boolean;
  resolved?: ResolvedActionTargets;
  brandKit?: readonly { id: string; hex: string }[];
}

const show = (v: PricingText, editing: boolean) => editing || hasText(v);

/**
 * Builder-only hints inside EMPTY inline fields (Puck's inline editor is an
 * empty span otherwise). Never rendered on Preview / public pages, where
 * empty optional fields are simply omitted.
 */
const PLACEHOLDERS: Record<string, string> = {
  heading: "Add a heading",
  subheading: "Add a subheading",
  description: "Add a description",
  badge: "Add badge",
  previousPrice: "Previous price",
  billingLabel: "Billing label",
  pricingCaption: "Pricing caption",
  ctaCaption: "Button caption",
  period: "per…",
  tableLabel: "First column heading",
};
const PLACEHOLDER_CSS = Object.entries(PLACEHOLDERS)
  .map(([key, label]) => `[data-pricing-block] [data-pricing-field="${key}"] [contenteditable]:empty::before{content:"${label}";opacity:.45;font-weight:400}`)
  .join("");

export function PricingComparisonRender({ id, style, editing = false, resolved, brandKit, ...raw }: PricingRenderProps) {
  const p = normalizePricing(raw);
  const responsiveCss = resolveResponsiveCss(id, style);
  const accent = resolveNavColor(p.pricingStyle.accent, brandKit) ?? "var(--primary)";
  const hasCards = p.cards.length > 0;
  if (!hasCards && !editing) return null;

  const cardShell = `pricing-card flex h-full flex-col gap-4 p-6 text-left ${
    p.pricingStyle.appearance === "shadow" ? "bg-card shadow-lg" : p.pricingStyle.appearance === "flat" ? "bg-muted/50" : "bg-card border border-border"
  }`;

  const renderCard = (card: PricingCard) => (
    <article
      key={card.id}
      data-pricing-card={card.id}
      data-featured={card.featured || undefined}
      className={cardShell}
      style={{
        borderRadius: p.pricingStyle.radius,
        ...(card.featured ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}`, background: `color-mix(in srgb, ${accent} 5%, var(--card, #fff))` } : {}),
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-xl font-semibold" data-pricing-field="title">{card.title}</h3>
        {show(card.badge, editing) ? (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
            data-pricing-field="badge"
          >
            {card.badge}
          </span>
        ) : null}
      </div>
      <PriceDisplay card={card} editing={editing} />
      {show(card.description, editing) ? <p className="text-muted-foreground m-0 text-sm" data-pricing-field="description">{card.description}</p> : null}
      {card.items.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm" data-pricing-field="items">
          {card.items.map((it) => (
            <li key={it.id} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-col gap-2 pt-2">
        {show(card.ctaLabel, editing) ? (
          <ButtonRender id={`${id}-${card.id}-cta`} text={card.ctaLabel} action={card.action} style={card.ctaStyle} alignment="center" resolved={resolved} editing={editing} />
        ) : null}
        {show(card.ctaCaption, editing) ? <p className="text-muted-foreground m-0 text-center text-xs" data-pricing-field="ctaCaption">{card.ctaCaption}</p> : null}
      </div>
    </article>
  );

  return (
    <section id={id} data-pricing-block="" data-pricing-layout={p.layout} style={resolveBaseStyleProps(style)} className="w-full">
      {responsiveCss && <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />}
      {editing ? <style dangerouslySetInnerHTML={{ __html: PLACEHOLDER_CSS }} /> : null}
      {show(p.heading, editing) || show(p.subheading, editing) ? (
        <header className="mx-auto mb-8 max-w-2xl text-center">
          {show(p.heading, editing) ? <h2 className="m-0 text-3xl font-semibold text-balance" data-pricing-field="heading">{p.heading}</h2> : null}
          {show(p.subheading, editing) ? <p className="text-muted-foreground mt-3 mb-0 text-base" data-pricing-field="subheading">{p.subheading}</p> : null}
        </header>
      ) : null}
      {!hasCards ? (
        <div className="border-border bg-muted/30 text-muted-foreground rounded-2xl border border-dashed px-6 py-10 text-center text-sm" data-pricing-state="empty">
          Add your first pricing card — use <strong>Cards</strong> in Settings.
        </div>
      ) : p.layout === "table" ? (
        <ComparisonTable p={p} accent={accent} editing={editing} />
      ) : p.layout === "carousel" ? (
        <PricingCarousel id={id} label={plainText(p.heading) || "Pricing plans"} gap={p.pricingStyle.gap} count={p.cards.length}>
          {p.cards.map(renderCard)}
        </PricingCarousel>
      ) : (
        <div
          className="mx-auto grid"
          style={{
            gap: p.pricingStyle.gap,
            // Columns flex down to 12.5rem (five fit across a wide section); the
            // grid's own width is capped by card count so 1–2 cards don't sprawl.
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12.5rem), 1fr))",
            maxWidth: `calc(${p.cards.length} * 22rem + ${p.cards.length - 1} * ${p.pricingStyle.gap}px)`,
          }}
          data-pricing-grid=""
        >
          {p.cards.map(renderCard)}
        </div>
      )}
    </section>
  );
}

/** The price line for a card, by its display mode. Labels like "From" and "/" are layout, not copy. */
function PriceDisplay({ card, editing }: { card: PricingCard; editing: boolean }) {
  const mode = card.priceMode;
  const main =
    mode === "free" ? (show(card.customPrice, editing) ? card.customPrice : "Free")
    : mode === "custom" ? (show(card.customPrice, editing) ? card.customPrice : "Let’s talk")
    : card.price;
  const per = mode === "subscription" || mode === "perUnit" ? card.period : null;
  return (
    <div className="flex flex-col gap-1" data-pricing-field="price" data-price-mode={mode}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {show(card.previousPrice, editing) && mode !== "free" && mode !== "custom" ? (
          <span className="text-muted-foreground text-base">
            <span className="sr-only">Previously </span>
            <s data-pricing-field="previousPrice">{card.previousPrice}</s>
            <span className="sr-only">, now</span>
          </span>
        ) : null}
        {mode === "from" ? <span className="text-muted-foreground text-sm">From</span> : null}
        <span className="text-4xl font-semibold tracking-tight">{main}</span>
        {mode === "range" ? (
          <>
            <span className="text-2xl font-semibold" aria-label="to">–</span>
            <span className="text-4xl font-semibold tracking-tight">{card.priceTo}</span>
          </>
        ) : null}
        {per !== null && show(per, editing) ? (
          <span className="text-muted-foreground text-sm">
            / <span data-pricing-field="period">{per}</span>
          </span>
        ) : null}
      </div>
      {show(card.billingLabel, editing) ? <p className="text-muted-foreground m-0 text-sm" data-pricing-field="billingLabel">{card.billingLabel}</p> : null}
      {show(card.pricingCaption, editing) ? <p className="text-muted-foreground m-0 text-xs" data-pricing-field="pricingCaption">{card.pricingCaption}</p> : null}
    </div>
  );
}

function PricingCarousel({ id, label, gap, count, children }: { id: string; label: string; gap: number; count: number; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);
  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update, count]);
  const move = (dir: 1 | -1) => {
    const el = track.current;
    const first = el?.querySelector<HTMLElement>("[data-pricing-slide]");
    if (!el || !first) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (first.offsetWidth + gap), behavior: reduce ? "auto" : "smooth" });
  };
  const navBtn = "border-border bg-background text-foreground inline-flex size-11 items-center justify-center rounded-full border shadow-sm transition disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} data-pricing-carousel="">
      <div
        ref={track}
        id={`${id}-track`}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-px-1 px-1 pb-3 [scrollbar-width:thin] motion-safe:scroll-smooth"
        style={{ gap }}
        tabIndex={0}
        aria-label={`${label} — scroll for more`}
      >
        {(Array.isArray(children) ? children : [children]).map((child, i) => (
          <div key={i} data-pricing-slide="" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} className="shrink-0 snap-start" style={{ flexBasis: "min(85%, 20rem)" }}>
            {child}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <button type="button" className={navBtn} onClick={() => move(-1)} disabled={atStart} aria-controls={`${id}-track`} aria-label="Previous plans">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button type="button" className={navBtn} onClick={() => move(1)} disabled={atEnd} aria-controls={`${id}-track`} aria-label="Next plans">
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ComparisonTable({ p, accent, editing }: { p: PricingProps; accent: string; editing: boolean }) {
  const caption = plainText(p.heading) || "Plan comparison";
  const sticky = "sticky left-0 z-10 bg-background";
  return (
    <div className="border-border overflow-x-auto rounded-2xl border" role="region" aria-label={`${caption} table — scroll sideways for more plans`} tabIndex={0} data-pricing-table-scroll="">
      <table className="w-full border-collapse text-sm" style={{ minWidth: `${10 + p.cards.length * 9}rem` }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-border border-b">
            <th scope="col" className={`${sticky} min-w-[9rem] px-4 py-4 text-left align-bottom font-semibold`} data-pricing-field="tableLabel">
              {show(p.tableLabel, editing) ? p.tableLabel : <span className="sr-only">Plan details</span>}
            </th>
            {p.cards.map((card) => (
              <th
                key={card.id}
                scope="col"
                className="min-w-[8rem] px-4 py-4 text-center align-bottom font-semibold"
                style={card.featured ? { background: `color-mix(in srgb, ${accent} 8%, transparent)` } : undefined}
              >
                <span className="block text-base">{card.title}</span>
                <span className="text-muted-foreground mt-1 block text-xs font-normal">
                  {card.priceMode === "free" ? (hasText(card.customPrice) ? card.customPrice : "Free") : card.priceMode === "custom" ? (hasText(card.customPrice) ? card.customPrice : "Let’s talk") : card.price}
                  {(card.priceMode === "subscription" || card.priceMode === "perUnit") && hasText(card.period) ? <> / {card.period}</> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row) => (
            <tr key={row.id} className="border-border border-b last:border-b-0" data-pricing-row={row.id}>
              <th scope="row" className={`${sticky} px-4 py-3 text-left font-medium`}>{row.label}</th>
              {p.cards.map((card) => {
                const cell = cellFor(row, card.id);
                return (
                  <td key={card.id} className="px-4 py-3 text-center" style={card.featured ? { background: `color-mix(in srgb, ${accent} 8%, transparent)` } : undefined}>
                    {cell?.kind === "included" ? (
                      <>
                        <Check className="mx-auto size-4" style={{ color: accent }} aria-hidden="true" />
                        <span className="sr-only">Included</span>
                      </>
                    ) : cell?.kind === "excluded" ? (
                      <>
                        <Minus className="text-muted-foreground mx-auto size-4" aria-hidden="true" />
                        <span className="sr-only">Not included</span>
                      </>
                    ) : (
                      cell?.text ?? ""
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!p.rows.length && editing ? (
        <p className="text-muted-foreground m-0 px-4 py-4 text-center text-sm" data-pricing-state="no-rows">Add comparison rows in Settings.</p>
      ) : null}
    </div>
  );
}
