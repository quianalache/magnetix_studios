import type { PageAction, ResolvedActionTargets } from "@/types/pages-funnels-puck";

/**
 * Button / Image actions (master spec §8's Shared Action system; native
 * actions shipped 2026-10-26). Pure — shared by the builder, Preview and the
 * server renderer.
 *
 * LIVE actions:
 *   url      — any http(s) / mailto / tel / relative / #anchor URL (unsafe
 *              schemes such as javascript: never render)
 *   page     — another Pages & Funnels page in this sub-account, by id
 *   purchase — "Go to Offer": an Offer in this sub-account, by id
 *   scroll   — a Section on this page, by its stable Puck id
 *   call / email / sms — validated tel: / mailto: / sms: links
 * Object-bound targets (page, purchase) resolve ONLY through
 * `ResolvedActionTargets`, which the server fills for this page's own
 * sub-account — a missing, unpublished or other-business target renders as a
 * button with no link instead of a broken one.
 *
 * Reserved (in the type, not exposed or rendered): funnel steps, popups,
 * show/hide, submit form, download, upsell accept/decline. Each is still an
 * explicit case below so adding a variant forces a decision here.
 */

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "sms"]);

/** True for http(s)/mailto/tel/sms URLs and scheme-less relative URLs; false for javascript:, data:, etc. */
export function isSafeActionUrl(raw: string): boolean {
  const value = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!value) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  return !scheme || SAFE_SCHEMES.has(scheme);
}

/** Normalizes a phone number to `+digits` / `digits`, or null when it isn't a plausible number. */
export function normalizePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function isValidEmailAddress(raw: string): boolean {
  return /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/.test(raw.trim());
}

/** A Section id is used verbatim as an `#anchor`; Puck ids are url-safe, anything else is refused. */
export function isSafeSectionId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

export interface ResolvedActionLink {
  href: string | null;
  newTab: boolean;
}

/**
 * The link a Button/Image should render. `editing` → never a link (the
 * builder must not navigate away). `resolved` comes from the page's metadata;
 * without it, object-bound actions don't render a link.
 */
export function resolveActionLink(
  action: PageAction | undefined | null,
  opts: { resolved?: ResolvedActionTargets; editing?: boolean } = {},
): ResolvedActionLink {
  const none: ResolvedActionLink = { href: null, newTab: false };
  if (!action || opts.editing) return none;
  switch (action.type) {
    case "url": {
      const url = (action.url ?? "").trim();
      return url && isSafeActionUrl(url) ? { href: url, newTab: !!action.openInNewTab } : none;
    }
    case "page": {
      const href = opts.resolved?.pages[action.pageId]?.href;
      return href ? { href, newTab: !!action.openInNewTab } : none;
    }
    case "purchase": {
      const href = opts.resolved?.offers[action.offerId]?.href;
      return href ? { href, newTab: false } : none;
    }
    case "scroll": {
      const id = action.targetElementId ?? "";
      if (!isSafeSectionId(id)) return none;
      // When the page's section list is known, only real sections link.
      if (opts.resolved && !opts.resolved.sectionIds.includes(id)) return none;
      return { href: `#${id}`, newTab: false };
    }
    case "call": {
      const phone = normalizePhoneNumber(action.phoneNumber ?? "");
      return phone ? { href: `tel:${phone}`, newTab: false } : none;
    }
    case "sms": {
      const phone = normalizePhoneNumber(action.phoneNumber ?? "");
      return phone ? { href: `sms:${phone}`, newTab: false } : none;
    }
    case "email": {
      const email = (action.emailAddress ?? "").trim();
      if (!isValidEmailAddress(email)) return none;
      const subject = action.subject?.trim();
      return { href: `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`, newTab: false };
    }
    // Reserved — not exposed in the builder, never rendered as a link.
    case "none":
    case "next_funnel_step":
    case "selected_funnel_step":
    case "open_popup":
    case "close_popup":
    case "show_hide":
    case "submit_form":
    case "download":
    case "accept_upsell":
    case "decline_continue":
      return none;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** Back-compat: the plain href (no metadata) — URL actions only, plus call/email/sms/scroll. */
export function resolveActionHref(action: PageAction | undefined | null): string | undefined {
  return resolveActionLink(action).href ?? undefined;
}

/** Back-compat: whether a plain URL action opens in a new tab. */
export function actionOpensNewTab(action: PageAction | undefined | null): boolean {
  return !!action && (action.type === "url" || action.type === "page") && !!action.openInNewTab;
}

/** Everything a page's actions point at, plus its Section ids (the valid scroll targets). */
export function collectActionTargets(data: unknown): { pageIds: string[]; offerIds: string[]; sectionIds: string[] } {
  const pageIds = new Set<string>();
  const offerIds = new Set<string>();
  const sectionIds = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const n = node as { type?: unknown; props?: Record<string, unknown> };
    const props = n.props ?? {};
    if ((n.type === "Section" || n.type === "Hero") && typeof props.id === "string") sectionIds.add(props.id);
    const action = props.action as PageAction | undefined;
    if (action && typeof action === "object") {
      if (action.type === "page" && typeof action.pageId === "string" && action.pageId) pageIds.add(action.pageId);
      if (action.type === "purchase" && typeof action.offerId === "string" && action.offerId) offerIds.add(action.offerId);
    }
    for (const value of Object.values(props)) if (Array.isArray(value)) value.forEach(visit);
  };
  const d = data as { content?: unknown; zones?: Record<string, unknown> } | null;
  visit(d?.content);
  if (d?.zones) Object.values(d.zones).forEach(visit);
  return { pageIds: [...pageIds], offerIds: [...offerIds], sectionIds: [...sectionIds] };
}

/**
 * Reads a stored Button/Image `action` prop into a `PageAction`. Accepts the
 * legacy flat object-field shape (`{ type, url, openInNewTab }`, still on
 * every existing page and in AI-generated pages) and every new action, so no
 * page needs migrating. Unknown or reserved types read as "none".
 */
export function normalizeStoredAction(raw: unknown): PageAction {
  if (!raw || typeof raw !== "object") return { type: "none" };
  const a = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (a.type) {
    case "url":
      return { type: "url", url: str(a.url), openInNewTab: a.openInNewTab === true };
    case "page":
      return { type: "page", pageId: str(a.pageId), openInNewTab: a.openInNewTab === true };
    case "purchase":
      return { type: "purchase", offerId: str(a.offerId) };
    case "scroll":
      return { type: "scroll", targetElementId: str(a.targetElementId) };
    case "call":
      return { type: "call", phoneNumber: str(a.phoneNumber) };
    case "sms":
      return { type: "sms", phoneNumber: str(a.phoneNumber) };
    case "email":
      return { type: "email", emailAddress: str(a.emailAddress), ...(str(a.subject) ? { subject: str(a.subject) } : {}) };
    default:
      return { type: "none" };
  }
}
