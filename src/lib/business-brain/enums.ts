/**
 * Fixed vocabularies used inside Business Brain's list sections — verbatim
 * from migration spec §4.4/§4.5 (live-audited, dossier-confirmed).
 */

export const FRAMEWORK_TYPES = [
  "Signature Method",
  "Teaching Framework",
  "Content Framework",
  "Client Process",
  "Step-by-Step Method",
  "Decision-Making Framework",
  "Mindset Framework",
  "Offer Framework",
  "Messaging Framework",
  "Visibility Framework",
  "Creative Process",
  "Other",
] as const;

/**
 * Story Type options, per migration spec §4.5 — shown as the canonical
 * labels. The real migrated story's actual stored value is the single
 * lowercase word `"identity"` (not a full kebab-case slug of "Identity
 * Shift"), so the exact slug convention for the other 8 labels is NOT
 * independently confirmed anywhere in the three source-of-truth inputs.
 * Rather than invent an unverified slug scheme, this list stores the
 * human-readable label as the value itself for anything newly picked in
 * this UI; an existing record's raw stored value (e.g. "identity") is
 * always preserved and displayed as-is even when it doesn't match one of
 * these labels exactly — see `storyTypeOptions()`.
 */
export const STORY_TYPE_LABELS = [
  "Origin Story",
  "Client Transformation",
  "Personal Lesson",
  "Behind-the-Scenes",
  "Mistake / Lesson",
  "Hot Take",
  "Proof Story",
  "Identity Shift",
  "Other",
] as const;

/** Known display label for a real stored value, where confirmed. */
const KNOWN_VALUE_LABELS: Record<string, string> = {
  identity: "Identity Shift",
};

export function storyTypeLabel(value: string | undefined): string {
  if (!value) return "";
  return KNOWN_VALUE_LABELS[value] ?? value;
}

/** Dropdown options for a Story Type select — the 9 canonical labels,
 *  plus the record's own current raw value first if it doesn't already
 *  match one of them (so an existing value like "identity" never gets
 *  silently coerced into a different string just by opening the form). */
export function storyTypeOptions(currentValue: string | undefined): string[] {
  const known = new Set<string>(STORY_TYPE_LABELS);
  if (currentValue && !known.has(currentValue)) {
    return [currentValue, ...STORY_TYPE_LABELS];
  }
  return [...STORY_TYPE_LABELS];
}
