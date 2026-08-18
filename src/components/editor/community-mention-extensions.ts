import { Mention } from "@tiptap/extension-mention";
import { buildMentionSuggestion, type MentionSuggestionItem } from "./mention-suggestion";

/**
 * Two node types built on the SAME `@tiptap/extension-mention` package and
 * the SAME suggestion-dropdown architecture (mention-suggestion.ts) — the
 * Phase D instruction not to build two independent autocomplete systems.
 * They differ only in node name (`mention` vs `channelRef`) and trigger
 * char, which is exactly what `Mention.extend({ name })` exists for.
 *
 * Rendered HTML (the package's own default `renderHTML`, unmodified):
 *   <span data-type="mention" data-id="{memberId}" data-label="{name}">@{name}</span>
 *   <span data-type="channelRef" data-id="{category}" data-label="{category}">#{category}</span>
 * `data-id`/`data-label` are the same value for channel refs — categories
 * have no separate stable id in the current data model (confirmed: still
 * a plain `string[]` on CommunityGroup — see the Phase D report for the
 * rename-resilience implication). `id` is what's stored as the stable
 * reference; renaming a MEMBER doesn't break a mention (id is the member
 * id, not their name) — renaming a CATEGORY does break existing
 * #references, which is a real, disclosed limitation, not an oversight.
 *
 * Both allowlisted in the sanitizer (post-html.ts) by `data-type` value —
 * anything else on a `span` is stripped.
 */
export const CommunityMention = Mention.extend({ name: "mention" });
export const CommunityChannelRef = Mention.extend({ name: "channelRef" });

export function mentionSuggestionConfig(
  fetchItems: (query: string) => Promise<MentionSuggestionItem[]>,
) {
  return buildMentionSuggestion({ char: "@", fetchItems });
}

export function channelRefSuggestionConfig(
  fetchItems: (query: string) => Promise<MentionSuggestionItem[]>,
) {
  return buildMentionSuggestion({ char: "#", fetchItems });
}
