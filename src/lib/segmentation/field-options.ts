import { PIPELINE_STAGES } from "@/types/deals";
import type { CustomFieldDef } from "@/types/custom-fields";
import type { AccessCatalog } from "@/types/contact-access";
import type { ConditionOp } from "@/types/workflows";

/**
 * Filterable contact fields for the shared segmentation engine — ONE list
 * used by both the Broadcast audience builder and the Contacts list filters
 * (Contacts redesign, 2026-09-25; extracted from
 * audience-condition-builder.tsx so the two can't drift). Pure, client-safe.
 *
 * Every field is a real Contact field (src/types/contacts.ts). Date fields
 * use the evaluator's date operators; the `access` pseudo-field is only
 * offered where a server-side access index exists (Contacts filters,
 * Contact Lists) — never in the client-evaluated broadcast conditions.
 */

export type FieldKind = "tags" | "select" | "text" | "date" | "access";

export interface FieldOption {
  field: string;
  label: string;
  kind: FieldKind;
  /** For kind "select" / "access" — the fixed choice list. */
  choices?: { value: string; label: string; group?: string }[];
  ops: { op: ConditionOp; label: string }[];
}

/** Every ContactSource value with a label (mirrors source-badge.tsx). */
export const KNOWN_SOURCES: { value: string; label: string }[] = [
  { value: "website-form", label: "Website Form" },
  { value: "web-chat", label: "Web Chat" },
  { value: "booking-page", label: "Booking" },
  { value: "community", label: "Community" },
  { value: "get-leads", label: "Get Leads" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "ads", label: "Ads" },
  { value: "other", label: "Other" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "email", label: "Inbound Email" },
];

export const TAG_OPS: FieldOption["ops"] = [
  { op: "has_tag", label: "has tag" },
  { op: "not_has_tag", label: "doesn't have tag" },
];
export const SELECT_EQ_OPS: FieldOption["ops"] = [
  { op: "equals", label: "is" },
  { op: "not_equals", label: "is not" },
];
export const SOURCE_OPS: FieldOption["ops"] = [
  { op: "source_is", label: "is" },
  { op: "not_equals", label: "is not" },
];
export const TEXT_OPS: FieldOption["ops"] = [
  { op: "equals", label: "is" },
  { op: "not_equals", label: "is not" },
  { op: "contains", label: "contains" },
  { op: "not_contains", label: "does not contain" },
  { op: "is_set", label: "exists" },
  { op: "not_set", label: "does not exist" },
];
export const DATE_OPS: FieldOption["ops"] = [
  { op: "within_last_days", label: "in the last (days)" },
  { op: "more_than_days_ago", label: "more than (days) ago" },
  { op: "after", label: "is after" },
  { op: "before", label: "is before" },
  { op: "is_set", label: "exists" },
  { op: "not_set", label: "does not exist" },
];
export const ACCESS_OPS: FieldOption["ops"] = [
  { op: "has_access", label: "has" },
  { op: "not_has_access", label: "doesn't have" },
];

export const NO_VALUE_OPS: ReadonlySet<ConditionOp> = new Set<ConditionOp>([
  "is_set",
  "not_set",
]);
export const DAY_COUNT_OPS: ReadonlySet<ConditionOp> = new Set<ConditionOp>([
  "within_last_days",
  "more_than_days_ago",
]);
export const CALENDAR_DATE_OPS: ReadonlySet<ConditionOp> = new Set<ConditionOp>([
  "before",
  "after",
]);

/**
 * Standard fields. `sourceOps` lets the broadcast builder keep its original
 * "equals / not equals" source ops (existing drafts store those) while the
 * Contacts filters use the purpose-built `source_is`.
 */
export function standardFieldOptions(
  opts: { sourceOps?: FieldOption["ops"] } = {},
): FieldOption[] {
  return [
    { field: "tags", label: "Tag", kind: "tags", ops: TAG_OPS },
    {
      field: "pipelineStage",
      label: "Pipeline Stage",
      kind: "select",
      choices: PIPELINE_STAGES.map((s) => ({ value: s.id, label: s.label })),
      ops: SELECT_EQ_OPS,
    },
    {
      field: "source",
      label: "Source",
      kind: "select",
      choices: KNOWN_SOURCES,
      ops: opts.sourceOps ?? SELECT_EQ_OPS,
    },
    { field: "name", label: "Name", kind: "text", ops: TEXT_OPS },
    { field: "firstName", label: "First name", kind: "text", ops: TEXT_OPS },
    { field: "lastName", label: "Last name", kind: "text", ops: TEXT_OPS },
    { field: "email", label: "Email", kind: "text", ops: TEXT_OPS },
    { field: "phone", label: "Phone", kind: "text", ops: TEXT_OPS },
    { field: "company", label: "Company", kind: "text", ops: TEXT_OPS },
    { field: "city", label: "City", kind: "text", ops: TEXT_OPS },
    { field: "state", label: "State / Region", kind: "text", ops: TEXT_OPS },
    { field: "postalCode", label: "Postal code", kind: "text", ops: TEXT_OPS },
    { field: "country", label: "Country", kind: "text", ops: TEXT_OPS },
    { field: "createdAt", label: "Created", kind: "date", ops: DATE_OPS },
    { field: "updatedAt", label: "Last updated", kind: "date", ops: DATE_OPS },
  ];
}

export function customFieldOption(def: CustomFieldDef): FieldOption {
  const field = `customFields.${def.key}`;
  if (def.type === "dropdown" && def.options.length > 0) {
    return {
      field,
      label: def.label,
      kind: "select",
      choices: def.options.map((o) => ({ value: o, label: o })),
      ops: SELECT_EQ_OPS,
    };
  }
  if (def.type === "date") {
    return { field, label: def.label, kind: "date", ops: DATE_OPS };
  }
  return { field, label: def.label, kind: "text", ops: TEXT_OPS };
}

/** "Purchases & access" pseudo-field — choices from the access catalog. */
export function accessFieldOption(catalog: AccessCatalog | null): FieldOption {
  const choices = [
    ...(catalog?.offers ?? []).map((i) => ({
      value: i.key,
      label: `Purchased offer: ${i.name}`,
      group: "Offers",
    })),
    ...(catalog?.courses ?? []).map((i) => ({
      value: i.key,
      label: `Enrolled in course: ${i.name}`,
      group: "Courses",
    })),
    ...(catalog?.communities ?? []).map((i) => ({
      value: i.key,
      label: `Community member: ${i.name}`,
      group: "Communities",
    })),
  ];
  return {
    field: "access",
    label: "Purchases & access",
    kind: "access",
    choices,
    ops: ACCESS_OPS,
  };
}

/** Plain-language summary of one condition (list descriptions, chips). */
export function describeCondition(
  c: { field: string; op: ConditionOp; value?: string },
  options: FieldOption[],
): string {
  const opt = options.find((o) => o.field === c.field);
  const label = opt?.label ?? c.field;
  const opLabel = opt?.ops.find((o) => o.op === c.op)?.label ?? c.op.replace(/_/g, " ");
  if (NO_VALUE_OPS.has(c.op)) return `${label} ${opLabel}`;
  const choice = opt?.choices?.find((ch) => ch.value === c.value)?.label;
  if (c.field === "access") return `${opLabel === "has" ? "" : "Not: "}${choice ?? c.value}`;
  if (DAY_COUNT_OPS.has(c.op)) {
    return c.op === "within_last_days"
      ? `${label} in the last ${c.value} days`
      : `${label} more than ${c.value} days ago`;
  }
  return `${label} ${opLabel} ${choice ?? c.value ?? ""}`.trim();
}
