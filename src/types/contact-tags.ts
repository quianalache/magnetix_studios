/**
 * Contacts & Tags (2026-11) — central tag registry + usage discovery types.
 *
 * Storage (server-only, default-deny rules — read/written through
 * `/api/sub-accounts/[id]/contact-tags/*` with the Admin SDK):
 *   subAccounts/{id}/contactTags/{tagId}      one definition per tag
 *   subAccounts/{id}/contactTagKeys/{keyHash} uniqueness index: tag key → tagId
 *   subAccounts/{id}/contactTagOps/{opId}     rename / merge / delete progress
 *
 * Contacts keep `tags: string[]` (display names), so every existing reader
 * (segmentation, Broadcasts, saved lists, public API) is unchanged.
 */

export interface ContactTagDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  /** Display name — exactly the string stored on contacts. */
  name: string;
  /** tagKey(name): case- and whitespace-insensitive uniqueness key. */
  key: string;
  /** Keys of earlier names (renames / merges). Writers that still send an
   *  old name are mapped to this tag instead of recreating the old one. */
  aliases: string[];
  createdAt: number;
  updatedAt: number;
  createdByUid: string | null;
  /** How the definition was first created. */
  createdVia: string;
}

/** Index doc: which tag owns a key, and whether it's the tag's current name. */
export interface ContactTagKeyDoc {
  tagId: string;
  kind: "primary" | "alias";
}

/** Places a tag can be referenced from (configuration, not contacts). */
export type TagUsageType =
  | "workflow"
  | "form"
  | "checkout"
  | "reading_tool"
  | "broadcast_draft"
  | "contact_list"
  | "funnel_step";

/**
 * What a reference does with the tag:
 * - `list`: a list of tags an item applies (form auto-tags, checkout tags,
 *   Reading Tool tags, Create Contact tags). Removing the tag from the list
 *   only stops that item applying it.
 * - `condition`: a filter / branch / audience rule that tests the tag.
 * - `action`: a workflow Add Tag / Remove Tag step.
 */
export type TagReferenceKind = "list" | "condition" | "action";

export interface TagReference {
  type: TagUsageType;
  id: string;
  name: string;
  /** Plain-language places the tag appears, e.g. "Trigger condition". */
  contexts: string[];
  kinds: TagReferenceKind[];
  /** Existing screen for this item, or null when none exists. */
  href: string | null;
  /** Extra state, e.g. "Active" / "Draft" for workflows. */
  status?: string | null;
}

export const TAG_USAGE_TYPES: TagUsageType[] = [
  "workflow",
  "form",
  "checkout",
  "reading_tool",
  "broadcast_draft",
  "contact_list",
  "funnel_step",
];

export const TAG_USAGE_LABELS: Record<TagUsageType, { one: string; many: string }> = {
  workflow: { one: "workflow", many: "workflows" },
  form: { one: "form", many: "forms" },
  checkout: { one: "checkout", many: "checkouts" },
  reading_tool: { one: "Reading Tool", many: "Reading Tools" },
  broadcast_draft: { one: "broadcast draft", many: "broadcast drafts" },
  contact_list: { one: "contact list", many: "contact lists" },
  funnel_step: { one: "funnel step", many: "funnel steps" },
};

export const TAG_USAGE_SECTION_LABELS: Record<TagUsageType, string> = {
  workflow: "Workflows",
  form: "Forms",
  checkout: "Checkout configurations",
  reading_tool: "Reading Tools",
  broadcast_draft: "Broadcast drafts",
  contact_list: "Contact lists",
  funnel_step: "Funnel Upsell / Downsell steps",
};

/** One row of the Tags library. */
export interface TagSummary {
  /** Registry id, or `u_…` for a name found on contacts/settings that has
   *  no registry entry yet (registered automatically on first change). */
  id: string;
  name: string;
  registered: boolean;
  contactCount: number;
  /** Configuration references (never contacts). */
  usageCount: number;
  usageByType: Partial<Record<TagUsageType, number>>;
  updatedAt: number | null;
  /** Legacy name the registry can't hold (too long / has a comma). */
  legacyOnly: boolean;
  /** Other spellings of the same tag found on contacts (e.g. "vip" for
   *  "VIP"), with their contact counts. Shown for review; never merged
   *  without the creator's say-so. */
  variants: Array<{ name: string; contactCount: number }>;
}

export interface TagListResponse {
  tags: TagSummary[];
  /** Caller may rename / merge / delete (workspace admins). */
  canManage: boolean;
  /** Number of possible-duplicate groups awaiting review. */
  duplicateGroupCount: number;
  /** Contact counts cover only the caller's territories. */
  countsScoped: boolean;
}

export interface TagUsageSection {
  type: TagUsageType;
  total: number;
  items: TagReference[];
  /** Offset for the next page, or null when every item is listed. */
  nextOffset: number | null;
}

export interface TagDetailResponse {
  tag: TagSummary;
  sections: TagUsageSection[];
  canManage: boolean;
  /** Rules (conditions, Add / Remove Tag steps, tag audiences) a delete
   *  keeps but marks "needs attention" — they fail closed until repaired. */
  attentionReferenceCount: number;
}

export interface TagDuplicateGroup {
  key: string;
  tags: TagSummary[];
}

export interface TagOperationDoc {
  id: string;
  subAccountId: string;
  type: "rename" | "merge" | "delete";
  status: "running" | "completed" | "failed";
  /** Display names involved (source → target). */
  fromNames: string[];
  toName: string | null;
  tagId: string;
  targetTagId: string | null;
  steps: Record<string, "done">;
  contactsUpdated: number;
  referencesUpdated: number;
  error: string | null;
  startedByUid: string;
  startedAt: number;
  updatedAt: number;
}
