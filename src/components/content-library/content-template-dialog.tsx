"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { uploadContentImage } from "@/lib/content-library/upload-image";
import {
  CONTENT_PLATFORMS,
  CONTENT_PRIORITIES,
  CONTENT_STAGES,
  CONTENT_TYPES,
  emptyContentTemplate,
  type ContentPlatform,
  type ContentPriority,
  type ContentStage,
  type ContentTemplateDoc,
  type ContentType,
} from "@/types/content-library";

export type ContentTemplateFormValues = ReturnType<typeof emptyContentTemplate>;

const SELECT_CLS =
  "h-9 w-full rounded-xl border border-input bg-muted/30 px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground";

/** Create/edit a custom Content Library template — same field shape as
 *  the real MomentumOS system templates, so "your own template" produces
 *  something indistinguishable in shape from the seeded ones. */
export function ContentTemplateDialog({
  open,
  onOpenChange,
  initial,
  subAccountId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ContentTemplateDoc | null;
  subAccountId: string;
  onSave: (values: ContentTemplateFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ContentTemplateFormValues>(emptyContentTemplate());
  const [saving, setSaving] = useState(false);
  const [tagsText, setTagsText] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setValues({
        name: initial.name,
        description: initial.description,
        category: initial.category,
        contentType: initial.contentType,
        platform: initial.platform,
        defaultStage: initial.defaultStage,
        defaultPriority: initial.defaultPriority,
        hookFormula: initial.hookFormula,
        descriptionTemplate: initial.descriptionTemplate,
        ctaTemplate: initial.ctaTemplate,
        repurposingNotes: initial.repurposingNotes,
        estimatedMinutes: initial.estimatedMinutes,
        defaultTags: initial.defaultTags,
        checklist: initial.checklist,
        thumbnailTextFormula: initial.thumbnailTextFormula,
        keywords: initial.keywords,
        isEvergreen: initial.isEvergreen,
      });
      setTagsText(initial.defaultTags.join(", "));
    } else {
      setValues(emptyContentTemplate());
      setTagsText("");
    }
  }, [open, initial]);

  function set<K extends keyof ContentTemplateFormValues>(
    key: K,
    value: ContentTemplateFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function addChecklistItem() {
    if (!newChecklistItem.trim()) return;
    set("checklist", [...values.checklist, newChecklistItem.trim()]);
    setNewChecklistItem("");
  }

  async function handleSave() {
    if (!values.name.trim()) {
      toast.error("Give this template a name.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...values,
        defaultTags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template Name *</Label>
            <Input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Weekly Newsletter, Monthly YouTube Video..."
              className="rounded-xl bg-muted/30"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this template for? When should it be used?"
              className="rounded-xl bg-muted/30"
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. newsletter, youtube, launch..."
              className="rounded-xl bg-muted/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Content Type</Label>
              <select
                value={values.contentType}
                onChange={(e) => set("contentType", e.target.value as ContentType)}
                className={SELECT_CLS}
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <select
                value={values.platform}
                onChange={(e) => set("platform", e.target.value as ContentPlatform)}
                className={SELECT_CLS}
              >
                {CONTENT_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default Stage</Label>
              <select
                value={values.defaultStage}
                onChange={(e) => set("defaultStage", e.target.value as ContentStage)}
                className={SELECT_CLS}
              >
                {CONTENT_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Default Priority</Label>
              <select
                value={values.defaultPriority}
                onChange={(e) => set("defaultPriority", e.target.value as ContentPriority)}
                className={`${SELECT_CLS} capitalize`}
              >
                {CONTENT_PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hook Formula</Label>
            <Input
              value={values.hookFormula}
              onChange={(e) => set("hookFormula", e.target.value)}
              placeholder="e.g. How I [achieved result] in [timeframe]"
              className="rounded-xl bg-muted/30"
            />
          </div>
          <div className="space-y-2">
            <Label>Description Template</Label>
            <RichTextEditor
              value={values.descriptionTemplate}
              onChange={(html) => set("descriptionTemplate", html)}
              onUploadImage={(file) =>
                uploadContentImage(file, subAccountId, initial?.id ?? "draft-template")
              }
            />
          </div>
          <div className="space-y-2">
            <Label>CTA Template</Label>
            <Input
              value={values.ctaTemplate}
              onChange={(e) => set("ctaTemplate", e.target.value)}
              className="rounded-xl bg-muted/30"
            />
          </div>
          <div className="space-y-2">
            <Label>Repurposing Notes</Label>
            <Textarea
              value={values.repurposingNotes}
              onChange={(e) => set("repurposingNotes", e.target.value)}
              className="min-h-[80px] rounded-xl bg-muted/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Est. Production Time (min)</Label>
              <Input
                type="number"
                value={values.estimatedMinutes ?? ""}
                onChange={(e) =>
                  set("estimatedMinutes", e.target.value ? Number(e.target.value) : null)
                }
                className="rounded-xl bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <Label>Keywords</Label>
              <Input
                value={values.keywords ?? ""}
                onChange={(e) => set("keywords", e.target.value)}
                className="rounded-xl bg-muted/30"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Thumbnail Text Formula</Label>
            <Input
              value={values.thumbnailTextFormula ?? ""}
              onChange={(e) => set("thumbnailTextFormula", e.target.value)}
              placeholder="e.g. [NUMBER] [RESULT] in [TIMEFRAME]"
              className="rounded-xl bg-muted/30"
            />
          </div>
          <div className="space-y-2">
            <Label>Default Tags</Label>
            <Input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="comma, separated, tags"
              className="rounded-xl bg-muted/30"
            />
          </div>

          <div className="space-y-2">
            <Label>Checklist</Label>
            <ul className="space-y-1.5">
              {values.checklist.map((text, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{text}</span>
                  <button
                    type="button"
                    onClick={() => set("checklist", values.checklist.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove checklist item"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="Add a checklist step..."
                className="rounded-xl bg-muted/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addChecklistItem}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div>
              <p className="text-sm font-medium">Evergreen</p>
              <p className="text-xs text-muted-foreground">Doesn&apos;t go stale</p>
            </div>
            <Switch checked={values.isEvergreen} onCheckedChange={(v) => set("isEvergreen", v)} />
          </div>
        </div>

        <DialogFooter className="mt-6 border-t border-border/50 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-full">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !values.name.trim()} className="rounded-full">
            {saving ? "Saving…" : initial ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
