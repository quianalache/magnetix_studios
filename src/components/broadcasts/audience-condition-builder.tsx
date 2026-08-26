"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { PIPELINE_STAGES } from "@/types/deals";
import { evalConditionGroup } from "@/lib/segmentation/eval-condition-group";
import type { Contact } from "@/types/contacts";
import type { CustomFieldDef } from "@/types/custom-fields";
import type { Condition, ConditionGroup, ConditionOp } from "@/types/workflows";
import type { BroadcastAudienceFilter } from "@/types";

/**
 * Broadcast Segmentation V1 (2026-08-27) — replaces AudienceFilterPicker's
 * single all/tag/stage dropdown with a real multi-condition AND/OR builder,
 * reusing the SAME ConditionGroup/Condition model + evaluator the Workflow
 * Builder already uses (lib/segmentation/eval-condition-group.ts) — not a
 * second segmentation language. Exports the same shape of helpers the old
 * module did (default state, api-shape converter, live-preview hook) so
 * `new/page.tsx` only needed its import swapped, not restructured.
 */

const SELECT_CLASS =
  "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground";
const INPUT_CLASS =
  "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Mirrors source-badge.tsx's LABELS (not exported there) — every
 *  ContactSource value, not just the manual-create subset contact-form.tsx
 *  uses, since a marketer segmenting genuinely wants to filter by
 *  auto-set sources too (e.g. "Source is Community"). */
const KNOWN_SOURCES: { value: string; label: string }[] = [
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

type FieldKind = "tags" | "select" | "text";

interface FieldOption {
  field: string;
  label: string;
  kind: FieldKind;
  /** For kind "select" — the fixed choice list. */
  choices?: { value: string; label: string }[];
  ops: { op: ConditionOp; label: string }[];
}

const TAG_OPS: FieldOption["ops"] = [
  { op: "has_tag", label: "has tag" },
  { op: "not_has_tag", label: "doesn't have tag" },
];
const SELECT_EQ_OPS: FieldOption["ops"] = [
  { op: "equals", label: "is" },
  { op: "not_equals", label: "is not" },
];
const TEXT_OPS: FieldOption["ops"] = [
  { op: "equals", label: "is" },
  { op: "not_equals", label: "is not" },
  { op: "contains", label: "contains" },
  { op: "not_contains", label: "does not contain" },
  { op: "is_set", label: "exists" },
  { op: "not_set", label: "does not exist" },
];

function staticFieldOptions(): FieldOption[] {
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
      ops: SELECT_EQ_OPS,
    },
    { field: "company", label: "Company", kind: "text", ops: TEXT_OPS },
  ];
}

function customFieldOption(def: CustomFieldDef): FieldOption {
  if (def.type === "dropdown" && def.options.length > 0) {
    return {
      field: `customFields.${def.key}`,
      label: def.label,
      kind: "select",
      choices: def.options.map((o) => ({ value: o, label: o })),
      ops: SELECT_EQ_OPS,
    };
  }
  return { field: `customFields.${def.key}`, label: def.label, kind: "text", ops: TEXT_OPS };
}

export interface AudienceConditionRow {
  id: string;
  field: string;
  op: ConditionOp;
  value: string;
}

export interface AudienceFilterState {
  match: "all" | "any";
  conditions: AudienceConditionRow[];
}

export function defaultAudienceFilterState(): AudienceFilterState {
  return { match: "all", conditions: [] };
}

function rowToCondition(row: AudienceConditionRow): Condition | null {
  if (!row.field || !row.op) return null;
  const needsValue = row.op !== "is_set" && row.op !== "not_set";
  if (needsValue && !row.value.trim()) return null;
  return { field: row.field, op: row.op, value: row.value.trim() };
}

function stateToGroup(state: AudienceFilterState): ConditionGroup | undefined {
  if (state.conditions.length === 0) return undefined;
  const all = state.conditions.map(rowToCondition).filter((c): c is Condition => !!c);
  return { match: state.match, all };
}

/**
 * `null` when any added row is still incomplete (field/op picked but no
 * value yet, for an operator that needs one) — same "invalid blocks
 * sending" contract the old tag/stage picker had, so `new/page.tsx`'s
 * `canSend` gate (`!!audienceFilter`) needed no changes.
 */
export function audienceFilterToApiShape(
  state: AudienceFilterState,
): BroadcastAudienceFilter | null {
  if (state.conditions.length === 0) return { kind: "all" };
  const all: Condition[] = [];
  for (const row of state.conditions) {
    const c = rowToCondition(row);
    if (!c) return null;
    all.push(c);
  }
  return { kind: "conditions", group: { match: state.match, all } };
}

/**
 * Live preview — evaluated entirely client-side against the already-loaded
 * contact list (the composer's existing architecture; unchanged by this
 * pass — see new/page.tsx's `subscribeToContacts`). Send-time is
 * independently re-resolved server-side by the exact same evaluator
 * (lib/broadcasts/audience.ts) — this hook is display-only, never trusted
 * for the actual send. A row still being filled in (no value yet) simply
 * doesn't narrow the count further, so the preview stays responsive while
 * composing rather than flashing to 0.
 */
