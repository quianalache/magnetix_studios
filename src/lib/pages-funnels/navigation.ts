import type { PageAction } from "@/types/pages-funnels-puck";
import { normalizeStoredAction } from "@/lib/pages-funnels/puck/action";
import { normalizeHex } from "@/lib/brand/brand-colors";

/**
 * Navigation block (Wave 2B-1) — the pure model shared by the builder, the
 * save boundary and the renderer. A Navigation is ONE native block: a logo,
 * an ordered list of top-level items (plain links or one-level dropdowns),
 * an optional CTA button, and a responsive mobile menu.
 *
 * Destinations are NOT a second link system: every link stores the same
 * persisted `PageAction` Button/Image use, and renders through the same
 * `resolveActionLink` (page → same-tenant published URL, URL → safe-scheme
 * check, scroll → this page's Section id). Navigation only narrows which
 * actions are OFFERED:
 *   menu links — Go to page · Go to URL · Scroll to section
 *   CTA        — the same, plus Go to Offer (checkout)
 * Call / Email / SMS / Popup actions are never offered here, and a stored
 * one reads as "no link" (never executed).
 *
 * Parsing has two modes, like Popup triggers:
 *   parseNavigation      — STRICT, at the save boundary: a clear error
 *   normalizeNavigation  — LENIENT, at render: malformed parts are dropped
 *                          or capped so a public page never crashes.
 * Stale targets (a deleted page or Section) keep their stored id — the
 * builder flags them and visitors get an inert label; never retargeted.
 */

export const NAV_MAX_ITEMS = 12;
export const NAV_MAX_CHILDREN = 12;
export const NAV_LABEL_MAX = 60;
export const NAV_CTA_LABEL_MAX = 40;
export const NAV_ALT_MAX = 150;
export const NAV_ARIA_LABEL_MAX = 60;
export const NAV_LOGO_HEIGHT_MIN = 20;
export const NAV_LOGO_HEIGHT_MAX = 120;
export const NAV_LOGO_HEIGHT_DEFAULT = 40;
export const NAV_PADDING_MIN = 0;
export const NAV_PADDING_MAX = 64;
export const NAV_PADDING_DEFAULT = 16;
/** Starting hex when a color is switched to Custom with no Brand colors saved. */
export const NAV_CUSTOM_FALLBACK = "#1F1B3A";

export type NavLinkActionType = "none" | "url" | "page" | "scroll";
export type NavCtaActionType = NavLinkActionType | "purchase";
export const NAV_LINK_ACTION_TYPES: readonly NavLinkActionType[] = ["none", "page", "url", "scroll"];
export const NAV_CTA_ACTION_TYPES: readonly NavCtaActionType[] = ["none", "page", "url", "scroll", "purchase"];

export interface NavigationLink {
  id: string;
  label: string;
  action: PageAction;
}

export type NavigationItem =
  | (NavigationLink & { kind: "link" })
  | { id: string; kind: "dropdown"; label: string; children: NavigationLink[] };

export interface NavigationLogo {
  src: string;
  alt: string;
  height: number;
}

export interface NavigationCta {
  enabled: boolean;
  label: string;
  action: PageAction;
  variant: "solid" | "outline";
}

/** A color choice — the page's default, a saved Brand color (by stable id, resolved live), or a one-off hex. */
export interface NavColorSetting {
  source: "default" | "brand" | "custom";
  brandColorId?: string;
  custom?: string;
}

export interface NavigationStyle {
  width: "contained" | "wide" | "full";
  menuAlign: "left" | "center" | "right";
  paddingY: number;
  divider: boolean;
  background: NavColorSetting;
  linkColor: NavColorSetting;
  ctaColor: NavColorSetting;
}

export interface NavigationMobile {
  /** Below which width the menu collapses into the hamburger. */
  collapseAt: "mobile" | "tablet";
}

export interface NavigationValue {
  ariaLabel: string;
  logo: NavigationLogo;
  items: NavigationItem[];
  cta: NavigationCta;
  mobile: NavigationMobile;
  navStyle: NavigationStyle;
}

