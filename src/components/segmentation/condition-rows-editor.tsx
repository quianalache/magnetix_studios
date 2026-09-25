"use client";

import { Plus, X } from "lucide-react";
import {
  CALENDAR_DATE_OPS,
  DAY_COUNT_OPS,
  NO_VALUE_OPS,
  TEXT_OPS,
  type FieldOption,
} from "@/lib/segmentation/field-options";
import type { Condition, ConditionGroup, ConditionOp } from "@/types/workflows";

/**
 * Condition-group editor for the shared segmentation engine (Contacts
 * redesign, 2026-09-25) — the row UI the Broadcast audience builder already
 * had, generalised for the Contacts filters / Contact Lists and extended
 * with date + "purchases & access" inputs. Pure presentation: the caller
 * owns the state and decides which fields to offer.
 */

export interface ConditionRow {
  id: string;
  field: string;
  op: ConditionOp;
  value: string;
}

export interface ConditionRowsState {
  match: "all" | "any";
  conditions: ConditionRow[];
}

export const SELECT_CLASS =
  "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground";
export const INPUT_CLASS =
  "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

let rowIdCounter = 0;
export function newRowId(): string {
  rowIdCounter += 1;
  return `cond_${Date.now()}_${rowIdCounter}`;
}

/** A row that's complete enough to evaluate, or null. */
export function rowToCondition(row: ConditionRow): Condition | null {
  if (!row.field || !row.op) return null;
  if (NO_VALUE_OPS.has(row.op)) return { field: row.field, op: row.op };
  const value = row.value.trim();
  if (!value) return null;
  if (DAY_COUNT_OPS.has(row.op) && !/^\d{1,5}$/.test(value)) return null;
  if (CALENDAR_DATE_OPS.has(row.op) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return { field: row.field, op: row.op, value };
}

/** Complete rows only — incomplete rows simply don't narrow yet. */
export function rowsToGroup(state: ConditionRowsState): ConditionGroup {
  return {
    match: state.match,
    all: state.conditions
      .map(rowToCondition)
      .filter((c): c is Condition => !!c),
  };
}

export function groupToRows(group: ConditionGroup | null | undefined): ConditionRowsState {
  return {
    match: group?.match === "any" ? "any" : "all",
    conditions: (group?.all ?? []).map((c) => ({
      id: newRowId(),
      field: c.field,
      op: c.op,
      value: c.value ?? "",
    })),
  };
}

export function ConditionRowsEditor({
  value,
  onChange,
  fieldOptions,
  emptyText,
}: {
  value: ConditionRowsState;
  onChange: (next: ConditionRowsState) => void;
  fieldOptions: FieldOption[];
  /** Shown when there are no conditions. */
  emptyText?: string;
}) {
  function addCondition() {
    const first = fieldOptions[0];
    onChange({
      ...value,
      conditions: [
        ...value.conditions,
        {
          id: newRowId(),
          field: first?.field ?? "",
          op: first?.ops[0]?.op ?? "equals",
          value: "",
        },
      ],
    });
  }

  function updateCondition(id: string, patch: Partial<ConditionRow>) {
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
            aria-label="Match all or any condition"
          >
            <option value="all">All conditions (AND)</option>
            <option value="any">Any condition (OR)</option>
          </select>
        </div>
      )}

      {value.conditions.length === 0 && emptyText && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {emptyText}
        </p>
      )}

      {value.conditions.map((row) => {
        const opt = fieldOptions.find((f) => f.field === row.field) ?? fieldOptions[0];
        const needsValue = !NO_VALUE_OPS.has(row.op);
        const groups = [...new Set((opt?.choices ?? []).map((c) => c.group).filter(Boolean))];
        return (
          <div
            key={row.id}
            className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 p-2"
          >
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
              aria-label="Field"
            >
              {fieldOptions.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={row.op}
              onChange={(e) =>
                updateCondition(row.id, { op: e.target.value as ConditionOp, value: "" })
              }
              className={`${SELECT_CLASS} w-auto min-w-[7rem]`}
              aria-label="Operator"
            >
              {(opt?.ops ?? TEXT_OPS).map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>

            {!needsValue ? (
              <span className="flex-1 text-xs text-muted-foreground">(no value needed)</span>
            ) : (opt?.kind === "select" || opt?.kind === "access") ? (
              <select
                value={row.value}
                onChange={(e) => updateCondition(row.id, { value: e.target.value })}
                className={`${SELECT_CLASS} min-w-[9rem] flex-1`}
                aria-label="Value"
              >
                <option value="">
                  {opt.kind === "access" && (opt.choices?.length ?? 0) === 0
                    ? "No offers, courses or communities yet"
                    : "Pick a value…"}
                </option>
                {groups.length > 0
                  ? groups.map((g) => (
                      <optgroup key={g} label={g}>
                        {opt.choices
                          ?.filter((c) => c.group === g)
                          .map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                      </optgroup>
                    ))
                  : opt.choices?.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
              </select>
            ) : DAY_COUNT_OPS.has(row.op) ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={36500}
                value={row.value}
                onChange={(e) => updateCondition(row.id, { value: e.target.value.replace(/\D/g, "") })}
                placeholder="Days"
                className={`${INPUT_CLASS} w-24 flex-none`}
                aria-label="Number of days"
              />
            ) : CALENDAR_DATE_OPS.has(row.op) ? (
              <input
                type="date"
                value={row.value}
                onChange={(e) => updateCondition(row.id, { value: e.target.value })}
                className={`${INPUT_CLASS} w-40 flex-none`}
                aria-label="Date"
              />
            ) : (
              <input
                value={row.value}
                onChange={(e) => updateCondition(row.id, { value: e.target.value })}
                placeholder="Value"
                className={`${INPUT_CLASS} min-w-[9rem] flex-1`}
                aria-label="Value"
              />
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
    </div>
  );
}
