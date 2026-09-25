/**
 * Contact name compatibility helpers (Contacts redesign, 2026-09-25).
 *
 * `Contact.name` stays the canonical full name every existing consumer reads.
 * `firstName` / `lastName` are optional structured parts layered on top:
 *
 *   - Writers compose `name` from the parts ONLY when no explicit name was
 *     given (`resolveNameForWrite`).
 *   - Nothing ever splits an existing `name` into parts automatically —
 *     "Mary Ann van der Berg" has no safe split. `suggestNameSplit` exists
 *     for an explicit, staff-reviewed "Fill from full name" action only.
 *
 * Pure + dependency-free so client components and server routes share it.
 */

export interface NameParts {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

function clean(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

/** "First Last" from the parts, trimmed; "" when both are blank. */
export function composeName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [clean(firstName), clean(lastName)].filter(Boolean).join(" ");
}

/**
 * The `name` to persist for a write that may carry parts. An explicit,
 * non-blank `name` always wins (backward compatible — every legacy writer
 * only sends `name`); otherwise it's composed from the parts.
 */
export function resolveNameForWrite(input: NameParts): string {
  const explicit = clean(input.name);
  if (explicit) return explicit;
  return composeName(input.firstName, input.lastName);
}

/** Best label for a contact in UI: name → composed parts → email → fallback. */
export function contactDisplayName(
  c: NameParts & { email?: string | null },
  fallback = "Unnamed contact",
): string {
  return (
    clean(c.name) ||
    composeName(c.firstName, c.lastName) ||
    clean(c.email) ||
    fallback
  );
}

/** First name for greetings/merge tags: explicit part, else first word of name. */
export function contactFirstName(c: NameParts): string {
  const explicit = clean(c.firstName);
  if (explicit) return explicit;
  const full = clean(c.name);
  if (!full) return "";
  const space = full.indexOf(" ");
  return space === -1 ? full : full.slice(0, space);
}

/** Last name: explicit part, else last word of a multi-word name, else "". */
export function contactLastName(c: NameParts): string {
  const explicit = clean(c.lastName);
  if (explicit) return explicit;
  const full = clean(c.name);
  const space = full.lastIndexOf(" ");
  return space === -1 ? "" : full.slice(space + 1);
}

/** Up to two initials for avatars. */
export function contactInitials(c: NameParts & { email?: string | null }): string {
  const label = contactDisplayName(c, "");
  if (!label) return "?";
  if (label.includes("@")) return label.slice(0, 1).toUpperCase();
  const words = label.split(" ").filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * A SUGGESTED split of a full name — for an explicit "Fill from full name"
 * button that pre-fills the form for the operator to review before saving.
 * Never called on a write path. Splits on the first space: "Mary Ann" →
 * ("Mary", "Ann"), which is exactly why a human reviews it.
 */
export function suggestNameSplit(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const full = clean(name);
  if (!full) return { firstName: "", lastName: "" };
  const space = full.indexOf(" ");
  if (space === -1) return { firstName: full, lastName: "" };
  return { firstName: full.slice(0, space), lastName: full.slice(space + 1) };
}