/** Pixel widths the collapse choice maps to — the builder's own System A breakpoints (style.ts). */
export const NAV_COLLAPSE_MAX_WIDTH: Record<NavigationMobile["collapseAt"], number> = { mobile: 767, tablet: 1279 };
export const NAV_CONTENT_MAX_WIDTH: Record<NavigationStyle["width"], string> = { contained: "1024px", wide: "1280px", full: "none" };

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function newNavigationId(prefix = "nav"): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

export const DEFAULT_NAV_COLOR: NavColorSetting = { source: "default" };

export const DEFAULT_NAVIGATION_STYLE: NavigationStyle = {
  width: "wide",
  menuAlign: "right",
  paddingY: NAV_PADDING_DEFAULT,
  divider: true,
  background: DEFAULT_NAV_COLOR,
  linkColor: DEFAULT_NAV_COLOR,
  ctaColor: DEFAULT_NAV_COLOR,
};

export const DEFAULT_NAVIGATION_CTA: NavigationCta = { enabled: false, label: "Get started", action: { type: "none" }, variant: "solid" };

/** What a freshly inserted Navigation shows: placeholder items with no destinations yet (inert until set). */
export function defaultNavigationItems(): NavigationItem[] {
  return [
    { id: "nav-home", kind: "link", label: "Home", action: { type: "none" } },
    { id: "nav-about", kind: "link", label: "About", action: { type: "none" } },
    { id: "nav-contact", kind: "link", label: "Contact", action: { type: "none" } },
  ];
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The stored action, narrowed to what this slot offers; anything else reads as "no link". */
export function navAction(raw: unknown, allowed: readonly string[]): PageAction {
  const action = normalizeStoredAction(raw);
  return allowed.includes(action.type) ? action : { type: "none" };
}

export function normalizeNavColor(raw: unknown): NavColorSetting {
  if (!isObject(raw)) return DEFAULT_NAV_COLOR;
  if (raw.source === "brand") return typeof raw.brandColorId === "string" && raw.brandColorId ? { source: "brand", brandColorId: raw.brandColorId } : { source: "brand" };
  if (raw.source === "custom") {
    const custom = normalizeHex(raw.custom);
    return custom ? { source: "custom", custom } : DEFAULT_NAV_COLOR;
  }
  return DEFAULT_NAV_COLOR;
}

/**
 * The hex a color setting draws, or null for the page default. A Brand pick
 * whose color was removed falls back to the default — never another color.
 */
export function resolveNavColor(setting: NavColorSetting, brandKit?: readonly { id: string; hex: string }[]): string | null {
  if (setting.source === "custom") return setting.custom ?? null;
  if (setting.source === "brand") {
    const kit = brandKit ?? [];
    const hit = setting.brandColorId ? kit.find((c) => c.id === setting.brandColorId) : kit[0];
    return hit ? normalizeHex(hit.hex) : null;
  }
  return null;
}

function normalizeLink(raw: unknown, index: number, prefix: string): NavigationLink | null {
  if (!isObject(raw)) return null;
  const id = ID.test(str(raw.id)) ? str(raw.id) : `${prefix}-${index}`;
  return { id, label: str(raw.label).trim().slice(0, NAV_LABEL_MAX), action: navAction(raw.action, NAV_LINK_ACTION_TYPES) };
}

/** Lenient: never throws. Drops malformed items, caps counts and lengths, flattens anything nested past one level. */
export function normalizeNavigationItems(raw: unknown): NavigationItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NavigationItem[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.slice(0, NAV_MAX_ITEMS).entries()) {
    if (!isObject(entry)) continue;
    let id = ID.test(str(entry.id)) ? str(entry.id) : `item-${index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    const label = str(entry.label).trim().slice(0, NAV_LABEL_MAX);
    if (entry.kind === "dropdown") {
      const children = (Array.isArray(entry.children) ? entry.children : [])
        .slice(0, NAV_MAX_CHILDREN)
        .map((child, i) => normalizeLink(child, i, `${id}-child`))
        .filter((c): c is NavigationLink => !!c);
      out.push({ id, kind: "dropdown", label, children });
    } else {
      out.push({ id, kind: "link", label, action: navAction(entry.action, NAV_LINK_ACTION_TYPES) });
    }
  }
  return out;
}

export function normalizeNavigationLogo(raw: unknown): NavigationLogo {
  const v = isObject(raw) ? raw : {};
  return {
    src: str(v.src).trim(),
    alt: str(v.alt).slice(0, NAV_ALT_MAX),
    height: clampNumber(v.height, NAV_LOGO_HEIGHT_MIN, NAV_LOGO_HEIGHT_MAX, NAV_LOGO_HEIGHT_DEFAULT),
  };
}

export function normalizeNavigationCta(raw: unknown): NavigationCta {
  const v = isObject(raw) ? raw : {};
  return {
    enabled: v.enabled === true,
    label: str(v.label).trim().slice(0, NAV_CTA_LABEL_MAX),
    action: navAction(v.action, NAV_CTA_ACTION_TYPES),
    variant: v.variant === "outline" ? "outline" : "solid",
  };
}

export function normalizeNavigationStyle(raw: unknown): NavigationStyle {
  const v = isObject(raw) ? raw : {};
  return {
    width: v.width === "contained" || v.width === "full" ? v.width : "wide",
    menuAlign: v.menuAlign === "left" || v.menuAlign === "center" ? v.menuAlign : "right",
    paddingY: clampNumber(v.paddingY, NAV_PADDING_MIN, NAV_PADDING_MAX, NAV_PADDING_DEFAULT),
    divider: v.divider !== false,
    background: normalizeNavColor(v.background),
    linkColor: normalizeNavColor(v.linkColor),
    ctaColor: normalizeNavColor(v.ctaColor),
  };
}

export function normalizeNavigationMobile(raw: unknown): NavigationMobile {
  return { collapseAt: isObject(raw) && raw.collapseAt === "tablet" ? "tablet" : "mobile" };
}

export function normalizeNavigation(props: Record<string, unknown> | null | undefined): NavigationValue {
  const p = props ?? {};
  return {
    ariaLabel: str(p.ariaLabel).trim().slice(0, NAV_ARIA_LABEL_MAX) || "Main",
    logo: normalizeNavigationLogo(p.logo),
    items: normalizeNavigationItems(p.items),
    cta: normalizeNavigationCta(p.cta),
    mobile: normalizeNavigationMobile(p.mobile),
    navStyle: normalizeNavigationStyle(p.navStyle),
  };
}

// ---------- Strict parse (the save boundary) ----------

export type NavigationParseResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): NavigationParseResult => ({ ok: false, error });

function checkAction(raw: unknown, allowed: readonly string[], where: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (!isObject(raw) || typeof raw.type !== "string") return `${where} has a destination that couldn't be read.`;
  if (!allowed.includes(raw.type)) return `${where} can only link to a page, a web address or a section${allowed.includes("purchase") ? " (or an Offer)" : ""}.`;
  for (const key of ["url", "pageId", "offerId", "targetElementId"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") return `${where} has a destination that couldn't be read.`;
  }
  return null;
}

function checkLink(raw: unknown, where: string, ids: Set<string>): string | null {
  if (!isObject(raw)) return `${where} couldn't be read.`;
  const id = str(raw.id);
  if (!ID.test(id)) return `${where} is missing its id. Reload the page and try again.`;
  if (ids.has(id)) return `${where} has a duplicate id. Reload the page and try again.`;
  ids.add(id);
  if (raw.label !== undefined && typeof raw.label !== "string") return `${where} has a label that couldn't be read.`;
  if (str(raw.label).trim().length > NAV_LABEL_MAX) return `${where}: labels can be at most ${NAV_LABEL_MAX} characters.`;
  return null;
}

/** STRICT: one Navigation block's props, as saved. Returns the first problem in plain language. */
export function parseNavigation(props: Record<string, unknown>): NavigationParseResult {
  const items = props.items;
  if (items !== undefined && !Array.isArray(items)) return fail("The menu items couldn't be read.");
  const list = (items as unknown[] | undefined) ?? [];
  if (list.length > NAV_MAX_ITEMS) return fail(`A navigation menu can have at most ${NAV_MAX_ITEMS} items.`);
  const ids = new Set<string>();
  for (const [index, entry] of list.entries()) {
    const where = `Menu item ${index + 1}`;
    const linkProblem = checkLink(entry, where, ids);
    if (linkProblem) return fail(linkProblem);
    const item = entry as Record<string, unknown>;
    if (item.kind !== "link" && item.kind !== "dropdown") return fail(`${where} must be a link or a dropdown.`);
    if (item.kind === "link") {
      if (item.children !== undefined) return fail(`${where} is a link, so it can't have sub-items.`);
      const problem = checkAction(item.action, NAV_LINK_ACTION_TYPES, where);
      if (problem) return fail(problem);
      continue;
    }
    if (!Array.isArray(item.children)) return fail(`${where}'s sub-items couldn't be read.`);
    if (item.children.length > NAV_MAX_CHILDREN) return fail(`A dropdown can have at most ${NAV_MAX_CHILDREN} sub-items.`);
    for (const [ci, child] of item.children.entries()) {
      const childWhere = `${where}, sub-item ${ci + 1}`;
      const problem = checkLink(child, childWhere, ids);
      if (problem) return fail(problem);
      const c = child as Record<string, unknown>;
      if (c.kind === "dropdown" || c.children !== undefined) return fail("Dropdowns can only go one level deep — a sub-item can't have its own sub-items.");
      const actionProblem = checkAction(c.action, NAV_LINK_ACTION_TYPES, childWhere);
      if (actionProblem) return fail(actionProblem);
    }
  }
  const cta = props.cta;
  if (cta !== undefined) {
    if (!isObject(cta)) return fail("The menu button couldn't be read.");
    if (cta.enabled !== undefined && typeof cta.enabled !== "boolean") return fail("The menu button couldn't be read.");
    if (str(cta.label).trim().length > NAV_CTA_LABEL_MAX) return fail(`The menu button label can be at most ${NAV_CTA_LABEL_MAX} characters.`);
    const problem = checkAction(cta.action, NAV_CTA_ACTION_TYPES, "The menu button");
    if (problem) return fail(problem);
  }
  const logo = props.logo;
  if (logo !== undefined) {
    if (!isObject(logo)) return fail("The logo couldn't be read.");
    if (logo.src !== undefined && typeof logo.src !== "string") return fail("The logo couldn't be read.");
    if (str(logo.alt).length > NAV_ALT_MAX) return fail(`Logo alt text can be at most ${NAV_ALT_MAX} characters.`);
  }
  if (str(props.ariaLabel).trim().length > NAV_ARIA_LABEL_MAX) return fail(`The menu name can be at most ${NAV_ARIA_LABEL_MAX} characters.`);
  return { ok: true };
}

/** Every Navigation block in a Puck data tree (root content + zones), for the save boundary. */
export function findNavigationProblem(data: unknown): string | null {
  let problem: string | null = null;
  let count = 0;
  const visit = (node: unknown) => {
    if (problem || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const n = node as { type?: unknown; props?: Record<string, unknown> };
    if (n.type === "Navigation" && n.props) {
      count += 1;
      const result = parseNavigation(n.props);
      if (!result.ok) problem = count > 1 ? `Navigation ${count}: ${result.error}` : result.error;
      return;
    }
    for (const value of Object.values(n.props ?? {})) if (Array.isArray(value)) visit(value);
  };
  const d = data as { content?: unknown; zones?: Record<string, unknown> } | null;
  visit(d?.content);
  if (d?.zones) Object.values(d.zones).forEach(visit);
  return problem;
}
