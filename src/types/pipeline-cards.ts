/**
 * Customize Cards (Multiple Pipelines, 2026-09-25) — which facts a deal
 * card shows. A display preference only: it never changes deal records.
 * The deal title is always shown (essential identification) and is not a
 * toggle; everything else only renders when the deal actually has it.
 */

export type CardFieldKey =
  | "value"
  | "contact"
  | "company"
  | "priority"
  | "expectedCloseDate"
  | "nextTask"
  | "nextAppointment"
  | "timeInStage";

export const CARD_FIELDS: { key: CardFieldKey; label: string; hint?: string }[] = [
  { key: "value", label: "Deal value" },
  { key: "contact", label: "Contact", hint: "Links to the contact's profile" },
  { key: "company", label: "Company" },
  { key: "priority", label: "Priority" },
  { key: "expectedCloseDate", label: "Expected closing date" },
  { key: "nextTask", label: "Next scheduled task" },
  { key: "nextAppointment", label: "Next appointment" },
  { key: "timeInStage", label: "Time spent in stage" },
];

/** Matches what the board showed before Customize Cards existed. */
export const DEFAULT_CARD_FIELDS: CardFieldKey[] = [
  "value",
  "contact",
  "company",
  "priority",
  "timeInStage",
];

const KEYS = new Set<string>(CARD_FIELDS.map((f) => f.key));

export function cleanCardFields(raw: unknown): CardFieldKey[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((k): k is CardFieldKey => typeof k === "string" && KEYS.has(k));
}
