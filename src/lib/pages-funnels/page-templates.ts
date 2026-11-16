import type { Data as PuckData } from "@puckeditor/core";
import { remapCheckoutConfigIds, countCheckoutBlocks } from "@/lib/pages-funnels/checkout-block";
import { EMPTY_PAGE_SETTINGS, withPageSettings } from "@/lib/pages-funnels/page-settings";
import { collectBookingSlugs } from "@/lib/pages-funnels/booking-block";
import { collectActionTargets } from "@/lib/pages-funnels/puck/action";
import { collectPuckEmbedIds, collectPuckFeaturedOfferIds, collectPuckFormIds, collectPuckOfferSummaryIds } from "@/lib/pages-funnels/puck/resolve";
import { collectMediaVideoIds } from "@/lib/pages-funnels/puck/media-video";
import { withPopupContent } from "@/lib/pages-funnels/popup-content";
import type { PopupDefinitionMap } from "@/types/pages-funnels-popup";
import type { PageTemplateConnections } from "@/types/page-templates";
import type { PageDoc } from "@/types/pages-funnels";
import { toMillis } from "@/lib/pages-funnels/thumbnail";

/**
 * Saved Page Templates — pure, client-safe rules (2026-11-16).
 *
 * Owner decisions this file encodes:
 *  - A template keeps the COMPLETE design (content, layout, styles, responsive
 *    overrides, Popups, page type and goal, block settings and connections).
 *  - A page created from a template gets a fresh identity: its SEO title and
 *    description, noindex and tracking IDs are reset; the social image is kept
 *    as a design asset.
 *  - A page created from a template never inherits a payment connection: every
 *    explicit Checkout block becomes automatic, so it resolves through the new
 *    page's own funnel (or shows the usual "no Checkout yet" state).
 */

export const PAGE_TEMPLATE_LIMITS = { name: 60, description: 300, perWorkspace: 100 } as const;

export function templateNameProblem(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "Give the template a name.";
  if (name.trim().length > PAGE_TEMPLATE_LIMITS.name) return `Keep the name to ${PAGE_TEMPLATE_LIMITS.name} characters or fewer.`;
  return null;
}

export function templateDescriptionProblem(description: unknown): string | null {
  if (description == null || description === "") return null;
  if (typeof description !== "string") return "The description couldn't be read.";
  if (description.trim().length > PAGE_TEMPLATE_LIMITS.description) return `Keep the description to ${PAGE_TEMPLATE_LIMITS.description} characters or fewer.`;
  return null;
}

/** The design a NEW page gets from a template: same content, fresh identity, no inherited checkout. */
export function prepareNewPageFromTemplate(
  data: PuckData,
  popups: PopupDefinitionMap,
  socialImage: string,
): { data: PuckData; popups: PopupDefinitionMap; clearedCheckouts: number } {
  const page = remapCheckoutConfigIds(data, () => "");
  let cleared = page.changed;
  const nextPopups: PopupDefinitionMap = {};
  for (const [id, popup] of Object.entries(popups)) {
    const r = remapCheckoutConfigIds(popup.content, () => "");
    cleared += r.changed;
    nextPopups[id] = { ...popup, content: r.data };
  }
  const withFreshSettings = withPageSettings(page.data, { ...EMPTY_PAGE_SETTINGS, socialImage });
  return { data: withFreshSettings, popups: nextPopups, clearedCheckouts: cleared };
}

/** Live connections a design keeps (counted across the page and its Popups). */
export function summarizeTemplateConnections(data: PuckData, popups: PopupDefinitionMap): PageTemplateConnections {
  const all = withPopupContent(data, popups);
  const actions = collectActionTargets(all);
  const offers = new Set([...actions.offerIds, ...collectPuckFeaturedOfferIds(all), ...collectPuckOfferSummaryIds(all)]);
  const bookings = new Set([...collectBookingSlugs(all), ...actions.bookingSlugs]);
  return {
    forms: collectPuckFormIds(all).length,
    bookings: bookings.size,
    offers: offers.size,
    readingTools: collectPuckEmbedIds(all).length,
    pageLinks: actions.pageIds.length,
    videos: collectMediaVideoIds(data, popups).length,
    checkouts: countCheckoutBlocks(all),
    popups: Object.keys(popups).length,
  };
}

export const EMPTY_TEMPLATE_CONNECTIONS: PageTemplateConnections = { forms: 0, bookings: 0, offers: 0, readingTools: 0, pageLinks: 0, videos: 0, checkouts: 0, popups: 0 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One-line "what this page is still connected to" note shown after Create from
 * Template. Null when the design has no live connections worth mentioning.
 */
export function describeRetainedConnections(c: PageTemplateConnections): { kept: string | null; checkout: string | null } {
  const parts: string[] = [];
  if (c.forms) parts.push(plural(c.forms, "form", "forms"));
  if (c.bookings) parts.push(plural(c.bookings, "booking page", "booking pages"));
  if (c.offers) parts.push(plural(c.offers, "Offer", "Offers"));
  if (c.readingTools) parts.push(plural(c.readingTools, "Reading Tool", "Reading Tools"));
  if (c.pageLinks) parts.push(plural(c.pageLinks, "page link", "page links"));
  if (c.videos) parts.push(plural(c.videos, "video", "videos"));
  return {
    kept: parts.length ? `Still connected to the same ${parts.join(", ")} in this workspace — submissions and clicks work exactly as on the original.` : null,
    checkout: c.checkouts
      ? `${c.checkouts === 1 ? "The Checkout block isn't" : "Checkout blocks aren't"} connected to any Offer yet. Add this page to a funnel's Checkout step to start selling.`
      : null,
  };
}

/**
 * True when the page's automatic screenshot shows the design that Save as
 * Template saves (the current draft): a draft capture of this draft version,
 * or a published capture while the draft has no unpublished changes. Anything
 * else is out of date and must not be shown as "this design".
 */
export function thumbnailShowsCurrentDesign(page: Pick<PageDoc, "thumbnail" | "status" | "puckDraftUpdatedAt" | "puckPublishedAt" | "puckPublishedData">): boolean {
  const t = page.thumbnail;
  if (!t?.url) return false;
  const draft = toMillis(page.puckDraftUpdatedAt);
  if (t.variant === "draft") return draft !== null && t.sourceVersion >= draft;
  const published = toMillis(page.puckPublishedAt);
  return page.status === "published" && !!page.puckPublishedData && published !== null && t.sourceVersion >= published && (draft === null || draft <= published);
}
