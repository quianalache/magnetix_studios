"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Hourglass,
  Info,
  Link2,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Repeat,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubAccount } from "@/context/sub-account-context";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PriorityFlag,
  STATUS_STYLE,
  TIME_BLOCK_META,
  statusLabel,
} from "@/components/tasks/task-meta";
import {
  AttachmentsSection,
  ChecklistSection,
  ConnectionsSection,
  SubtasksSection,
  TagsInput,
  TimeTracker,
} from "@/components/tasks/detail/task-detail-sections";
import {
  deleteComment,
  deleteTaskApi,
  fetchTaskDetail,
  isoToDateInput,
  patchTask,
  postComment,
  setTaskCompleted,
  type TaskDetailBundle,
} from "@/lib/client/task-detail-api";
import {
  TASK_PRIORITIES,
  TASK_RECURRENCE_LABELS,
  TASK_STATUSES,
  TASK_TIME_BLOCKS,
  taskStatusOf,
  type TaskPriority,
  type TaskRecurrenceType,
  type TaskStatus,
  type TaskTimeBlock,
} from "@/types/tasks";

/**
 * Task Detail (Projects & Tasks Phase 2 — design reference 5). One large
 * centered modal: title + completion, the primary fields, compact time
 * tracking, tags, description, then COLLAPSED optional sections (Subtasks,
 * Checklist, Attachments, Task Connections) and an Activity / Comments
 * panel. Full-screen and single-column on mobile, with Activity/Comments
 * folded into a section at the end.
 *
 * All reads come from GET /api/tasks/[id]; every change goes through the
 * server so history, activity, project progress and client visibility
 * stay consistent. Activity shows only recorded rows.
 */

