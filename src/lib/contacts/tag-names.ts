/**
 * Contacts & Tags (2026-11) — the one set of tag-name rules, shared by the
 * browser (validation as you type) and the server (registry + tag writer).
 * Pure: no Firestore, no React.
 *
 * Contacts keep their tags as plain strings (`contact.tags: string[]`), so
 * segmentation, Broadcasts, saved Contact Lists and the public API are
 * unchanged. The central registry (`subAccounts/{id}/contactTags`) holds
 * one definition per tag, and these helpers decide when two spellings are
 * "the same tag".
 */

/** Longest tag name a creator can type. Older (legacy) names may be longer. */
export const MAX_TAG_NAME_LENGTH = 50;

/** Trim and collapse runs of whitespace — the stored display form. */
export function cleanTagName(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Uniqueness key: the cleaned name, lower-cased. "VIP Customer",
 * "vip customer" and "VIP  Customer" share one key, so a workspace can't
 * end up with all three by accident.
 */
export function tagKey(raw: string): string {
  return cleanTagName(raw).toLowerCase();
}

/**
 * Looser key used ONLY to suggest possible duplicates for review — also
 * ignores hyphens, underscores, dots and spaces ("vip-customer" ≈
 * "VIP Customer"). Never used to merge anything automatically.
 */
export function looseTagKey(raw: string): string {
  return tagKey(raw).replace(/[\s\-_.]+/g, "");
}

export type TagNameCheck = { ok: true; name: string } | { ok: false; error: string };

/** Validate a name a creator typed (create / rename). */
export function validateTagName(raw: unknown): TagNameCheck {
  if (typeof raw !== "string") return { ok: false, error: "Enter a tag name." };
  const name = cleanTagName(raw);
  if (!name) return { ok: false, error: "Enter a tag name." };
  if (name.length > MAX_TAG_NAME_LENGTH) {
    return { ok: false, error: `Tag names can be up to ${MAX_TAG_NAME_LENGTH} characters.` };
  }
  if (name.includes(",")) {
    return { ok: false, error: "Tag names can't contain commas." };
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "Tag names can't contain hidden characters." };
  }
  return { ok: true, name };
}

/** One logical tag? (Case- and whitespace-insensitive; the CRM-wide rule.) */
export function sameTag(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ka = tagKey(a);
  return !!ka && ka === tagKey(b);
}

/** Does this tag list contain `name` (any capitalization / spacing)? */
export function hasTag(tags: unknown, name: unknown): boolean {
  if (!Array.isArray(tags) || typeof name !== "string") return false;
  const k = tagKey(name);
  return !!k && tags.some((t) => typeof t === "string" && tagKey(t) === k);
}

/** One entry per logical tag, keeping the first spelling and the order. */
export function dedupeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const k = tagKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Can this (possibly legacy) name be held in the registry? */
export function isRegistrableTagName(raw: string): boolean {
  return validateTagName(raw).ok;
}

/** Where a tag change came from — shown in Contact Activity. */
export type TagChangeSource =
  | "manual"
  | "contact_create"
  | "import"
  | "merge"
  | "form"
  | "checkout"
  | "funnel_offer"
  | "workflow"
  | "webinar"
  | "get_leads"
  | "energetic_decoder"
  | "reading_tool"
  | "api"
  | "ai_assistant"
  | "integration";

export const TAG_SOURCE_LABELS: Record<TagChangeSource, string> = {
  manual: "Manual edit",
  contact_create: "New contact",
  import: "Import",
  merge: "Contact merge",
  form: "Form",
  checkout: "Checkout",
  funnel_offer: "Funnel offer",
  workflow: "Workflow",
  webinar: "Webinar",
  get_leads: "Get Leads",
  energetic_decoder: "Energetic Decoder",
  reading_tool: "Reading Tool",
  api: "API",
  ai_assistant: "AI assistant",
  integration: "Integration",
};

/** Contacts list link with one tag filter applied (see the Contacts page). */
export function contactsWithTagHref(subAccountId: string, tagName: string): string {
  return `/sa/${subAccountId}/contacts?tag=${encodeURIComponent(tagName)}`;
}