export function useAudiencePreview(
  contacts: Contact[],
  state: AudienceFilterState,
): { recipients: number; skipped: number; matching: number } {
  return useMemo(() => {
    const group = stateToGroup(state);
    const matching = contacts.filter((c) => evalConditionGroup(group, c));
    let recipients = 0;
    let skipped = 0;
    for (const c of matching) {
      if (c.emailOptedOut) {
        skipped += 1;
        continue;
      }
      if (!c.email || !c.email.includes("@")) {
        skipped += 1;
        continue;
      }
      recipients += 1;
    }
    return { recipients, skipped, matching: matching.length };
  }, [contacts, state]);
}

let rowIdCounter = 0;
function newRowId(): string {
  rowIdCounter += 1;
  return `cond_${Date.now()}_${rowIdCounter}`;
}

export function AudienceConditionBuilder({
  contacts,
  value,
  onChange,
  subAccountId,
}: {
  contacts: Contact[];
  value: AudienceFilterState;
  onChange: (next: AudienceFilterState) => void;
  subAccountId: string;
}) {
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/custom-fields?entity=contact`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; fields?: CustomFieldDef[] }) => {
        if (!cancelled && data.ok && Array.isArray(data.fields)) {
          setCustomFieldDefs(data.fields);
        }
      })
      .catch(() => {
        // Custom fields are additive to the picker — a fetch hiccup just
        // means fewer field options, never blocks the rest of the builder.
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  const fieldOptions = useMemo<FieldOption[]>(
    () => [...staticFieldOptions(), ...customFieldDefs.map(customFieldOption)],
    [customFieldDefs],
  );

  const preview = useAudiencePreview(contacts, value);

  function addCondition() {
    const first = fieldOptions[0];
    onChange({
      ...value,
      conditions: [
        ...value.conditions,
        { id: newRowId(), field: first?.field ?? "", op: first?.ops[0]?.op ?? "equals", value: "" },
      ],
    });
  }

  function updateCondition(id: string, patch: Partial<AudienceConditionRow>) {
    onChange({
      ...value,
      conditions: value.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  function removeCondition(id: string) {
    onChange({ ...value, conditions: value.conditions.filter((c) => c.id !== id) });
  }

  return (
    <div className="space-y-3">
      {value.conditions.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">Match</span>
          <select
            value={value.match}
            onChange={(e) => onChange({ ...value, match: e.target.value as "all" | "any" })}
            className={`${SELECT_CLASS} w-auto`}
          >
            <option value="all">All conditions</option>
            <option value="any">Any condition</option>
          </select>
        </div>
      )}

      {value.conditions.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          No conditions — this broadcast will send to every contact in this
          sub-account (minus anyone unsubscribed from marketing email).
        </p>
      )}

      {value.conditions.map((row) => {
        const opt = fieldOptions.find((f) => f.field === row.field) ?? fieldOptions[0];
        const needsValue = row.op !== "is_set" && row.op !== "not_set";
        return (
          <div key={row.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 p-2">
            <select
              value={row.field}
              onChange={(e) => {
                const next = fieldOptions.find((f) => f.field === e.target.value);
                updateCondition(row.id, {
                  field: e.target.value,
                  op: next?.ops[0]?.op ?? "equals",
                  value: "",
                });
              }}
              className={`${SELECT_CLASS} w-auto min-w-[9rem]`}
            >
              {fieldOptions.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={row.op}
              onChange={(e) => updateCondition(row.id, { op: e.target.value as ConditionOp })}
              className={`${SELECT_CLASS} w-auto min-w-[7rem]`}
            >
              {(opt?.ops ?? TEXT_OPS).map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>

            {needsValue && opt?.kind === "select" ? (
              <select
                value={row.value}
                onChange={(e) => updateCondition(row.id, { value: e.target.value })}
                className={`${SELECT_CLASS} min-w-[9rem] flex-1`}
              >
                <option value="">Pick a value…</option>
                {opt.choices?.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : needsValue ? (
              <input
                value={row.value}
                onChange={(e) => updateCondition(row.id, { value: e.target.value })}
                placeholder="Value"
                className={`${INPUT_CLASS} min-w-[9rem] flex-1`}
              />
            ) : (
              <span className="flex-1 text-xs text-muted-foreground">(no value needed)</span>
            )}

            <button
              type="button"
              onClick={() => removeCondition(row.id)}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove condition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-3 w-3" /> Add condition
      </button>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Will receive email</span>
          <span className="font-mono font-semibold">{preview.recipients}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Skipped (unsubscribed / no email)</span>
          <span className="font-mono">{preview.skipped}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Total matching</span>
          <span className="font-mono">{preview.matching}</span>
        </div>
      </div>
    </div>
  );
}
