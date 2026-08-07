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
import { ContactPicker } from "@/components/quotes/contact-picker";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToProjectSteps } from "@/lib/firestore/projects";
import { toDate } from "@/lib/format";
import type { Contact } from "@/types/contacts";
import type { Project, ProjectStep, ProjectTemplate } from "@/types/projects";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  templates: ProjectTemplate[];
  project?: Project | null;
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ProjectDialog({
  open,
  onOpenChange,
  contacts,
  templates,
  project,
}: ProjectDialogProps) {
  const { subAccountId } = useSubAccount();
  const isEdit = !!project;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [steps, setSteps] = useState<ProjectStep[]>([]);
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (project) {
      setTitle(project.title);
      setDescription(project.description ?? "");
      const s = toDate(project.startAt);
      const d = toDate(project.dueAt);
      setStartDate(s ? toDateInput(s) : "");
      setDueDate(d ? toDateInput(d) : "");
      setContactId(project.assignedContactId);
    } else {
      setTitle("");
      setDescription("");
      setStartDate("");
      setDueDate("");
      setContactId(null);
      setTemplateId("");
    }
    setErrors({});
  }, [open, project]);

  useEffect(() => {
    if (!open || !project) {
      setSteps([]);
      return;
    }
    return subscribeToProjectSteps(project.id, setSteps);
  }, [open, project]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      if (isEdit && project) {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            startAt: startDate || null,
            dueAt: dueDate || null,
            assignedContactId: contactId,
          }),
        });
        if (!res.ok) throw new Error();
        toast.success("Project updated");
      } else {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            startAt: startDate || null,
            dueAt: dueDate || null,
            assignedContactId: contactId,
            templateId: templateId || null,
          }),
        });
        if (!res.ok) throw new Error();
        toast.success("Project created");
      }
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save this project. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!project) return;
    const nextStatus = project.status === "active" ? "archived" : "active";
    setSaving(true);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(nextStatus === "archived" ? "Project archived" : "Project reactivated");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't update this project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!project) return;
    if (!confirm(`Delete project "${project.title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/projects/${project.id}`, {
        method: "DELETE",
      });
      toast.success("Project deleted");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't delete this project.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddStep() {
    if (!project || !newStep.trim()) return;
    setAddingStep(true);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/projects/${project.id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newStep.trim() }),
      });
      setNewStep("");
    } catch {
      toast.error("Couldn't add that step.");
    } finally {
      setAddingStep(false);
    }
  }

  async function handleToggleStep(step: ProjectStep) {
    if (!project) return;
    await fetch(`/api/sub-accounts/${subAccountId}/projects/${project.id}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !step.done }),
    }).catch(() => toast.error("Couldn't update that step."));
  }

  async function handleDeleteStep(step: ProjectStep) {
    if (!project) return;
    await fetch(`/api/sub-accounts/${subAccountId}/projects/${project.id}/steps/${step.id}`, {
      method: "DELETE",
    }).catch(() => toast.error("Couldn't delete that step."));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Project" : "New Project"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Both you and the assigned client (if any) see changes here."
              : "Assign it to a client to mirror it in their Client Portal, or leave unassigned to keep it internal."}
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-4 p-4 pt-0" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="project-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="12-Week Rebrand"
              aria-invalid={!!errors.title}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-desc">Description</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this project covers"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-start">Start date</Label>
              <Input
                id="project-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-due">Due date</Label>
              <Input
                id="project-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-contact">Assigned to</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ContactPicker
                  id="project-contact"
                  contacts={contacts}
                  value={contactId ?? ""}
                  onChange={(id) => setContactId(id)}
                  placeholder="Optional — assign to a client"
                  title="Assign to a client"
                />
              </div>
              {contactId && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setContactId(null)}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Assigning shows this project in that client&apos;s Client Portal — either of you can check off steps.
            </p>
          </div>

          {!isEdit && templates.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="project-template">Start from a template</Label>
              <select
                id="project-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Blank project</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.category ? ` — ${t.category}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Copies the template&apos;s steps in as a starting checklist.
              </p>
            </div>
          )}

          {isEdit && project && (
            <div className="space-y-1.5">
              <Label>Steps</Label>
              <div className="space-y-1 rounded-lg border p-2">
                {steps.length === 0 ? (
                  <p className="px-1 py-2 text-xs italic text-muted-foreground">
                    No steps yet — add the first one below.
                  </p>
                ) : (
                  steps.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleStep(s)}
                        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 ${
                          s.done ? "border-primary bg-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        {s.done && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                      </button>
                      <span
                        className={`flex-1 text-[13px] ${s.done ? "text-muted-foreground line-through" : ""}`}
                      >
                        {s.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteStep(s)}
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddStep();
                      }
                    }}
                    placeholder="Add a step…"
                    className="h-8 text-[13px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddStep}
                    disabled={!newStep.trim() || addingStep}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleArchiveToggle}
                  disabled={saving || deleting}
                >
                  {project?.status === "active" ? "Archive" : "Reactivate"}
                </Button>
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Project"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
