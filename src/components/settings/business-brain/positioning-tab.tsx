"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { POSITIONING_ELEMENTS } from "@/lib/business-brain/positioning-elements";
import type { BusinessBrainPositioning } from "@/types/business-brain";

/**
 * Positioning is optional strategic context — the 12 Positioning
 * Elements™, sorted into 3 groups the same way the original tool did
 * (Most-Used / Want to Practice More / Do NOT Fit), plus free-form notes.
 * Not wired into any AI generation this pass — pure data management, per
 * instruction.
 */

const GROUPS: { key: keyof BusinessBrainPositioning; label: string; helper: string }[] = [
  { key: "mostUsed", label: "Most-Used Positioning Elements", helper: "The lenses you reach for naturally." },
  { key: "practiceMore", label: "Want to Practice More", helper: "Powerful, but underused." },
  { key: "notFit", label: "Do NOT Fit My Voice", helper: "Doesn't feel like you — skip these." },
];

export function PositioningTab({
  value,
  onSave,
}: {
  value: BusinessBrainPositioning | undefined;
  onSave: (next: BusinessBrainPositioning) => Promise<void>;
}) {
  const [draft, setDraft] = useState<BusinessBrainPositioning>(value ?? {});
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hydrated && value) {
      setDraft(value);
      setHydrated(true);
    }
  }, [hydrated, value]);

  function toggle(groupKey: keyof BusinessBrainPositioning, slug: string, checked: boolean) {
    setDraft((prev) => {
      const current = (prev[groupKey] as string[] | undefined) ?? [];
      const next = checked ? [...current, slug] : current.filter((s) => s !== slug);
      return { ...prev, [groupKey]: next };
    });
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
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Positioning is optional — it never blocks anything downstream. Sort
        each of the 12 Positioning Elements™ into whichever group fits (an
        element can be left unchecked in all three).
      </p>

      {GROUPS.map((group) => {
        const selected = new Set((draft[group.key] as string[] | undefined) ?? []);
        return (
          <div key={group.key} className="rounded-xl border p-4">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{group.helper}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {POSITIONING_ELEMENTS.map((el) => (
                <label
                  key={el.slug}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.has(el.slug)}
                    onCheckedChange={(v) => toggle(group.key, el.slug, v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium">{el.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {el.definition}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <div className="space-y-1.5">
        <Label htmlFor="bb-positioning-notes">Notes</Label>
        <Textarea
          id="bb-positioning-notes"
          value={draft.notes ?? ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
          rows={6}
          className="text-sm"
        />
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}
