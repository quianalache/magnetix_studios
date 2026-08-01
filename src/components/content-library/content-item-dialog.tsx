"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CONTENT_STAGES,
  CONTENT_TYPES,
  emptyContentItem,
  type ContentItemDoc,
  type ContentStage,
  type ContentType,
} from "@/types/content-library";

export type ContentItemFormValues = ReturnType<typeof emptyContentItem>;

/** Create/edit dialog for a Content Library card. Doesn't touch the Social
 *  Planner at all — "Schedule this" lives on the card itself, outside this
 *  dialog, so promoting an idea to a real post is a deliberate separate
 *  action. */
export function ContentItemDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ContentItemDoc | null;
  onSave: (values: ContentItemFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ContentItemFormValues>(emptyContentItem());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      initial
        ? {
            title: initial.title,
            stage: initial.stage,
            contentType: initial.contentType,
            hook: initial.hook,
            notes: initial.notes,
            thumbnailText: initial.thumbnailText,
            isEvergreen: initial.isEvergreen,
            isFavorite: initial.isFavorite,
          }
        : emptyContentItem(),
    );
  }, [open, initial]);

  async function handleSave() {
    if (!values.title.trim()) {
      toast.error("Give this idea a title.");
      return;
    }
    setSaving(true);
    try {
      await onSave(values);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit content" : "New content idea"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={values.title}
              onChange={(e) => setValues({ ...values, title: e.target.value })}
              placeholder="5 mistakes creators make with their offers"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <select
                value={values.stage}
                onChange={(e) => setValues({ ...values, stage: e.target.value as ContentStage })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
              >
                {CONTENT_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                value={values.contentType}
                onChange={(e) =>
                  setValues({ ...values, contentType: e.target.value as ContentType })
                }
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Hook</Label>
            <Input
              value={values.hook}
              onChange={(e) => setValues({ ...values, hook: e.target.value })}
              placeholder="The opening line or angle"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes / script / outline</Label>
            <Textarea
              value={values.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
              rows={5}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Thumbnail text</Label>
            <Input
              value={values.thumbnailText}
              onChange={(e) => setValues({ ...values, thumbnailText: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div>
              <p className="text-sm font-medium">Evergreen</p>
              <p className="text-xs text-muted-foreground">Doesn&apos;t go stale — safe to repurpose anytime</p>
            </div>
            <Switch
              checked={values.isEvergreen}
              onCheckedChange={(v) => setValues({ ...values, isEvergreen: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div>
              <p className="text-sm font-medium">Favorite</p>
              <p className="text-xs text-muted-foreground">Pin it as a top idea</p>
            </div>
            <Switch
              checked={values.isFavorite}
              onCheckedChange={(v) => setValues({ ...values, isFavorite: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add to library"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
