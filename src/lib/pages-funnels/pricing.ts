import { isValidElement, type ReactNode } from "react";
import { DEFAULT_NAV_COLOR, newNavigationId, normalizeNavColor, type NavColorSetting } from "@/lib/pages-funnels/navigation";
import { normalizeStoredAction } from "@/lib/pages-funnels/puck/action";
import type { PageAction } from "@/types/pages-funnels-puck";

/**
 * Pricing / Comparison block (Wave 2C) — the stored model.
 *
 * PRESENTATION ONLY. A card's price, badge and captions are the page
 * owner's own copy: no Offer is required, nothing syncs from an Offer, and
 * nothing is checked against a checkout price. A card's button is an
 * ordinary shared `PageAction` (Page / URL / Section / Booking / Offer
 * checkout / Popup / Call / Email / SMS) — choosing "Go to Offer" links the
 * button, it does not bind the card. Offer/Product association belongs to the
 * later funnel-step / checkout layer.
 *
 * One card list serves all three layouts (Grid, Carousel, Comparison table);
 * comparison rows hold one cell per card, keyed by the card's stable id, so
 * switching layouts never loses anything. Stored in normal page Puck content.
 *
 * Text fields are Puck `contentEditable` fields (inline canvas editing),
 * so in the BUILDER a text value arrives at render time as a React node
 * (Puck's inline editor); on Preview / public pages it is a string. The
 * lenient readers below keep such nodes intact.
 */

export type PricingLayout = "grid" | "carousel" | "table";
export type PriceMode = "fixed" | "subscription" | "from" | "range" | "perUnit" | "free" | "custom";
export type PricingCtaStyle = "primary" | "secondary" | "outline";
export type CellKind = "text" | "included" | "excluded";
export type CardAppearance = "bordered" | "shadow" | "flat";

/** A text value: a string when stored / rendered publicly; a React node (inline editor) in the builder. */
export type PricingText = string | ReactNode;

export interface PricingItem {
  id: string;
  text: PricingText;
}
export interface PricingCard {
  id: string;
  title: PricingText;
  description: PricingText;
  featured: boolean;
  badge: PricingText;
  priceMode: PriceMode;
  price: PricingText;
  priceTo: PricingText;
  period: PricingText;
  customPrice: PricingText;
  previousPrice: PricingText;
  billingLabel: PricingText;
  pricingCaption: PricingText;
  items: PricingItem[];
  ctaLabel: PricingText;
  action: PageAction;
  ctaStyle: PricingCtaStyle;
  ctaCaption: PricingText;
}
export interface ComparisonCell {
  cardId: string;
  kind: CellKind;
  text: PricingText;
}
export interface ComparisonRow {
  id: string;
  label: PricingText;
  cells: ComparisonCell[];
}
export interface PricingStyle {
  appearance: CardAppearance;
  radius: number;
  gap: number;
  accent: NavColorSetting;
}
export interface PricingProps {
  heading: PricingText;
  subheading: PricingText;
  layout: PricingLayout;
  cards: PricingCard[];
  tableLabel: PricingText;
  rows: ComparisonRow[];
  pricingStyle: PricingStyle;
}

export const PRICING_LAYOUTS: PricingLayout[] = ["grid", "carousel", "table"];
export const PRICE_MODES: PriceMode[] = ["fixed", "subscription", "from", "range", "perUnit", "free", "custom"];
export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  fixed: "Fixed",
  subscription: "Subscription",
  from: "From",
  range: "Range",
  perUnit: "Per unit",
  free: "Free",
  custom: "Custom",
};
export const PRICING_CTA_STYLES: PricingCtaStyle[] = ["primary", "secondary", "outline"];
export const CELL_KINDS: CellKind[] = ["text", "included", "excluded"];
export const CARD_APPEARANCES: CardAppearance[] = ["bordered", "shadow", "flat"];