export function TaskDetailModal({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentId, setCurrentId] = useState<string | null>(taskId);
  useEffect(() => setCurrentId(taskId), [taskId]);
  if (!open || !currentId) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-full lg:h-[min(900px,calc(100dvh-3rem))] lg:w-[min(1240px,calc(100vw-3rem))] lg:max-w-[min(1240px,calc(100vw-3rem))] lg:rounded-2xl"
      >
        <TaskDetailBody
          key={currentId}
          taskId={currentId}
          onClose={() => onOpenChange(false)}
          onOpenTask={setCurrentId}
        />
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailBody({
  taskId,
  onClose,
  onOpenTask,
}: {
  taskId: string;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { saPath } = useSubAccount();
  const [bundle, setBundle] = useState<TaskDetailBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setBundle(await fetchTaskDetail(taskId));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [taskId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (error && !bundle) {
    return (
      <>
        <DialogTitle className="sr-only">Task</DialogTitle>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-semibold">This task couldn&apos;t be opened.</p>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </>
    );
  }
  if (!bundle) {
    return (
      <>
        <DialogTitle className="sr-only">Loading task</DialogTitle>
        <div className="space-y-4 p-6">
          <div className="bg-muted/50 h-6 w-2/3 animate-pulse rounded" />
          <div className="bg-muted/40 h-32 animate-pulse rounded-xl" />
          <div className="bg-muted/40 h-48 animate-pulse rounded-xl" />
        </div>
      </>
    );
  }

  const { task, project } = bundle;
  const status = taskStatusOf({ completed: task.completed, status: task.status as TaskStatus });
  const copyLink = () => {
    const url = `${window.location.origin}${saPath("/projects/tasks")}?task=${task.id}`;
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy the link")
    );
  };

  return (
    <>
      <header className="flex items-center gap-2 border-b px-4 py-3 lg:px-6">
        <nav aria-label="Task location" className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1 text-xs sm:text-sm">
          {project ? (
            <>
              <Link href={saPath("/projects")} onClick={onClose} className="text-primary hover:underline">Projects</Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <Link href={saPath(`/projects/${project.id}`)} onClick={onClose} className="text-primary truncate hover:underline">
                {project.title}
              </Link>
            </>
          ) : (
            <Link href={saPath("/projects/tasks")} onClick={onClose} className="text-primary hover:underline">My Tasks</Link>
          )}
          {bundle.parent && (
            <>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <button type="button" onClick={() => onOpenTask(bundle.parent!.id)} className="text-primary truncate hover:underline">
                {bundle.parent.title}
              </button>
            </>
          )}
        </nav>
        <Button variant="ghost" size="sm" onClick={copyLink} className="hidden sm:inline-flex">
          <Link2 className="mr-1.5 h-4 w-4" /> Copy link
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Task actions" />}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={copyLink}><Link2 className="mr-2 h-4 w-4" /> Copy link</DropdownMenuItem>
            {!task.routineId && (
              <DropdownMenuItem onClick={async () => {
                try {
                  await patchTask(task.id, { archived: task.archived !== true });
                  toast.success(task.archived ? "Task restored" : "Task archived");
                  onClose();
                } catch (err) { toast.error((err as Error).message); }
              }}>
                {task.archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                {task.archived ? "Restore task" : "Archive task"}
              </DropdownMenuItem>
            )}
            {!task.routineId && <DropdownMenuSeparator />}
            {!task.routineId && (
            <DropdownMenuItem
              onClick={async () => {
                if (!confirm(`Delete “${task.title}”${bundle.subtasks.length ? " and its subtasks" : ""}? This can't be undone.`)) return;
                try {
                  await deleteTaskApi(task.id);
                  toast.success("Task deleted");
                  onClose();
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete task
            </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 lg:px-8">
          <TitleRow bundle={bundle} status={status} onChanged={reload} />
          <PrimaryFields bundle={bundle} status={status} onChanged={reload} />
          <Description bundle={bundle} onChanged={reload} />
          <div className="space-y-3">
            <SubtasksSection bundle={bundle} onChanged={reload} onOpenTask={onOpenTask} />
            <ChecklistSection bundle={bundle} onChanged={reload} />
            <AttachmentsSection bundle={bundle} onChanged={reload} />
            <ConnectionsSection bundle={bundle} onChanged={reload} onOpenTask={onOpenTask} />
          </div>
          <div className="lg:hidden">
            <MobileActivity bundle={bundle} onChanged={reload} />
          </div>
        </div>
        <aside className="hidden w-[380px] shrink-0 flex-col border-l lg:flex">
          <ActivityComments bundle={bundle} onChanged={reload} />
        </aside>
      </div>
    </>
  );
}

// ── title ───────────────────────────────────────────────────────────────────

function TitleRow({
  bundle,
  status,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  status: TaskStatus;
  onChanged: () => void;
}) {
  const { task } = bundle;
  const [title, setTitle] = useState(task.title);
  const [busy, setBusy] = useState(false);
  const rolled = task.rolledOverCount ?? 0;

  async function toggleComplete() {
    const completing = !task.completed;
    if (completing) {
      const open = bundle.dependsOn.filter((d) => !d.completed);
      if (
        open.length &&
        !confirm(
          `${open.map((d) => `“${d.title}”`).join(", ")} ${open.length === 1 ? "isn't" : "aren't"} finished yet. Complete this task anyway?`
        )
      )
        return;
    }
    setBusy(true);
    try {
      await setTaskCompleted(task.id, completing);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    const t = title.trim();
    if (!t || t === task.title) {
      setTitle(task.title);
      return;
    }
    try {
      await patchTask(task.id, { title: t });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
      setTitle(task.title);
    }
  }

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={toggleComplete}
        aria-label={task.completed ? "Reopen task" : "Mark task complete"}
        aria-pressed={task.completed}
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          task.completed
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-violet-300 text-violet-400 hover:border-violet-500 hover:text-violet-600"
        )}
      >
        <Check className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <DialogTitle className="sr-only">{task.title}</DialogTitle>
        <textarea
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          aria-label="Task title"
          className={cn(
            "field-sizing-content w-full resize-none bg-transparent text-xl leading-snug font-bold outline-none sm:text-2xl",
            task.completed && "text-muted-foreground line-through"
          )}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {status === "completed" && task.completedAt && (
            <span className="text-muted-foreground text-xs">
              Completed {new Date(task.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {rolled > 0 && (
            <span
              className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300"
              title={task.originalDueAt ? `Originally due ${new Date(task.originalDueAt).toLocaleDateString()}` : undefined}
            >
              Rolled over {rolled} {rolled === 1 ? "time" : "times"}
            </span>
          )}
          {task.routineId && (
            <a
              href={`/sa/${task.subAccountId}/projects/routines?routine=${encodeURIComponent(task.routineId)}${task.occurrenceDate ? `&date=${task.occurrenceDate}` : ""}`}
              className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-500/15 dark:text-violet-300"
            >
              <Repeat className="h-3 w-3" />
              {task.routineName || "Routine"}
              {task.occurrenceDate && (
                <span className="opacity-75">
                  · {new Date(`${task.occurrenceDate}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                </span>
              )}
            </a>
          )}
          {task.recurrence && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <Repeat className="h-3 w-3" />
              Repeats {TASK_RECURRENCE_LABELS[task.recurrence.type as TaskRecurrenceType]?.toLowerCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── primary fields ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mb-1 text-xs font-medium">{children}</p>;
}

function SelectButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <DropdownMenuTrigger
      render={
        <button
          type="button"
          aria-label={label}
          className="border-input hover:bg-muted/40 flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm"
        />
      }
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
    </DropdownMenuTrigger>
  );
}

function PrimaryFields({
  bundle,
  status,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  status: TaskStatus;
  onChanged: () => void;
}) {
  const { task, project } = bundle;
  const [estimate, setEstimate] = useState(task.estimateMinutes?.toString() ?? "");
  useEffect(() => setEstimate(task.estimateMinutes?.toString() ?? ""), [task.estimateMinutes]);

  async function patch(p: Record<string, unknown>, success?: string) {
    try {
      const r = await patchTask(task.id, p);
      if (r.warnings?.length) toast.warning(r.warnings.join(" "));
      else if (success) toast.success(success);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const clientProject = !!project?.assignedContactId;
  const assigneeLabel = task.assigneeContactId
    ? `${project?.assignedContactName ?? "Client"} (client)`
    : bundle.assignees.find((a) => a.uid === task.assigneeUid)?.name ?? "Unassigned";
  const block = (task.timeBlock ?? null) as TaskTimeBlock | null;
  const BlockIcon = block ? TIME_BLOCK_META[block].icon : Clock;

  function onDueChange(v: string) {
    if (!v) return patch({ dueAt: null });
    // Keep the existing time of day when only the date changes.
    const prev = task.dueAt ? new Date(task.dueAt) : null;
    const d = new Date(`${v}T${prev ? `${String(prev.getHours()).padStart(2, "0")}:${String(prev.getMinutes()).padStart(2, "0")}` : "17:00"}:00`);
    return patch({ dueAt: d.toISOString() });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <FieldLabel>Status</FieldLabel>
          <DropdownMenu>
            <SelectButton label={`Status: ${statusLabel(status)}`}>
              <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_STYLE[status].dot)} />
              {statusLabel(status)}
            </SelectButton>
            <DropdownMenuContent align="start" className="w-48">
              {TASK_STATUSES.map((s) => (
                <DropdownMenuItem key={s.value} onClick={() => s.value !== status && patch({ status: s.value })}>
                  <span className={cn("mr-2 h-2.5 w-2.5 rounded-full", STATUS_STYLE[s.value].dot)} />
                  <span className="flex-1">{s.label}</span>
                  {s.value === status && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          <FieldLabel>Priority</FieldLabel>
          <DropdownMenu>
            <SelectButton label="Priority">
              {task.priority ? <PriorityFlag priority={task.priority as TaskPriority} /> : <span className="text-muted-foreground">None</span>}
            </SelectButton>
            <DropdownMenuContent align="start" className="w-44">
              {TASK_PRIORITIES.map((p) => (
                <DropdownMenuItem key={p.value} onClick={() => patch({ priority: p.value })}>
                  <span className="flex-1"><PriorityFlag priority={p.value} /></span>
                  {task.priority === p.value && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => patch({ priority: null })}>
                <span className="text-muted-foreground flex-1">None</span>
                {!task.priority && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          <FieldLabel>Assignee</FieldLabel>
          <DropdownMenu>
            <SelectButton label={`Assignee: ${assigneeLabel}`}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                {assigneeLabel === "Unassigned" ? "–" : assigneeLabel.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{assigneeLabel}</span>
            </SelectButton>
            <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
              <DropdownMenuItem onClick={() => patch({ assigneeUid: null, assigneeContactId: null })}>Unassigned</DropdownMenuItem>
              {clientProject && (
                <DropdownMenuItem onClick={() => patch({ assigneeContactId: project!.assignedContactId })}>
                  {project!.assignedContactName ?? "Client"} <span className="text-muted-foreground ml-1 text-xs">(client)</span>
                </DropdownMenuItem>
              )}
              {bundle.assignees.map((a) => (
                <DropdownMenuItem key={a.uid} onClick={() => patch({ assigneeUid: a.uid })}>
                  <span className="flex-1 truncate">{a.name}</span>
                  {task.assigneeUid === a.uid && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          <FieldLabel>Due date</FieldLabel>
          {task.routineId ? (
            <div
              className="border-input bg-muted/40 text-muted-foreground flex h-10 items-center gap-2 rounded-lg border px-3 text-sm"
              title="Routine activities follow the routine's schedule."
            >
              <CalendarDays className="h-4 w-4" />
              {task.occurrenceDate
                ? new Date(`${task.occurrenceDate}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
                : "Set by routine"}
            </div>
          ) : (
          <label className="border-input focus-within:ring-ring/40 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm focus-within:ring-2">
            <CalendarDays className="text-muted-foreground h-4 w-4" />
            <input
              type="date"
              value={isoToDateInput(task.dueAt)}
              onChange={(e) => onDueChange(e.target.value)}
              aria-label="Due date"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          )}
        </div>
        <div>
          <FieldLabel>Time block</FieldLabel>
          <DropdownMenu>
            <SelectButton label="Time block">
              <BlockIcon className="text-muted-foreground h-4 w-4" />
              {block ? TIME_BLOCK_META[block].label : <span className="text-muted-foreground">Not set</span>}
            </SelectButton>
            <DropdownMenuContent align="start" className="w-56">
              {TASK_TIME_BLOCKS.map((b) => {
                const Icon = TIME_BLOCK_META[b.value].icon;
                return (
                  <DropdownMenuItem key={b.value} onClick={() => patch({ timeBlock: b.value })}>
                    <Icon className="mr-2 h-4 w-4" />
                    <span className="flex-1">
                      {b.label} <span className="text-muted-foreground text-xs">({TIME_BLOCK_META[b.value].hint})</span>
                    </span>
                    {block === b.value && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem onClick={() => patch({ timeBlock: null })}>
                <span className="text-muted-foreground">Not set</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          <FieldLabel>Repeat</FieldLabel>
          {task.routineId ? (
            <div className="border-input bg-muted/40 text-muted-foreground flex h-10 items-center gap-2 rounded-lg border px-3 text-sm">
              <Repeat className="h-4 w-4" /> Follows the routine
            </div>
          ) : (
          <DropdownMenu>
            <SelectButton label="Repeat">
              <Repeat className="text-muted-foreground h-4 w-4" />
              {task.recurrence ? TASK_RECURRENCE_LABELS[task.recurrence.type as TaskRecurrenceType] : <span className="text-muted-foreground">Doesn&apos;t repeat</span>}
            </SelectButton>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => patch({ recurrence: null })}>Doesn&apos;t repeat</DropdownMenuItem>
              {(Object.keys(TASK_RECURRENCE_LABELS) as TaskRecurrenceType[]).map((r) => (
                <DropdownMenuItem key={r} onClick={() => patch({ recurrence: { type: r } })}>
                  <span className="flex-1">{TASK_RECURRENCE_LABELS[r]}</span>
                  {task.recurrence?.type === r && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {!task.routineId && (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <Switch
            checked={task.autoRollover === true}
            onCheckedChange={(v) => patch({ autoRollover: v === true }, v ? "Auto rollover on" : "Auto rollover off")}
            aria-label="Auto rollover to next day"
          />
          Auto rollover to next day
          <span title="If this task is still open after its due day, it moves to today and the rollover is recorded.">
            <Info className="text-muted-foreground h-3.5 w-3.5" />
          </span>
        </label>
        )}
        {clientProject && (
          <button
            type="button"
            onClick={() =>
              patch({ visibility: task.visibility === "internal" ? "client" : "internal" })
            }
            disabled={!!task.createdByMemberId}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 text-sm disabled:opacity-60"
            title={task.createdByMemberId ? "Tasks your client created stay visible to them" : undefined}
          >
            {task.visibility === "internal" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {task.visibility === "internal" ? "Internal only — hidden from client" : `Visible to ${project?.assignedContactName ?? "client"}`}
          </button>
        )}
        {task.createdByMemberId && (
          <span className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs text-teal-700 dark:text-teal-300">
            Added by {project?.assignedContactName ?? "your client"}
          </span>
        )}
      </div>

      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[minmax(0,10rem)_auto_minmax(0,1fr)] sm:items-center">
        <div>
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-xs"><Hourglass className="h-3.5 w-3.5" /> Time estimate</p>
          <label className="border-input flex h-10 items-center rounded-lg border px-3">
            <input
              value={estimate}
              onChange={(e) => setEstimate(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => {
                const n = estimate ? Number(estimate) : null;
                if (n !== (task.estimateMinutes ?? null)) void patch({ estimateMinutes: n });
              }}
              inputMode="numeric"
              placeholder="0"
              aria-label="Time estimate in minutes"
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
            <span className="text-muted-foreground text-xs">min</span>
          </label>
        </div>
        <TimeTracker bundle={bundle} onChanged={onChanged} />
        <div>
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-xs"><Tag className="h-3.5 w-3.5" /> Tags</p>
          <TagsInput tags={task.tags ?? []} onChange={(tags) => patch({ tags })} />
        </div>
      </div>
    </div>
  );
}

// ── description ────────────────────────────────────────────────────────────

function Description({
  bundle,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
}) {
  const { task } = bundle;
  const [value, setValue] = useState(task.notes ?? "");
  return (
    <section className="rounded-xl border">
      <p className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold">
        <FileText className="text-muted-foreground h-4 w-4" /> Description
      </p>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={async () => {
          if (value === (task.notes ?? "")) return;
          try {
            await patchTask(task.id, { notes: value });
            onChanged();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
        placeholder="Add details, links or instructions…"
        rows={4}
        aria-label="Task description"
        className="min-h-24 resize-y rounded-none rounded-b-xl border-0 shadow-none focus-visible:ring-0"
      />
      {bundle.project?.assignedContactId && task.visibility !== "internal" && (
        <p className="text-muted-foreground border-t px-4 py-2 text-[11px]">
          Your client sees this description. Use Comments for internal notes.
        </p>
      )}
    </section>
  );
}

// ── activity + comments ────────────────────────────────────────────────────

type ActivityFilter = "all" | "status" | "time";
const FILTER_TYPES: Record<ActivityFilter, string[] | null> = {
  all: null,
  status: ["created", "completed", "reopened", "status_changed", "priority_changed", "assignee_changed", "due_changed", "rolled_over", "renamed", "subtask_added", "occurrence_created"],
  time: ["time_tracked", "time_corrected"],
};

function when(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
}

function ActivityComments({
  bundle,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"activity" | "comments">("activity");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const rows = useMemo(
    () =>
      bundle.activity.filter(
        (a) => !FILTER_TYPES[filter] || FILTER_TYPES[filter]!.includes(a.type)
      ),
    [bundle.activity, filter]
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" className="flex gap-4 border-b px-5 pt-3">
        {(["activity", "comments"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2.5 text-sm font-semibold",
              tab === t ? "border-primary text-primary" : "text-muted-foreground border-transparent"
            )}
          >
            {t === "activity" ? "Activity" : `Comments${bundle.comments.length ? ` (${bundle.comments.length})` : ""}`}
          </button>
        ))}
      </div>
      {tab === "activity" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-3 flex justify-end">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ActivityFilter)}
              aria-label="Filter activity"
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              <option value="all">All activity</option>
              <option value="status">Status &amp; dates</option>
              <option value="time">Time tracking</option>
            </select>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recorded activity yet.</p>
          ) : (
            <ol className="space-y-4">
              {rows.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    a.actorKind === "client" ? "bg-teal-500/10 text-teal-700 dark:text-teal-300" : a.actorKind === "system" ? "bg-muted text-muted-foreground" : "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  )}>
                    {a.actorKind === "system" ? <Repeat className="h-3.5 w-3.5" /> : (a.actorName || "?").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-semibold">{a.actorName}</span>{" "}
                      <span className="text-muted-foreground">{a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {when(a.createdAt)}
                      {a.actorKind === "client" && " · Client"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <Comments bundle={bundle} onChanged={onChanged} />
      )}
    </div>
  );
}

function Comments({
  bundle,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-3">
        {bundle.comments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No comments yet.</p>
        ) : (
          bundle.comments.map((c) => (
            <div key={c.id} className="bg-muted/40 group rounded-lg px-3 py-2">
              <p className="flex items-center gap-2 text-xs">
                <span className="font-semibold">{c.authorName}</span>
                <span className="text-muted-foreground">{when(c.createdAt)}</span>
                {c.mine && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label="Delete comment"
                    onClick={async () => {
                      if (!confirm("Delete this comment?")) return;
                      await deleteComment(bundle.task.id, c.id).catch((e) => toast.error((e as Error).message));
                      onChanged();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </p>
              <p className="mt-1 text-sm whitespace-pre-line">{c.body}</p>
            </div>
          ))
        )}
      </div>
      <form
        className="border-t p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setBusy(true);
          try {
            await postComment(bundle.task.id, draft.trim());
            setDraft("");
            onChanged();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment…" rows={2} aria-label="New comment" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[11px]">Comments are internal — never shown to clients.</p>
          <Button type="submit" size="sm" disabled={busy || !draft.trim()}>Post</Button>
        </div>
      </form>
    </div>
  );
}

function MobileActivity({
  bundle,
  onChanged,
}: {
  bundle: TaskDetailBundle;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <span className="flex-1 text-sm font-semibold">Activity &amp; comments</span>
        <span className="text-muted-foreground text-xs">
          {bundle.activity.length} events · {bundle.comments.length} comments
        </span>
        <ChevronDown className={cn("text-muted-foreground h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="h-[28rem] border-t">
          <ActivityComments bundle={bundle} onChanged={onChanged} />
        </div>
      )}
    </section>
  );
}
