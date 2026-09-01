"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Generic "singleton strategic-text section" form — Creator Vision,
 * Audience, and Brand Voice all share this exact shape (a fixed set of
 * multiline text fields on one object, saved as a whole via one Save
 * button), so this one component drives all three rather than repeating
 * the same hydrate/edit/save boilerplate three times. Field lists differ
 * per caller — nothing about the actual content is generic or simplified.
 */

export interface FieldSpec<T> {
  key: keyof T & string;
  label: string;
  helper?: string;
  rows?: number;
  /** Optional subheading rendered above this field — used to group
   *  related fields (e.g. Audience's Awareness Stages ladder). */
  groupHeading?: string;
}

export function SectionFieldForm<T extends object>({
  value,
  fields,
  onSave,
}: {
  value: T | undefined;
  fields: FieldSpec<T>[];
  onSave: (next: T) => Promise<void>;
}) {
  const [draft, setDraft] = useState<T>(() => (value ?? ({} as T)));
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate once when real data arrives; don't reset on later ticks so an
  // in-flight edit isn't blown away by its own save echoing back down.
  useEffect(() => {
    if (!hydrated && value) {
      setDraft(value);
      setHydrated(true);
    }
  }, [hydrated, value]);

  function setField(key: keyof T & string, v: string) {
    setDraft((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {fields.map((f, i) => (
        <div key={f.key}>
          {f.groupHeading && (
            <h3 className="mb-3 mt-2 text-sm font-semibold text-foreground first:mt-0">
              {f.groupHeading}
            </h3>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`bb-${f.key}`}>{f.label}</Label>
            {f.helper && (
              <p className="text-xs text-muted-foreground">{f.helper}</p>
            )}
            <Textarea
              id={`bb-${f.key}`}
              value={(draft[f.key] as string | undefined) ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              rows={f.rows ?? 3}
              className="text-sm"
            />
          </div>
          {i < fields.length - 1 && !fields[i + 1]?.groupHeading && (
            <div className="h-0" />
          )}
        </div>
      ))}

      <div className="flex justify-end border-t pt-4">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
