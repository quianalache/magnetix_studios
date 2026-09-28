"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Columns3,
  EyeOff,
  Flag,
  List,
  ListChecks,
  Loader,
  Plus,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { useTaskAssignees } from "@/hooks/use-task-assignees";
import { subscribeToProjectTasks } from "@/lib/firestore/tasks";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  PriorityFlag,
  STATUS_STYLE,
  StatusPill,
  statusLabel,
} from "@/components/tasks/task-meta";
import { createTaskApi, patchTask, setTaskCompleted } from "@/lib/client/task-detail-api";
import { formatDuration } from "@/types/time-tracking";
import { TASK_STATUSES, taskStatusOf, type Task, type TaskStatus } from "@/types/tasks";
import type { Project, ProjectMilestone } from "@/types/projects";

/**
 * Project Workspace views for TASK-based projects (Projects & Tasks Phase
 * 2): real project task records in List / Board / Calendar, milestones,
 * and recorded project activity. Step-based projects (everything created
 * before Phase 2) keep the Phase 1 step views — see project-workspace-tasks.
 */

export function useProjectTasks(project: Project | null) {
  const { user } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const { ready, filter } = useEffectiveTerritoryFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const projectId = project?.id ?? null;
  useEffect(() => {
    if (!user || !agencyId || !ready || !projectId) return;
    setLoading(true);
    const unsub = safeSubscribe(
      () =>
        subscribeToProjectTasks({ agencyId, subAccountId }, projectId, { territoryFilter: filter }, (l) => {
          setTasks(l);
          setLoading(false);
        }),
      () => setLoading(false)
    );
    return () => unsub?.();
  }, [user, agencyId, subAccountId, ready, filter, projectId]);
  return { tasks, loading };
}

function useAssigneeName(project: Project) {
  const { assignees } = useTaskAssignees();
  return (t: Task) =>
    t.assigneeContactId
      ? project.assignedContactName ?? "Client"
      : t.assigneeUid
        ? assignees.find((a) => a.uid === t.assigneeUid)?.name ?? "Team member"
        : null;
}

