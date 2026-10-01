"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/quotes/contact-picker";
import { useSubAccount } from "@/context/sub-account-context";
import { useTaskAssignees } from "@/hooks/use-task-assignees";
import { updateTask, deleteTask } from "@/lib/firestore/tasks";
import { toDate } from "@/lib/format";
import { TaskDetailModal } from "@/components/tasks/detail/task-detail-modal";
import { TASK_PRIORITIES, TASK_RECURRENCE_LABELS, TASK_TIME_BLOCKS, type Task, type TaskFormData, type TaskPriority, type TaskRecurrenceType, type TaskTimeBlock } from "@/types/tasks";
import type { Contact } from "@/types/contacts";

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  task?: Task | null;
  defaultContactId?: string | null;
  /** Link a NEW task to this deal (Deal Details → Add Task). */
  defaultDealId?: string | null;
  /** Link a NEW task to a project when opened from a project workspace. */
  defaultProjectId?: string | null;
  onSaved?: () => void;
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Projects & Tasks Phase 2: project tasks and subtasks are server-managed
 * (history, activity, client visibility) and the browser may not write
 * them directly — so wherever an existing surface (Contacts, Deals,
 * Calendar, AI consoles) opens one for editing, it opens in Task Detail
 * instead. Standalone tasks keep this dialog exactly as before.
 */
export function TaskDialog(props: TaskDialogProps) {
  // Project tasks, subtasks and routine activities can only change through
  // the server routes (firestore.rules), so they open the full Task Detail.
  if (props.task && (props.task.projectId || props.task.parentTaskId || props.task.routineId)) {
    return (
      <TaskDetailModal
        taskId={props.task.id}
        open={props.open}
        onOpenChange={props.onOpenChange}
      />
    );
  }
  return <StandaloneTaskDialog {...props} />;
}

function StandaloneTaskDialog({
  open,
  onOpenChange,
  contacts,
  task,
  defaultContactId,
  defaultDealId,
  defaultProjectId,
  onSaved,
}: TaskDialogProps) {
  const { subAccountId } = useSubAccount();
  const { assignees } = useTaskAssignees();
  const isEdit = !!task;

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [timeBlock, setTimeBlock] = useState<TaskTimeBlock | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [tags, setTags] = useState("");
  const [recurrence, setRecurrence] = useState<TaskRecurrenceType | null>(null);
  const [autoRollover, setAutoRollover] = useState(false);
  const [assigneeUid, setAssigneeUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (task) {
      const d = toDate(task.dueAt);
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setDueDate(d ? toDateInput(d) : "");
      setDueTime(d ? toTimeInput(d) : "");
      setTimeBlock(task.timeBlock ?? null);
      setContactId(task.contactId);
      setPriority(task.priority ?? null);
      setEstimateMinutes(task.estimateMinutes ? String(task.estimateMinutes) : "");
      setTags((task.tags ?? []).join(", "));
      setRecurrence(task.recurrence?.type ?? null);
      setAutoRollover(task.autoRollover === true);
      setAssigneeUid(task.assigneeUid ?? null);
    } else {
      setTitle("");
      setNotes("");
      setDueDate("");
      setDueTime("");
      setTimeBlock(null);
      setContactId(defaultContactId ?? null);
      setPriority(null);
      setEstimateMinutes("");
      setTags("");
      setRecurrence(null);
      setAutoRollover(false);
      setAssigneeUid(null);
    }
    setErrors({});
  }, [open, task, defaultContactId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    let dueAt: Date | null = null;
    if (dueDate) {
      const time = dueTime || "23:59";
      dueAt = new Date(`${dueDate}T${time}:00`);
    }

    const payload: TaskFormData = {
      title: title.trim(),
      notes: notes.trim(),
      dueAt,
      contactId,
      dealId: task ? (task.dealId ?? null) : (defaultDealId ?? null),
      eventId: task?.eventId ?? null,
      timeBlock,
    };

    setSaving(true);
    try {
      if (isEdit && task) {
        // Plain edit has no webhook event — stays a client-side write.
        await updateTask(task.id, payload);
        toast.success("Task updated");
      } else {
        // Create goes through the server so task.created fires. The full
        // service is shared with Task Detail and owns the richer fields.
        const useFullTaskService = !defaultDealId;
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subAccountId,
            title: payload.title,
            notes: payload.notes,
            dueAt: payload.dueAt ? payload.dueAt.toISOString() : null,
            contactId: payload.contactId,
            dealId: payload.dealId,
            eventId: payload.eventId,
            timeBlock: payload.timeBlock,
            ...(useFullTaskService
              ? {
                  full: true,
                  projectId: defaultProjectId ?? null,
                  priority,
                  estimateMinutes: estimateMinutes ? Number(estimateMinutes) : null,
                  tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                  recurrence: recurrence ? { type: recurrence } : null,
                  autoRollover,
                  assigneeUid,
                }
              : {}),
          }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(b.error ?? "Couldn't save task. Try again.");
          return;
        }
        toast.success("Task created");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save task. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirm(`Delete task "${task.title}"?`)) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      toast.success("Task deleted");
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't delete task.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this task."
              : "A follow-up, a reminder, or anything you don't want to forget."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="task-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Follow up with Sarah"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <select id="task-priority" value={priority ?? ""} onChange={(e) => setPriority((e.target.value || null) as TaskPriority | null)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Unset</option>
                {TASK_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-estimate">Estimate (minutes)</Label>
              <Input id="task-estimate" inputMode="numeric" value={estimateMinutes} onChange={(e) => setEstimateMinutes(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="30" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-recurrence">Repeats</Label>
              <select id="task-recurrence" value={recurrence ?? ""} onChange={(e) => setRecurrence((e.target.value || null) as TaskRecurrenceType | null)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Doesn&apos;t repeat</option>
                {(Object.keys(TASK_RECURRENCE_LABELS) as TaskRecurrenceType[]).map((r) => <option key={r} value={r}>{TASK_RECURRENCE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Assignee</Label>
            <select id="task-assignee" value={assigneeUid ?? ""} onChange={(e) => setAssigneeUid(e.target.value || null)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Unassigned</option>
              {assignees.map((member) => <option key={member.uid} value={member.uid}>{member.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-date">Due date</Label>
              <Input
                id="task-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-time">Time</Label>
              <Input
                id="task-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-time-block">Time block</Label>
            <select
              id="task-time-block"
              value={timeBlock ?? ""}
              onChange={(e) =>
                setTimeBlock(
                  e.target.value ? (e.target.value as TaskTimeBlock) : null,
                )
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Unset</option>
              {TASK_TIME_BLOCKS.map((tb) => (
                <option key={tb.value} value={tb.value}>
                  {tb.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Sorts this task into a slot on the Calendar page&apos;s Today&apos;s Time Blocks panel.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-tags">Tags</Label>
            <Input id="task-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="marketing, follow-up" />
            <p className="text-[11px] text-muted-foreground">Separate tags with commas.</p>
          </div>

          {!isEdit && !defaultDealId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRollover} onChange={(e) => setAutoRollover(e.target.checked)} className="accent-primary" />
              Automatically roll over when overdue
            </label>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="task-contact">Linked contact</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ContactPicker
                  id="task-contact"
                  contacts={contacts}
                  value={contactId ?? ""}
                  onChange={(id) => setContactId(id)}
                  placeholder="Optional — link to a contact"
                  title="Link a contact"
                />
              </div>
              {contactId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setContactId(null)}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context, agenda, or prep."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit ? (
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
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Task"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
