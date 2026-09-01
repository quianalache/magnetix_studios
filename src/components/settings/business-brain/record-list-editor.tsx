"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Generic repeatable-record editor — drives Offers, Frameworks, and
 * Stories + Proof, which all share the same real shape: an array of
 * objects on the one Business Brain document, each with an id, a handful
 * of text/select fields, and standard add/edit/delete/collapse behavior
 * (matching the original tool's own "cards collapse after save" pattern
 * — migration spec §4.3-§4.5). Firestore has no partial-array-element
 * write, so every save/delete here persists the WHOLE array at once via
 * the caller's `onSave` — from the user's side it still reads as a
 * single-record action.
 *
 * Any field on a record that isn't in `fields` (e.g. a preserved `legacy`
 * sub-object) is never touched — records are always spread, never
 * rebuilt from just the edited fields.
 */

export interface RecordFieldSpec<T> {
  key: keyof T & string;
  label: string;
  type?: "text" | "textarea" | "select";
  rows?: number;
  /** Static option list, or a function of the record's OWN current value
   *  for that field — used when a real stored value might not match any
   *  of the fixed options (e.g. a story type slug from before this UI
   *  existed) so it still shows correctly instead of appearing blank. */
  options?: string[] | ((currentValue: string) => string[]);
  helper?: string;
}

export function RecordListEditor<T extends { id: string }>({
  records,
  fields,
  titleField,
  subtitleField,
  emptyLabel,
  addLabel,
  makeNewRecord,
  onSave,
  renderExtra,
}: {
  records: T[];
  fields: RecordFieldSpec<T>[];
  titleField: keyof T & string;
  subtitleField?: keyof T & string;
  emptyLabel: string;
  addLabel: string;
  makeNewRecord: () => T;
  onSave: (next: T[]) => Promise<void>;
  /** Optional extra content rendered inside an expanded card, below the
   *  standard fields (used by Topics for its nested Subtopics list). */
  renderExtra?: (record: T, setRecord: (next: T) => void) => React.ReactNode;
}) {
  const [items, setItems] = useState<T[]>(records);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Ids added via "Add" that have never been successfully saved yet — a
  // record's presence here (not a comparison against the original `records`
  // prop, which never changes after a save) is what "Cancel" uses to decide
  // whether to discard it, so a record that WAS successfully saved and is
  // later reopened is never mistaken for an unsaved draft.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  function updateLocal(id: string, next: T) {
    setItems((prev) => prev.map((r) => (r.id === id ? next : r)));
  }

  async function persist(next: T[], successMessage: string) {
    try {
      await onSave(next);
      setItems(next);
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
      throw err;
    }
  }

  async function handleSaveRecord(record: T) {
    setSavingId(record.id);
    try {
      const next = items.map((r) => (r.id === record.id ? record : r));
      await persist(next, "Saved.");
      setNewIds((prev) => {
        const copy = new Set(prev);
        copy.delete(record.id);
        return copy;
      });
      setExpandedId(null);
    } catch {
      // toast already shown
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(record: T) {
    const label = String(record[titleField] ?? "this record") || "this record";
    if (!confirm(`Delete "${label}"? This can't be undone.`)) return;
    setSavingId(record.id);
    try {
      const next = items.filter((r) => r.id !== record.id);
      await persist(next, "Deleted.");
      if (expandedId === record.id) setExpandedId(null);
    } catch {
      // toast already shown
    } finally {
      setSavingId(null);
    }
  }

  function handleAdd() {
    const fresh = makeNewRecord();
    setItems((prev) => [...prev, fresh]);
    setNewIds((prev) => new Set(prev).add(fresh.id));
    setExpandedId(fresh.id);
  }

  function handleCancelNew(record: T) {
    if (newIds.has(record.id)) {
      setItems((prev) => prev.filter((r) => r.id !== record.id));
    }
    setExpandedId(null);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      )}

      {items.map((record) => {
        const isExpanded = expandedId === record.id;
        const isSavingThis = savingId === record.id;
        const title = String(record[titleField] ?? "") || "(untitled)";
        const subtitle = subtitleField ? String(record[subtitleField] ?? "") : "";

        return (
          <div key={record.id} className="rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : record.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{title}</span>
                {subtitle && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {subtitle}
                  </span>
                )}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {isExpanded && (
              <div className="space-y-4 border-t p-4">
                {fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`${record.id}-${f.key}`}>{f.label}</Label>
                    {f.helper && (
                      <p className="text-xs text-muted-foreground">{f.helper}</p>
                    )}
                    {f.type === "select" ? (
                      <select
                        id={`${record.id}-${f.key}`}
                        value={(record[f.key] as string | undefined) ?? ""}
                        onChange={(e) =>
                          updateLocal(record.id, { ...record, [f.key]: e.target.value })
                        }
                        className={cn(
                          "flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        )}
                      >
                        <option value="">—</option>
                        {(typeof f.options === "function"
                          ? f.options((record[f.key] as string | undefined) ?? "")
                          : (f.options ?? [])
                        ).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "text" ? (
                      <Input
                        id={`${record.id}-${f.key}`}
                        value={(record[f.key] as string | undefined) ?? ""}
                        onChange={(e) =>
                          updateLocal(record.id, { ...record, [f.key]: e.target.value })
                        }
                      />
                    ) : (
                      <Textarea
                        id={`${record.id}-${f.key}`}
                        value={(record[f.key] as string | undefined) ?? ""}
                        onChange={(e) =>
                          updateLocal(record.id, { ...record, [f.key]: e.target.value })
                        }
                        rows={f.rows ?? 3}
                        className="text-sm"
                      />
                    )}
                  </div>
                ))}

                {renderExtra?.(record, (next) => updateLocal(record.id, next))}

                <div className="flex items-center justify-between border-t pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(record)}
                    disabled={isSavingThis}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelNew(record)}
                      disabled={isSavingThis}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveRecord(record)}
                      disabled={isSavingThis}
                    >
                      {isSavingThis ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" onClick={handleAdd} className="w-full">
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}