function dueLabel(t: Task): { text: string; tone: string } | null {
  const d = toDate(t.dueAt);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (t.completed) return { text: "Done", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (diff < 0) return { text: `${-diff}d overdue`, tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" };
  if (diff === 0) return { text: "Due today", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  if (diff === 1) return { text: "Due tomorrow", tone: "bg-pink-500/10 text-pink-700 dark:text-pink-300" };
  return { text: `In ${diff} days`, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" };
}

function fmtDay(d: Date | null) {
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

async function toggle(t: Task) {
  try {
    const r = await setTaskCompleted(t.id, !t.completed);
    if (r.warnings?.length) toast.warning(r.warnings.join(" "));
  } catch (err) {
    toast.error((err as Error).message);
  }
}

// ── overview ───────────────────────────────────────────────────────────────

export function TaskProjectOverview({
  project,
  tasks,
  loading,
  onOpenTask,
  onViewTasks,
}: {
  project: Project;
  tasks: Task[];
  loading: boolean;
  onOpenTask: (id: string) => void;
  onViewTasks: () => void;
}) {
  const assigneeName = useAssigneeName(project);
  const top = tasks.filter((t) => !t.parentTaskId);
  const inProgress = top.filter((t) => taskStatusOf(t) === "in_progress").length;
  const upcoming = top
    .filter((t) => !t.completed && toDate(t.dueAt))
    .sort((a, b) => toDate(a.dueAt)!.getTime() - toDate(b.dueAt)!.getTime())
    .slice(0, 5);
  const preview = [...top.filter((t) => !t.completed), ...top.filter((t) => t.completed)].slice(0, 5);
  const milestones = project.milestones ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card icon={BarChart3} title="Project Snapshot">
          <div className="grid grid-cols-2 gap-3">
            <Tile tone="bg-violet-500/10" icon={<ListChecks className="h-4 w-4 text-violet-600 dark:text-violet-300" />} value={project.stepCount} label="Total tasks" />
            <Tile tone="bg-emerald-500/10" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />} value={project.stepsDoneCount} label="Completed" />
            <Tile tone="bg-sky-500/10" icon={<Loader className="h-4 w-4 text-sky-600 dark:text-sky-300" />} value={inProgress} label="In progress" />
            <Tile tone="bg-pink-500/10" icon={<Flag className="h-4 w-4 text-pink-600 dark:text-pink-300" />} value={milestones.length} label="Milestones" />
          </div>
          {(project.timeSpentSeconds ?? 0) > 0 && (
            <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" /> {formatDuration(project.timeSpentSeconds ?? 0)} tracked
            </p>
          )}
        </Card>

        <Card icon={CalendarDays} title="Upcoming Deadlines" action={<button type="button" onClick={onViewTasks} className="text-primary text-xs font-medium hover:underline">View all</button>}>
          {loading ? (
            <div className="bg-muted/30 h-24 animate-pulse rounded-lg" />
          ) : upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open tasks with due dates.</p>
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((t) => {
                const due = dueLabel(t);
                return (
                  <li key={t.id} className="flex items-center gap-2">
                    <Checkbox checked={t.completed} onCheckedChange={() => toggle(t)} aria-label={`Complete ${t.title}`} />
                    <button type="button" onClick={() => onOpenTask(t.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm hover:underline">{t.title}</span>
                      <span className="text-muted-foreground text-xs">{fmtDay(toDate(t.dueAt))}</span>
                    </button>
                    {due && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", due.tone)}>{due.text}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <MilestonesCard project={project} milestones={milestones} />
      </div>

      <section className="bg-card rounded-2xl border">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <ListChecks className="h-4 w-4 text-violet-500" /> Task Preview
          </h2>
          <button type="button" onClick={onViewTasks} className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline">
            View all tasks <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {preview.length === 0 ? (
          <p className="text-muted-foreground px-5 py-6 text-sm">
            No tasks yet.{" "}
            <button type="button" onClick={onViewTasks} className="text-primary hover:underline">Add the first one</button>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wider uppercase">
                  <th className="w-10 px-5 py-2.5"><span className="sr-only">Done</span></th>
                  <th className="px-2 py-2.5">Task</th>
                  <th className="px-2 py-2.5">Due date</th>
                  <th className="px-2 py-2.5">Priority</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/40 cursor-pointer border-b last:border-b-0" onClick={() => onOpenTask(t.id)}>
                    <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={t.completed} onCheckedChange={() => toggle(t)} aria-label={`Complete ${t.title}`} />
                    </td>
                    <td className={cn("max-w-[280px] truncate px-2 py-2.5", t.completed && "text-muted-foreground line-through")}>{t.title}</td>
                    <td className="text-muted-foreground px-2 py-2.5 whitespace-nowrap">{fmtDay(toDate(t.dueAt))}</td>
                    <td className="px-2 py-2.5"><PriorityFlag priority={t.priority ?? null} /></td>
                    <td className="px-2 py-2.5"><StatusPill status={taskStatusOf(t)} /></td>
                    <td className="text-muted-foreground max-w-[140px] truncate px-2 py-2.5">{assigneeName(t) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {top.length > preview.length && (
          <p className="text-muted-foreground border-t px-5 py-2.5 text-xs">Showing {preview.length} of {top.length} tasks</p>
        )}
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof BarChart3;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-2xl border p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="h-4 w-4 text-violet-500" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tile({ tone, icon, value, label }: { tone: string; icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className={cn("rounded-xl p-3", tone)}>
      {icon}
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function MilestonesCard({
  project,
  milestones,
}: {
  project: Project;
  milestones: ProjectMilestone[];
}) {
  const { subAccountId } = useSubAccount();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const base = `/api/sub-accounts/${subAccountId}/projects/${project.id}/milestones`;
  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(b.error ?? "Couldn't update milestones.");
    }
  }
  const sorted = [...milestones].sort(
    (a, b) => (toDate(a.dueAt)?.getTime() ?? Infinity) - (toDate(b.dueAt)?.getTime() ?? Infinity)
  );
  const done = milestones.filter((m) => m.completedAt).length;
  return (
    <Card
      icon={Flag}
      title="Milestones"
      action={
        <button type="button" onClick={() => setAdding((v) => !v)} className="text-primary text-xs font-medium hover:underline">
          {adding ? "Cancel" : "Add"}
        </button>
      }
    >
      {milestones.length > 0 && (
        <div className="mb-3">
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round((done / milestones.length) * 100)}%` }} />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{done} of {milestones.length} reached</p>
        </div>
      )}
      {sorted.length === 0 && !adding ? (
        <p className="text-muted-foreground text-sm">No milestones yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((m) => {
            const d = toDate(m.dueAt);
            const overdue = d && !m.completedAt && d.getTime() < Date.now();
            return (
              <li key={m.id} className="group flex items-start gap-2">
                <button
                  type="button"
                  aria-label={m.completedAt ? `Reopen ${m.title}` : `Mark ${m.title} reached`}
                  onClick={() => call(`${base}/${m.id}`, "PATCH", { completed: !m.completedAt })}
                  className="mt-0.5"
                >
                  {m.completedAt ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-violet-400" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", m.completedAt && "text-muted-foreground line-through")}>{m.title}</p>
                  <p className={cn("text-xs", overdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                    {fmtDay(d)}
                    {m.offsetLabel ? ` · ${m.offsetLabel}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${m.title}`}
                  onClick={() => confirm(`Remove milestone “${m.title}”?`) && call(`${base}/${m.id}`, "DELETE")}
                  className="text-muted-foreground hover:text-destructive rounded p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <form
          className="mt-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await call(base, "POST", { title: title.trim(), dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null });
            setTitle("");
            setDue("");
            setAdding(false);
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone name" className="h-9" aria-label="Milestone name" />
          <div className="flex gap-2">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9" aria-label="Milestone date" />
            <Button type="submit" size="sm" className="h-9" disabled={!title.trim()}>Add</Button>
          </div>
        </form>
      )}
      {project.assignedContactId && milestones.length > 0 && (
        <p className="text-muted-foreground mt-3 text-[11px]">Milestones are visible to {project.assignedContactName ?? "your client"} in their portal.</p>
      )}
    </Card>
  );
}

// ── tasks tab ──────────────────────────────────────────────────────────────

type View = "list" | "board" | "calendar";

export function TaskProjectTasks({
  project,
  tasks,
  loading,
  onOpenTask,
}: {
  project: Project;
  tasks: Task[];
  loading: boolean;
  onOpenTask: (id: string) => void;
}) {
  const [view, setView] = useState<View>("list");
  const views: { id: View; label: string; icon: typeof List }[] = [
    { id: "list", label: "List", icon: List },
    { id: "board", label: "Board", icon: Columns3 },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
  ];
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Task view" className="bg-muted/60 flex w-fit gap-1 rounded-xl p-1">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              view === v.id ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <v.icon className="h-4 w-4" /> {v.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="bg-muted/30 h-48 animate-pulse rounded-2xl border" />
      ) : view === "list" ? (
        <TaskList project={project} tasks={tasks} onOpenTask={onOpenTask} />
      ) : view === "board" ? (
        <TaskBoard project={project} tasks={tasks} onOpenTask={onOpenTask} />
      ) : (
        <TaskCalendar project={project} tasks={tasks} onOpenTask={onOpenTask} />
      )}
    </div>
  );
}

function AddTask({ project, status }: { project: Project; status?: TaskStatus }) {
  const { subAccountId } = useSubAccount();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        setBusy(true);
        try {
          await createTaskApi(subAccountId, { title: t, projectId: project.id, ...(status ? { status } : {}) });
          setTitle("");
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" className="h-9" aria-label="New task title" />
      <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!title.trim() || busy}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add
      </Button>
    </form>
  );
}

function TaskList({
  project,
  tasks,
  onOpenTask,
}: {
  project: Project;
  tasks: Task[];
  onOpenTask: (id: string) => void;
}) {
  const assigneeName = useAssigneeName(project);
  const top = tasks.filter((t) => !t.parentTaskId);
  const subsOf = (id: string) => tasks.filter((t) => t.parentTaskId === id);
  const ordered = [...top.filter((t) => !t.completed), ...top.filter((t) => t.completed)];
  const row = (t: Task, nested = false) => {
    const due = dueLabel(t);
    return (
      <tr key={t.id} className="hover:bg-muted/40 cursor-pointer border-b last:border-b-0" onClick={() => onOpenTask(t.id)}>
        <td className="w-10 px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={t.completed} onCheckedChange={() => toggle(t)} aria-label={`Complete ${t.title}`} />
        </td>
        <td className={cn("max-w-[320px] py-2.5 pr-2", nested && "pl-6")}>
          <span className={cn("flex items-center gap-1.5 truncate", t.completed && "text-muted-foreground line-through")}>
            {nested && <span className="text-muted-foreground">↳</span>}
            {t.title}
            {t.visibility === "internal" && project.assignedContactId && (
              <EyeOff className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-label="Hidden from client" />
            )}
            {t.recurrence && <span className="text-muted-foreground text-xs">↻</span>}
          </span>
        </td>
        <td className="px-2 py-2.5 whitespace-nowrap">
          <span className="text-muted-foreground">{fmtDay(toDate(t.dueAt))}</span>
          {due && !t.completed && <span className={cn("ml-2 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium", due.tone)}>{due.text}</span>}
        </td>
        <td className="px-2 py-2.5"><PriorityFlag priority={t.priority ?? null} /></td>
        <td className="px-2 py-2.5"><StatusPill status={taskStatusOf(t)} /></td>
        <td className="text-muted-foreground max-w-[140px] truncate px-2 py-2.5">{assigneeName(t) ?? "—"}</td>
      </tr>
    );
  };
  return (
    <div className="bg-card overflow-hidden rounded-2xl border">
      {top.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-sm">No tasks yet — add the first one below.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wider uppercase">
                <th className="px-4 py-2.5"><span className="sr-only">Done</span></th>
                <th className="py-2.5 pr-2">Task</th>
                <th className="px-2 py-2.5">Due date</th>
                <th className="px-2 py-2.5">Priority</th>
                <th className="px-2 py-2.5">Status</th>
                <th className="px-2 py-2.5">Assignee</th>
              </tr>
            </thead>
            <tbody>{ordered.flatMap((t) => [row(t), ...subsOf(t.id).map((s) => row(s, true))])}</tbody>
          </table>
        </div>
      )}
      <div className="border-t p-3">
        <AddTask project={project} />
      </div>
    </div>
  );
}

function TaskBoard({
  project,
  tasks,
  onOpenTask,
}: {
  project: Project;
  tasks: Task[];
  onOpenTask: (id: string) => void;
}) {
  const assigneeName = useAssigneeName(project);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const top = tasks.filter((t) => !t.parentTaskId);
  async function onDragEnd(e: DragEndEvent) {
    const t = top.find((x) => x.id === e.active.id);
    const to = e.over?.id as TaskStatus | undefined;
    if (!t || !to || taskStatusOf(t) === to) return;
    try {
      const r = await patchTask(t.id, { status: to });
      if (r.warnings?.length) toast.warning(r.warnings.join(" "));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUSES.map((s) => {
          const items = top.filter((t) => taskStatusOf(t) === s.value);
          return (
            <BoardColumn key={s.value} status={s.value} count={items.length}>
              {items.map((t) => (
                <BoardCard key={t.id} task={t} subtasks={tasks.filter((x) => x.parentTaskId === t.id)} assignee={assigneeName(t)} onOpen={() => onOpenTask(t.id)} />
              ))}
              {s.value === "todo" && <AddTask project={project} />}
            </BoardColumn>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">Drag a card to change its status.</p>
    </DndContext>
  );
}

function BoardColumn({ status, count, children }: { status: TaskStatus; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={statusLabel(status)}
      className={cn("bg-muted/30 min-h-48 w-64 shrink-0 space-y-2 rounded-2xl border p-3 transition-colors", isOver && "border-primary/50 bg-primary/5")}
    >
      <h3 className="flex items-center gap-2 px-1 text-sm font-semibold">
        <span className={cn("h-2 w-2 rounded-full", STATUS_STYLE[status].dot)} />
        {statusLabel(status)}
        <span className="text-muted-foreground font-normal">({count})</span>
      </h3>
      {children}
    </section>
  );
}

function BoardCard({
  task,
  subtasks,
  assignee,
  onOpen,
}: {
  task: Task;
  subtasks: Task[];
  assignee: string | null;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const due = dueLabel(task);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("bg-card cursor-grab rounded-xl border p-3 shadow-xs active:cursor-grabbing", isDragging && "z-10 opacity-80 shadow-md")}
      {...listeners}
      {...attributes}
    >
      <button type="button" onClick={onOpen} onPointerDown={(e) => e.stopPropagation()} className={cn("text-left text-sm font-medium hover:underline", task.completed && "text-muted-foreground line-through")}>
        {task.title}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <PriorityFlag priority={task.priority ?? null} showLabel={false} />
        {due && <span className={cn("rounded-full px-1.5 py-0.5 font-medium", due.tone)}>{due.text}</span>}
        {subtasks.length > 0 && (
          <span className="text-muted-foreground">{subtasks.filter((s) => s.completed).length}/{subtasks.length} subtasks</span>
        )}
        {assignee && (
          <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/10 text-[10px] font-semibold text-violet-700 dark:text-violet-300" title={assignee}>
            {assignee.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function TaskCalendar({
  project,
  tasks,
  onOpenTask,
}: {
  project: Project;
  tasks: Task[];
  onOpenTask: (id: string) => void;
}) {
  const start = toDate(project.startAt);
  const due = toDate(project.dueAt);
  const [cursor, setCursor] = useState(() => {
    const first = tasks.map((t) => toDate(t.dueAt)).find(Boolean) ?? start ?? new Date();
    return new Date(first.getFullYear(), first.getMonth(), 1);
  });
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);
  const undated = tasks.filter((t) => !t.parentTaskId && !toDate(t.dueAt)).length;
  const today = new Date();
  return (
    <div className="space-y-2">
      <div className="bg-card overflow-hidden rounded-2xl border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-muted-foreground grid grid-cols-7 border-b text-center text-[11px] font-medium">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const muted = d.getMonth() !== cursor.getMonth();
            const dayTasks = tasks.filter((t) => { const x = toDate(t.dueAt); return x && sameDay(x, d); });
            const dayMilestones = (project.milestones ?? []).filter((m) => { const x = toDate(m.dueAt); return x && sameDay(x, d); });
            return (
              <div key={i} className={cn("min-h-24 border-r border-b p-1.5 text-xs [&:nth-child(7n)]:border-r-0", muted && "text-muted-foreground/50")}>
                <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full", sameDay(d, today) && "bg-primary text-primary-foreground")}>{d.getDate()}</span>
                <div className="mt-0.5 space-y-0.5">
                  {start && sameDay(d, start) && <p className="truncate rounded bg-teal-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-teal-700 dark:text-teal-300">Project starts</p>}
                  {due && sameDay(d, due) && <p className="truncate rounded bg-pink-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-pink-700 dark:text-pink-300">Project due</p>}
                  {dayMilestones.map((m) => (
                    <p key={m.id} className="truncate rounded bg-violet-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-700 dark:text-violet-300">⚑ {m.title}</p>
                  ))}
                  {dayTasks.slice(0, 3).map((t) => (
                    <button key={t.id} type="button" onClick={() => onOpenTask(t.id)} className={cn("flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10.5px] hover:bg-muted", t.completed && "text-muted-foreground line-through")}>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_STYLE[taskStatusOf(t)].dot)} />
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                  {dayTasks.length > 3 && <p className="text-muted-foreground px-1 text-[10px]">+{dayTasks.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {undated > 0 && <p className="text-muted-foreground text-xs">{undated} {undated === 1 ? "task has" : "tasks have"} no due date and {undated === 1 ? "isn't" : "aren't"} shown on the calendar.</p>}
    </div>
  );
}

// ── activity ───────────────────────────────────────────────────────────────

interface ProjectActivityRow {
  id: string;
  actorName: string;
  actorKind: string;
  summary: string;
  taskTitle: string;
  taskId: string;
  createdAt: string | null;
}

export function TaskProjectActivity({
  project,
  onOpenTask,
}: {
  project: Project;
  onOpenTask: (id: string) => void;
}) {
  const { subAccountId } = useSubAccount();
  const [rows, setRows] = useState<ProjectActivityRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/projects/${project.id}/activity`)
      .then((r) => (r.ok ? r.json() : { activity: [] }))
      .then((d: { activity: ProjectActivityRow[] }) => !cancelled && setRows(d.activity ?? []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [subAccountId, project.id, project.updatedAt]);
  if (rows === null) return <div className="bg-muted/30 h-48 animate-pulse rounded-2xl border" />;
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-2xl border p-6 text-sm">No recorded activity yet.</p>
      ) : (
        <ol className="bg-card divide-y rounded-2xl border">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", a.actorKind === "client" ? "bg-teal-500/10 text-teal-700 dark:text-teal-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300")}>
                {(a.actorName || "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <span className="font-semibold">{a.actorName}</span>{" "}
                  <span className="text-muted-foreground">{a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</span>
                  {a.taskId && a.taskTitle && (
                    <>
                      {" · "}
                      <button type="button" onClick={() => onOpenTask(a.taskId)} className="text-primary hover:underline">{a.taskTitle}</button>
                    </>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  {a.createdAt ? new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                  {a.actorKind === "client" && " · Client"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-muted-foreground text-xs">Recorded activity only. Timer starts and stops are summarized as one &ldquo;tracked&rdquo; entry.</p>
    </div>
  );
}
