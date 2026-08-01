"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Star, X } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { TagInput } from "@/components/content-library/tag-input";
import { uploadContentImage } from "@/lib/content-library/upload-image";
import { toDate } from "@/lib/format";
import {
  CONTENT_PLATFORMS,
  CONTENT_PRIORITIES,
  CONTENT_STAGES,
  CONTENT_TYPES,
  emptyContentItem,
  type ContentChecklistItem,
  type ContentItemDoc,
  type ContentPlatform,
  type ContentPriority,
  type ContentStage,
  type ContentTemplateDoc,
  type ContentType,
} from "@/types/content-library";

export type ContentItemFormValues = ReturnType<typeof emptyContentItem>;

const SELECT_CLS =
  "h-9 w-full rounded-xl border border-input bg-muted/30 px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground";

/** Real MomentumOS field-for-field: Details / Workflow / Performance
 *  (Performance only shows once published, and stays a stub for now —
 *  it's the per-item slice of Analytics, deferred). */
export function ContentItemDialog({
  open,
  onOpenChange,
  initial,
  fromTemplate,
  subAccountId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ContentItemDoc | null;
  /** Prefills a brand-new item from a template's fields. */
  fromTemplate?: ContentTemplateDoc | null;
  subAccountId: string;
  onSave: (
    values: ContentItemFormValues & { publishDate: Date | null; deadline: Date | null },
  ) => Promise<void>;
}) {
  const [values, setValues] = useState<ContentItemFormValues>(emptyContentItem());
  const [saving, setSaving] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [publishDateStr, setPublishDateStr] = useState("");
  const [deadlineStr, setDeadlineStr] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setValues({
        title: initial.title,
        hook: initial.hook,
        contentType: initial.contentType,
        platform: initial.platform,
        stage: initial.stage,
        priority: initial.priority,
        description: initial.description,
        estimatedMinutes: initial.estimatedMinutes,
        keywords: initial.keywords,
        thumbnailText: initial.thumbnailText,
        cta: initial.cta,
        repurposingNotes: initial.repurposingNotes,
        isEvergreen: initial.isEvergreen,
        isFocus: initial.isFocus,
        checklist: initial.checklist,
        tags: initial.tags,
      });
      setPublishDateStr(dateInputValue(initial.publishDate));
      setDeadlineStr(dateInputValue(initial.deadline));
    } else if (fromTemplate) {
      setValues({
        title: fromTemplate.name,
        hook: fromTemplate.hookFormula,
        contentType: fromTemplate.contentType,
        platform: fromTemplate.platform,
        stage: fromTemplate.defaultStage,
        priority: fromTemplate.defaultPriority,
        description: fromTemplate.descriptionTemplate,
        estimatedMinutes: fromTemplate.estimatedMinutes,
        keywords: fromTemplate.keywords ?? "",
        thumbnailText: "",
        cta: fromTemplate.ctaTemplate,
        repurposingNotes: fromTemplate.repurposingNotes,
        isEvergreen: fromTemplate.isEvergreen,
        isFocus: false,
        checklist: fromTemplate.checklist.map((text) => ({ text, done: false })),
        tags: fromTemplate.defaultTags,
      });
    } else {
      setValues(emptyContentItem());
    }
    if (!initial) {
      setPublishDateStr("");
      setDeadlineStr("");
    }
  }, [open, initial, fromTemplate]);

  function set<K extends keyof ContentItemFormValues>(key: K, value: ContentItemFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function addChecklistItem() {
    if (!newChecklistText.trim()) return;
    set("checklist", [...values.checklist, { text: newChecklistText.trim(), done: false }]);
    setNewChecklistText("");
  }

  function toggleChecklistItem(index: number) {
    const next = [...values.checklist];
    next[index] = { ...next[index], done: !next[index].done };
    set("checklist", next);
  }

  function removeChecklistItem(index: number) {
    set("checklist", values.checklist.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!values.title.trim()) {
      toast.error("Give this content a title.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...values,
        publishDate: publishDateStr ? new Date(publishDateStr) : null,
        deadline: deadlineStr ? new Date(deadlineStr) : null,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const showPerformance = initial?.stage === "published";

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {fromTemplate ? "New Content from Template" : initial ? "Edit Content" : "New Content Item"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="mb-4 rounded-xl bg-muted/50">
            <TabsTrigger value="details" className="rounded-lg text-xs">
              Details
            </TabsTrigger>
            <TabsTrigger value="workflow" className="rounded-lg text-xs">
              Workflow
            </TabsTrigger>
            {showPerformance && (
              <TabsTrigger value="performance" className="rounded-lg text-xs">
                Performance
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Content title..."
                className="rounded-xl bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <Label>Working Hook</Label>
              <Input
                value={values.hook}
                onChange={(e) => set("hook", e.target.value)}
                placeholder="Hook or working headline..."
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
                <Label>Stage</Label>
                <select
                  value={values.stage}
                  onChange={(e) => set("stage", e.target.value as ContentStage)}
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
                <Label>Priority</Label>
                <select
                  value={values.priority}
                  onChange={(e) => set("priority", e.target.value as ContentPriority)}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Publish Date</Label>
                <Input
                  type="date"
                  value={publishDateStr}
                  onChange={(e) => setPublishDateStr(e.target.value)}
                  className="rounded-xl bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={deadlineStr}
                  onChange={(e) => setDeadlineStr(e.target.value)}
                  className="rounded-xl bg-muted/30"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Linked Project</Label>
              <select value="none" disabled className={SELECT_CLS} title="Projects isn't built yet">
                <option value="none">None</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Description / Notes</Label>
              <RichTextEditor
                value={values.description}
                onChange={(html) => set("description", html)}
                onUploadImage={(file) =>
                  uploadContentImage(file, subAccountId, initial?.id ?? "draft")
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Est. Production Time (min)</Label>
                <Input
                  type="number"
                  placeholder="60"
                  value={values.estimatedMinutes ?? ""}
                  onChange={(e) =>
                    set("estimatedMinutes", e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-xl bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <Label>Keywords / Topics</Label>
                <Input
                  value={values.keywords}
                  onChange={(e) => set("keywords", e.target.value)}
                  placeholder="seo, creator, growth..."
                  className="rounded-xl bg-muted/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <Star className="h-3.5 w-3.5" />
                  Focus Content
                </span>
                <Switch checked={values.isFocus} onCheckedChange={(v) => set("isFocus", v)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <span className="text-sm font-medium">Evergreen</span>
                <Switch
                  checked={values.isEvergreen}
                  onCheckedChange={(v) => set("isEvergreen", v)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagInput value={values.tags} onChange={(tags) => set("tags", tags)} />
            </div>
          </TabsContent>

          <TabsContent value="workflow" className="space-y-4">
            <div className="space-y-2">
              <Label>Thumbnail Text</Label>
              <Input
                value={values.thumbnailText}
                onChange={(e) => set("thumbnailText", e.target.value)}
                placeholder="Text that will appear on thumbnail..."
                className="rounded-xl bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <Label>CTA</Label>
              <Input
                value={values.cta}
                onChange={(e) => set("cta", e.target.value)}
                placeholder="Call to action for this piece..."
                className="rounded-xl bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <Label>Repurposing Notes</Label>
              <Textarea
                value={values.repurposingNotes}
                onChange={(e) => set("repurposingNotes", e.target.value)}
                placeholder="How to repurpose this content — shorts, reels, emails..."
                className="min-h-[100px] rounded-xl bg-muted/30"
              />
            </div>
            <div className="space-y-2">
              <Label>Checklist</Label>
              <ul className="space-y-1.5">
                {values.checklist.map((item: ContentChecklistItem, i: number) => (
                  <li key={i} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleChecklistItem(i)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className={`flex-1 text-sm ${item.done ? "text-muted-foreground line-through" : ""}`}>
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(i)}
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
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  placeholder="Add a checklist item..."
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
          </TabsContent>

          {showPerformance && (
            <TabsContent value="performance" className="space-y-4">
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Performance tracking (views, engagement, watch time, revenue) is coming soon.
              </p>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="mt-6 border-t border-border/50 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-full">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !values.title.trim()} className="rounded-full">
            {saving ? "Saving…" : initial ? "Save Changes" : "Add to Pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function dateInputValue(v: ContentItemDoc["publishDate"]): string {
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : "";
}
