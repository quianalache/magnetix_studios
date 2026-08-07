"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSubAccount } from "@/context/sub-account-context";
import type { ProjectTemplate, ProjectTemplateStep } from "@/types/projects";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ProjectTemplate | null;
}

/** Coach-only, per her explicit "let's keep the templates only for the coach for now" — there's no member-facing equivalent of this dialog. */
export function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const { subAccountId } = useSubAccount();
  const isEdit = !!template;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (template) {
      setTitle(template.title);
      setCategory(template.category ?? "");
      setDurationDays(template.durationDays != null ? String(template.durationDays) : "");
      setDescription(template.description ?? "");
      setSteps(template.steps.map((s) => s.title));
    } else {
      setTitle("");
      setCategory("");
      setDurationDays("");
      setDescription("");
      setSteps([]);
    }
    setNewStep("");
    setErrors({});
  }, [open, template]);

  function addStepDraft() {
    if (!newStep.trim()) return;
    setSteps((prev) => [...prev, newStep.trim()]);
    setNewStep("");
  }
  function removeStepDraft(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const stepPayload: ProjectTemplateStep[] = steps.map((s, i) => ({ title: s, order: i }));

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/sub-accounts/${subAccountId}/project-templates/${template!.id}`
        : `/api/sub-accounts/${subAccountId}/project-templates`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim(),
          durationDays: durationDays ? Number(durationDays) : null,
          description: description.trim(),
          steps: stepPayload,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Template updated" : "Template created");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save this template. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!template) return;
    if (!confirm(`Delete template "${template.title}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/project-templates/${template.id}`, {
        method: "DELETE",
      });
      toast.success("Template deleted");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't delete this template.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Template" : "New Template"}</SheetTitle>
          <SheetDescription>
            Coach-only — students never see or start from templates directly.
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-4 p-4 pt-0" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="12-Week Rebrand"
              aria-invalid={!!errors.title}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-category">Category</Label>
              <Input
                id="tpl-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Content Workflow"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-duration">Duration (days)</Label>
              <Input
                id="tpl-duration"
                type="number"
                min={0}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="14"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Steps</Label>
            <div className="space-y-1 rounded-lg border p-2">
              {steps.length === 0 && (
                <p className="px-1 py-2 text-xs italic text-muted-foreground">
                  No steps yet — every project spawned from this template starts with these.
                </p>
              )}
              {steps.map((s, i) => (
                <div key={i} className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50">
                  <span className="flex-1 text-[13px]">{s}</span>
                  <button type="button" onClick={() => removeStepDraft(i)} className="opacity-0 group-hover:opacity-100">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addStepDraft();
                    }
                  }}
                  placeholder="Add a step…"
                  className="h-8 text-[13px]"
                />
                <Button type="button" variant="outline" size="sm" onClick={addStepDraft} disabled={!newStep.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit ? (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={saving || deleting}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Template"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