export const PRICING_LIMITS = {
  cards: 8,
  items: 20,
  rows: 30,
  heading: 160,
  subheading: 400,
  title: 80,
  description: 300,
  badge: 40,
  price: 40,
  caption: 160,
  item: 200,
  ctaLabel: 60,
  tableLabel: 80,
  rowLabel: 120,
  cell: 120,
  radius: [0, 40] as const,
  gap: [0, 64] as const,
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const newPricingId = (prefix: string) => newNavigationId(prefix);

// ---------- defaults ----------

const item = (id: string, text: string): PricingItem => ({ id, text });
const card = (id: string, over: Partial<PricingCard>): PricingCard => ({
  id,
  title: "Plan",
  description: "",
  featured: false,
  badge: "",
  priceMode: "subscription",
  price: "$0",
  priceTo: "",
  period: "month",
  customPrice: "",
  previousPrice: "",
  billingLabel: "",
  pricingCaption: "",
  items: [],
  ctaLabel: "Get started",
  action: { type: "none" },
  ctaStyle: "outline",
  ctaCaption: "",
  ...over,
});

/** A new card added from the settings list (ids are assigned by `syncPricingProps`). */
export const NEW_PRICING_CARD: Omit<PricingCard, "id"> = (() => {
  const full: Partial<PricingCard> = card("x", { title: "New plan", description: "Describe who this plan is for.", price: "$99", items: [{ text: "What's included" } as PricingItem] });
  delete full.id;
  return full as Omit<PricingCard, "id">;
})();

export const DEFAULT_PRICING_STYLE: PricingStyle = { appearance: "bordered", radius: 16, gap: 24, accent: DEFAULT_NAV_COLOR };

export function defaultPricingProps(): Omit<PricingProps, never> {
  const cards = [
    card("card-starter", {
      title: "Starter",
      description: "A simple starting point to get momentum.",
      price: "$49",
      billingLabel: "Billed monthly",
      items: [item("item-s1", "Core deliverables"), item("item-s2", "Email support"), item("item-s3", "Up to 1 project")],
      ctaLabel: "Get started",
    }),
    card("card-growth", {
      title: "Growth",
      description: "More support and flexibility as you grow.",
      featured: true,
      badge: "Most popular",
      price: "$129",
      previousPrice: "$159",
      billingLabel: "Billed monthly",
      items: [item("item-g1", "Everything in Starter"), item("item-g2", "Expanded deliverables"), item("item-g3", "Priority support"), item("item-g4", "Up to 3 projects")],
      ctaLabel: "Choose Growth",
      ctaStyle: "primary",
      ctaCaption: "Cancel anytime",
    }),
    card("card-scale", {
      title: "Scale",
      description: "A high-touch partnership with added flexibility.",
      price: "$249",
      billingLabel: "Billed monthly",
      items: [item("item-v1", "Everything in Growth"), item("item-v2", "Dedicated support"), item("item-v3", "Custom scope")],
      ctaLabel: "Talk to us",
    }),
  ];
  const row = (id: string, label: string, cells: [CellKind, string][]): ComparisonRow => ({
    id,
    label,
    cells: cells.map(([kind, text], i) => ({ cardId: cards[i].id, kind, text })),
  });
  return {
    heading: "Choose the plan that fits your goals",
    subheading: "Flexible options for businesses at different stages.",
    layout: "grid",
    cards,
    tableLabel: "What's included",
    rows: [
      row("row-deliverables", "Deliverables", [["text", "Core"], ["text", "Expanded"], ["text", "Custom"]]),
      row("row-projects", "Projects", [["text", "1"], ["text", "Up to 3"], ["text", "Unlimited"]]),
      row("row-priority", "Priority support", [["excluded", ""], ["included", ""], ["included", ""]]),
      row("row-dedicated", "Dedicated contact", [["excluded", ""], ["excluded", ""], ["included", ""]]),
    ],
    pricingStyle: DEFAULT_PRICING_STYLE,
  };
}

// ---------- lenient reading (render) ----------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const clamp = (v: unknown, [min, max]: readonly [number, number], fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Keeps a string (capped) or Puck's inline-editor node; anything else reads as empty. */
export function pricingText(v: unknown, max: number): PricingText {
  if (typeof v === "string") return v.slice(0, max);
  if (isValidElement(v)) return v;
  return "";
}
/** The plain string behind a text value (Puck's inline editor carries it as `props.value`). */
export function plainText(v: unknown): string {
  if (typeof v === "string") return v;
  if (isValidElement(v)) {
    const value = (v.props as { value?: unknown })?.value;
    return typeof value === "string" ? value : "";
  }
  return "";
}
export const hasText = (v: unknown) => plainText(v).trim().length > 0;

export function normalizePricing(raw: unknown): PricingProps {
  const p = obj(raw);
  const L = PRICING_LIMITS;
  const seen = new Set<string>();
  const cards: PricingCard[] = [];
  for (const [i, entry] of (Array.isArray(p.cards) ? p.cards : []).slice(0, L.cards).entries()) {
    const c = obj(entry);
    let id = typeof c.id === "string" && ID.test(c.id) ? c.id : `card-${i}`;
    if (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    cards.push({
      id,
      title: pricingText(c.title, L.title),
      description: pricingText(c.description, L.description),
      featured: c.featured === true,
      badge: pricingText(c.badge, L.badge),
      priceMode: oneOf(c.priceMode, PRICE_MODES, "fixed"),
      price: pricingText(c.price, L.price),
      priceTo: pricingText(c.priceTo, L.price),
      period: pricingText(c.period, L.price),
      customPrice: pricingText(c.customPrice, L.price),
      previousPrice: pricingText(c.previousPrice, L.price),
      billingLabel: pricingText(c.billingLabel, L.caption),
      pricingCaption: pricingText(c.pricingCaption, L.caption),
      items: (Array.isArray(c.items) ? c.items : []).slice(0, L.items).map((it, j) => {
        const o = obj(it);
        return { id: typeof o.id === "string" && ID.test(o.id) ? o.id : `item-${j}`, text: pricingText(o.text, L.item) };
      }),
      ctaLabel: pricingText(c.ctaLabel, L.ctaLabel),
      action: normalizeStoredAction(c.action),
      ctaStyle: oneOf(c.ctaStyle, PRICING_CTA_STYLES, "outline"),
      ctaCaption: pricingText(c.ctaCaption, L.caption),
    });
  }
  const rows: ComparisonRow[] = (Array.isArray(p.rows) ? p.rows : []).slice(0, L.rows).map((r, i) => {
    const o = obj(r);
    return {
      id: typeof o.id === "string" && ID.test(o.id) ? o.id : `row-${i}`,
      label: pricingText(o.label, L.rowLabel),
      cells: (Array.isArray(o.cells) ? o.cells : []).map((cell) => {
        const c = obj(cell);
        return { cardId: typeof c.cardId === "string" ? c.cardId : "", kind: oneOf(c.kind, CELL_KINDS, "text"), text: pricingText(c.text, L.cell) };
      }),
    };
  });
  const s = obj(p.pricingStyle);
  return {
    heading: pricingText(p.heading, L.heading),
    subheading: pricingText(p.subheading, L.subheading),
    layout: oneOf(p.layout, PRICING_LAYOUTS, "grid"),
    cards,
    tableLabel: pricingText(p.tableLabel, L.tableLabel),
    rows,
    pricingStyle: {
      appearance: oneOf(s.appearance, CARD_APPEARANCES, "bordered"),
      radius: clamp(s.radius, L.radius, DEFAULT_PRICING_STYLE.radius),
      gap: clamp(s.gap, L.gap, DEFAULT_PRICING_STYLE.gap),
      accent: normalizeNavColor(s.accent),
    },
  };
}

/** The cell for a card in a row (looked up by the card's stable id). */
export function cellFor(row: ComparisonRow, cardId: string): ComparisonCell | null {
  return row.cells.find((c) => c.cardId === cardId) ?? null;
}

// ---------- builder-side id + cell sync (Puck resolveData) ----------

/**
 * Keeps ids stable and unique and every comparison row holding exactly one
 * cell per card, in card order — run by the builder whenever the block's
 * props change (Puck `resolveData`). Returns the SAME object when nothing
 * needs fixing, so opening a page never rewrites it.
 *  - a card / item / row without an id gets one; a duplicated card (same id
 *    as an earlier card) gets a new id and a copy of the original's cells
 *  - cells for removed cards are dropped; a new card gets empty cells
 */
export function syncPricingProps<T extends Record<string, unknown>>(props: T): T {
  const cards = Array.isArray(props.cards) ? (props.cards as Record<string, unknown>[]) : [];
  const rows = Array.isArray(props.rows) ? (props.rows as Record<string, unknown>[]) : [];
  let changed = false;
  const seen = new Set<string>();
  const copiedFrom = new Map<string, string>();
  const nextCards = cards.map((c) => {
    let next = c;
    let id = typeof c.id === "string" && ID.test(c.id) ? c.id : "";
    if (!id || seen.has(id)) {
      const fresh = newPricingId("card");
      if (id) copiedFrom.set(fresh, id);
      id = fresh;
      next = { ...next, id };
    }
    seen.add(id);
    const items = Array.isArray(c.items) ? (c.items as Record<string, unknown>[]) : [];
    const itemIds = new Set<string>();
    let itemsChanged = false;
    const nextItems = items.map((it) => {
      const iid = typeof it.id === "string" && ID.test(it.id) && !itemIds.has(it.id) ? it.id : "";
      if (iid) {
        itemIds.add(iid);
        return it;
      }
      itemsChanged = true;
      const fresh = newPricingId("item");
      itemIds.add(fresh);
      return { ...it, id: fresh };
    });
    if (itemsChanged) next = { ...next, items: nextItems };
    if (next !== c) changed = true;
    return next;
  });
  const cardIds = nextCards.map((c) => c.id as string);
  const rowIds = new Set<string>();
  const nextRows = rows.map((r) => {
    let next = r;
    const rid = typeof r.id === "string" && ID.test(r.id) && !rowIds.has(r.id) ? r.id : "";
    if (!rid) next = { ...next, id: newPricingId("row") };
    rowIds.add(next.id as string);
    const cells = Array.isArray(r.cells) ? (r.cells as Record<string, unknown>[]) : [];
    const byCard = new Map<string, Record<string, unknown>>();
    for (const cell of cells) if (typeof cell.cardId === "string" && !byCard.has(cell.cardId)) byCard.set(cell.cardId, cell);
    const synced = cardIds.map((cardId) => byCard.get(cardId) ?? { ...(byCard.get(copiedFrom.get(cardId) ?? "") ?? { kind: "text", text: "" }), cardId });
    const same = synced.length === cells.length && synced.every((cell, i) => cell === cells[i]);
    if (!same) next = { ...next, cells: synced };
    if (next !== r) changed = true;
    return next;
  });
  return changed ? { ...props, cards: nextCards, rows: nextRows } : props;
}

// ---------- strict save validation ----------

const tooLong = (v: unknown, max: number) => typeof v === "string" && v.length > max;
const badText = (v: unknown, max: number) => (v !== undefined && typeof v !== "string") || tooLong(v, max);

/** Strict save-time check of one block's props; null when valid. */
export function pricingBlockProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Pricing: the block settings couldn't be read.";
  const p = raw as Record<string, unknown>;
  const L = PRICING_LIMITS;
  if (badText(p.heading, L.heading)) return `Pricing: the heading can be at most ${L.heading} characters.`;
  if (badText(p.subheading, L.subheading)) return `Pricing: the subheading can be at most ${L.subheading} characters.`;
  if (badText(p.tableLabel, L.tableLabel)) return `Pricing: the first column heading can be at most ${L.tableLabel} characters.`;
  if (p.layout !== undefined && !PRICING_LAYOUTS.includes(p.layout as PricingLayout)) return "Pricing: unknown layout.";
  if (p.cards !== undefined && !Array.isArray(p.cards)) return "Pricing: the cards couldn't be read.";
  const cards = (p.cards as unknown[] | undefined) ?? [];
  if (cards.length > L.cards) return `Pricing: at most ${L.cards} cards.`;
  const ids = new Set<string>();
  for (const [i, entry] of cards.entries()) {
    const where = `Pricing card ${i + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return `${where} couldn't be read.`;
    const c = entry as Record<string, unknown>;
    if (typeof c.id !== "string" || !ID.test(c.id) || ids.has(c.id)) return `${where} is missing its id. Reload the page and try again.`;
    ids.add(c.id);
    for (const [key, max, name] of [
      ["title", L.title, "title"], ["description", L.description, "description"], ["badge", L.badge, "badge"],
      ["price", L.price, "price"], ["priceTo", L.price, "price range"], ["period", L.price, "price period"],
      ["customPrice", L.price, "custom price"], ["previousPrice", L.price, "previous price"],
      ["billingLabel", L.caption, "billing label"], ["pricingCaption", L.caption, "pricing caption"],
      ["ctaLabel", L.ctaLabel, "button label"], ["ctaCaption", L.caption, "button caption"],
    ] as const) {
      if (badText(c[key], max)) return `${where}: the ${name} can be at most ${max} characters.`;
    }
    if (c.priceMode !== undefined && !PRICE_MODES.includes(c.priceMode as PriceMode)) return `${where}: unknown price display.`;
    if (c.ctaStyle !== undefined && !PRICING_CTA_STYLES.includes(c.ctaStyle as PricingCtaStyle)) return `${where}: unknown button style.`;
    if (c.featured !== undefined && typeof c.featured !== "boolean") return `${where}: the featured setting couldn't be read.`;
    if (c.action !== undefined && (!c.action || typeof c.action !== "object" || typeof (c.action as { type?: unknown }).type !== "string")) return `${where}: the button destination couldn't be read.`;
    if (c.items !== undefined && !Array.isArray(c.items)) return `${where}: the list couldn't be read.`;
    const items = (c.items as unknown[] | undefined) ?? [];
    if (items.length > L.items) return `${where}: at most ${L.items} list items.`;
    for (const it of items) {
      if (!it || typeof it !== "object") return `${where}: a list item couldn't be read.`;
      if (badText((it as Record<string, unknown>).text, L.item)) return `${where}: list items can be at most ${L.item} characters.`;
    }
  }
  if (p.rows !== undefined && !Array.isArray(p.rows)) return "Pricing: the comparison rows couldn't be read.";
  const rows = (p.rows as unknown[] | undefined) ?? [];
  if (rows.length > L.rows) return `Pricing: at most ${L.rows} comparison rows.`;
  const rowIds = new Set<string>();
  for (const [i, entry] of rows.entries()) {
    const where = `Comparison row ${i + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return `${where} couldn't be read.`;
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID.test(r.id) || rowIds.has(r.id)) return `${where} is missing its id. Reload the page and try again.`;
    rowIds.add(r.id);
    if (badText(r.label, L.rowLabel)) return `${where}: the label can be at most ${L.rowLabel} characters.`;
    if (r.cells !== undefined && !Array.isArray(r.cells)) return `${where}: its values couldn't be read.`;
    for (const cell of (r.cells as unknown[] | undefined) ?? []) {
      if (!cell || typeof cell !== "object") return `${where}: a value couldn't be read.`;
      const c = cell as Record<string, unknown>;
      if (typeof c.cardId !== "string") return `${where}: a value isn't linked to a card.`;
      if (c.kind !== undefined && !CELL_KINDS.includes(c.kind as CellKind)) return `${where}: unknown value type.`;
      if (badText(c.text, L.cell)) return `${where}: values can be at most ${L.cell} characters.`;
    }
  }
  if (p.pricingStyle !== undefined) {
    const s = p.pricingStyle;
    if (!s || typeof s !== "object" || Array.isArray(s)) return "Pricing: the card style couldn't be read.";
    const st = s as Record<string, unknown>;
    if (st.appearance !== undefined && !CARD_APPEARANCES.includes(st.appearance as CardAppearance)) return "Pricing: unknown card appearance.";
    for (const key of ["radius", "gap"] as const) if (st[key] !== undefined && (typeof st[key] !== "number" || !Number.isFinite(st[key]))) return "Pricing: a card style value couldn't be read.";
  }
  return null;
}

/** First malformed Pricing / Comparison block on the page; null when all are valid. */
export function findPricingProblem(data: unknown): string | null {
  let problem: string | null = null;
  const visit = (node: unknown) => {
    if (problem || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as { type?: unknown; props?: Record<string, unknown> };
    if (n.type === "PricingComparison" && n.props) {
      problem = pricingBlockProblem(n.props);
      return;
    }
    for (const value of Object.values(n.props ?? {})) if (Array.isArray(value)) visit(value);
  };
  const d = data as { content?: unknown; zones?: Record<string, unknown> } | null;
  visit(d?.content);
  if (d?.zones) Object.values(d.zones).forEach(visit);
  return problem;
}
