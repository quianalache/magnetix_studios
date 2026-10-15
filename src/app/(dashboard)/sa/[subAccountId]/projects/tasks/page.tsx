"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Repeat,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { toDate } from "@/lib/format";
import { DATA_TABLE_HEAD_ROW } from "@/components/system/data-table";
import { SearchField } from "@/components/system/search-field";
import { OptionSelect } from "@/components/system/option-select";
import { EmptyState } from "@/components/system/empty-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { TaskItem } from "@/components/tasks/task-item";
import {
  Pagination,
  ProjectsMetric,
  ProjectsShell,
  usePaged,
} from "@/components/projects/projects-shell";
import type { Contact } from "@/types/contacts";
import { taskStatusOf, type Task } from "@/types/tasks";
import type { Project } from "@/types/projects";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { subscribeToProjects } from "@/lib/firestore/projects";
import { useTaskAssignees } from "@/hooks/use-task-assignees";
import { PriorityFlag, StatusPill } from "@/components/tasks/task-meta";
import { TaskDetailModal } from "@/components/tasks/detail/task-detail-modal";

/**
 * Projects → My Tasks (approved mockup 02). The existing CRM Tasks page,
 * relocated under Projects and restyled — NOT a new task system. Same
 * `tasks` subscription + territory filter, same TaskDialog, same
 * `/api/tasks/[id]/complete` route (so `task.completed` webhooks,
 * activity rows and workflow triggers still fire), same Calendar /
 * contact / deal links.
 *
 * Phase 2: Project, Status, Priority, Assigned to and Internal/Client type
 * now come from the real task / project records (legacy tasks simply show
 * "—"). Rows open the Task Detail modal; `?task=<id>` deep-links one.
 */

type StatusFilter =
  | "open"
  | "mine"
  | "today"
  | "overdue"
  | "upcoming"
  | "done"
  | "all";
type TaskStatus = "overdue" | "today" | "upcoming" | "no_date" | "done";
type SortKey = "due" | "created" | "title";
type ViewMode = "list" | "grid";

const PAGE_SIZE = 10;
const VIEW_STORAGE_KEY = "mx_tasks_view";

const FILTER_LABELS: Record<StatusFilter, string> = {
  open: "All open",
  mine: "Assigned to me",
  today: "Due today",
  overdue: "Overdue",
  upcoming: "Upcoming",
  done: "Completed",
  all: "All tasks",
};

const SORT_LABELS: Record<SortKey, string> = {
  due: "Due date",
  created: "Recently created",
  title: "Title",
};

function dayStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Same bucketing rules the Tasks page has always used. */
function taskStatus(t: Task, now: number, today: number): TaskStatus {
  if (t.completed) return "done";
  const d = toDate(t.dueAt);
  if (!d) return "no_date";
  const day = dayStart(d);
  if (d.getTime() < now && day < today) return "overdue";
  if (day === today) return "today";
  return "upcoming";
}

function relativeDue(d: Date, today: number): string {
  const diff = Math.round((dayStart(d) - today) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "1 day overdue";
  if (diff < 0) return `${-diff} days overdue`;
  return `${diff} days left`;
}

const STATUS_PILL: Record<TaskStatus, { label: string; cls: string }> = {
  overdue: {
    label: "Overdue",
    cls: "bg-status-danger-bg text-status-danger-fg",
  },
  today: {
    label: "Due today",
    cls: "bg-status-warning-bg text-status-warning-fg",
  },
  upcoming: {
    label: "Upcoming",
    cls: "bg-tag-violet-bg text-tag-violet-fg",
  },
  no_date: { label: "No due date", cls: "bg-muted text-muted-foreground" },
  done: {
    label: "Completed",
    cls: "bg-tag-green-bg text-tag-green-fg",
  },
};

export default function MyTasksPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  // Routine activities live server-side (personal routines stay private),
  // so they come from the routines API instead of the tasks subscription.
  const [routineTasks, setRoutineTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("due");
  const [view, setView] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const { assignees, viewerUid } = useTaskAssignees();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // `?filter=<status>` deep link (Calendar → Upcoming Deadlines → View all)
  // selects one of the existing status filters, then drops the param so a
  // later filter change isn't undone by a refresh. Unknown values are ignored.
  useEffect(() => {
    const requested = searchParams.get("filter");
    if (!requested || !(requested in FILTER_LABELS)) return;
    setStatusFilter(requested as StatusFilter);
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  // `?task=<id>` deep link (Task Detail → Copy link).
  useEffect(() => {
    const id = searchParams.get("task");
    if (id) setDetailId(id);
  }, [searchParams]);
  function closeDetail(open: boolean) {
    if (open) return;
    if (detailId?.startsWith("rt_")) void loadRoutineTasks();
    setDetailId(null);
    if (searchParams.get("task")) router.replace(pathname);
  }

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = safeSubscribe(
      () => subscribeToProjects({ agencyId, subAccountId }, setProjects),
      () => setProjects([])
    );
    return () => unsub?.();
  }, [user, agencyId, subAccountId, authLoading]);
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );
  const assigneeName = (t: Task) =>
    t.assigneeContactId
      ? (t.projectId ? projectById.get(t.projectId)?.assignedContactName : null) ?? "Client"
      : t.assigneeUid
        ? assignees.find((a) => a.uid === t.assigneeUid)?.name ?? "Team member"
        : null;

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    if (!filterReady) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let tasksReady = false;
    let contactsReady = false;
    const settle = () => {
      if (tasksReady && contactsReady) setLoading(false);
    };
    const unsubT = safeSubscribe(
      () =>
        subscribeToTasks(scope, { territoryFilter }, (l) => {
          setTasks(l);
          tasksReady = true;
          settle();
        }),
      () => {
        tasksReady = true;
        settle();
      }
    );
    const unsubC = safeSubscribe(
      () =>
        subscribeToContacts(scope, { territoryFilter }, (l) => {
          setContacts(l);
          contactsReady = true;
          settle();
        }),
      () => {
        contactsReady = true;
        settle();
      }
    );
    return () => {
      unsubT?.();
      unsubC?.();
    };
  }, [user, agencyId, subAccountId, authLoading, filterReady, territoryFilter]);

  const loadRoutineTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/routines/activities`);
      if (!res.ok) return;
      const body = (await res.json()) as { tasks: Record<string, unknown>[] };
      const date = (v: unknown) => (typeof v === "string" ? new Date(v) : null);
      // ISO strings → Dates (toDate() reads both Timestamps and Dates).
      setRoutineTasks(
        body.tasks.map(
          (t) =>
            ({
              ...t,
              dueAt: date(t.dueAt),
              completedAt: date(t.completedAt),
              createdAt: date(t.createdAt),
              updatedAt: date(t.updatedAt),
            }) as unknown as Task
        )
      );
    } catch {
      /* routines are optional here — ordinary tasks still show */
    }
  }, [subAccountId]);
  useEffect(() => {
    if (authLoading || !user) return;
    void loadRoutineTasks();
  }, [authLoading, user, loadRoutineTasks]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      /* per-viewer convenience only */
    }
  }, []);
  function changeView(v: ViewMode) {
    setView(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => setPage(1), [statusFilter, search, sort]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const { withStatus, counts, today } = useMemo(() => {
    const now = Date.now();
    const todayMs = dayStart(new Date());
    const rows = [...tasks, ...routineTasks]
      .filter((t) => !t.archived && !(t.projectId && projectById.get(t.projectId)?.status === "archived"))
      .map((t) => ({ t, status: taskStatus(t, now, todayMs) }))
      // A routine activity whose day has passed unfinished is a missed
      // occurrence — it stays in the routine's history, not in Overdue.
      .filter((r) => !(r.t.routineId && r.status === "overdue"));
    const c = { overdue: 0, today: 0, upcoming: 0, done: 0 };
    for (const r of rows) {
      if (r.status === "overdue") c.overdue++;
      else if (r.status === "today") c.today++;
      else if (r.status === "done") c.done++;
      else c.upcoming++; // upcoming + no due date, as before
    }
    return { withStatus: rows, counts: c, today: todayMs };
  }, [tasks, routineTasks, projectById]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = withStatus.filter(({ t, status }) => {
      switch (statusFilter) {
        case "open":
          if (status === "done") return false;
          break;
        case "mine":
          if (status === "done" || !viewerUid || t.assigneeUid !== viewerUid)
            return false;
          break;
        case "today":
          // Legacy "Today" view included overdue work, so keep that.
          if (status !== "today" && status !== "overdue") return false;
          break;
        case "overdue":
          if (status !== "overdue") return false;
          break;
        case "upcoming":
          if (status !== "upcoming" && status !== "no_date") return false;
          break;
        case "done":
          if (status !== "done") return false;
          break;
      }
      if (!q) return true;
      const contact = t.contactId ? contactById.get(t.contactId) : undefined;
      const project = t.projectId ? projectById.get(t.projectId) : undefined;
      return (
        (project?.title ?? "").toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.notes ?? "").toLowerCase().includes(q) ||
        (contact?.name ?? "").toLowerCase().includes(q)
      );
    });
    const ms = (v: Task["dueAt"]) => toDate(v)?.getTime() ?? null;
    list.sort((a, b) => {
      if (sort === "title") return a.t.title.localeCompare(b.t.title);
      if (sort === "created")
        return (
          (toDate(b.t.createdAt)?.getTime() ?? 0) -
          (toDate(a.t.createdAt)?.getTime() ?? 0)
        );
      const da = ms(a.t.dueAt);
      const db = ms(b.t.dueAt);
      if (da === null) return db === null ? 0 : 1;
      if (db === null) return -1;
      return statusFilter === "done" ? db - da : da - db;
    });
    return list;
  }, [withStatus, statusFilter, search, sort, contactById, projectById, viewerUid]);

  const paged = usePaged(shown, PAGE_SIZE, page);

  function openNew() {
    setEditTask(null);
    setDialogOpen(true);
  }
  function openEdit(task: Task) {
    setDetailId(task.id);
  }

  async function toggleComplete(task: Task) {
    if (toggling.has(task.id)) return;
    setToggling((s) => new Set(s).add(task.id));
    try {
      // Server route so task.completed fires + the activity is logged.
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !task.completed }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        error?: string;
        warnings?: string[];
      };
      if (!res.ok) toast.error(b.error ?? "Couldn't update task.");
      else if (b.warnings?.length) toast.warning(b.warnings.join(" "));
      if (task.routineId) await loadRoutineTasks();
    } finally {
      setToggling((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <ProjectsShell
      active="tasks"
      actions={
        <Button className="h-11 px-5" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Task
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricButton onClick={() => setStatusFilter("today")}>
          <ProjectsMetric
            icon={<CalendarDays className="h-5 w-5" />}
            tone="bg-tag-pink-bg text-tag-pink-fg"
            value={loading ? "–" : counts.today}
            label="Due today"
            hint={
              counts.today === 0
                ? "No tasks due today"
                : `${counts.today} due today`
            }
          />
        </MetricButton>
        <MetricButton onClick={() => setStatusFilter("overdue")}>
          <ProjectsMetric
            icon={<AlertCircle className="h-5 w-5" />}
            tone="bg-status-danger-bg text-status-danger-fg"
            value={loading ? "–" : counts.overdue}
            label="Overdue"
            hint={`${counts.overdue} ${counts.overdue === 1 ? "task" : "tasks"} past due`}
          />
        </MetricButton>
        <MetricButton onClick={() => setStatusFilter("upcoming")}>
          <ProjectsMetric
            icon={<Clock className="h-5 w-5" />}
            tone="bg-tag-violet-bg text-tag-violet-fg"
            value={loading ? "–" : counts.upcoming}
            label="Upcoming"
            hint="Later or no due date"
          />
        </MetricButton>
        <MetricButton onClick={() => setStatusFilter("done")}>
          <ProjectsMetric
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="bg-tag-aqua-bg text-tag-aqua-fg"
            value={loading ? "–" : counts.done}
            label="Completed"
            hint="Finished tasks"
          />
        </MetricButton>
      </div>

      <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <h2 className="text-title-md font-semibold tracking-tight">
            My Tasks{" "}
            <span className="font-normal text-muted-foreground">
              ({shown.length})
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <SearchField value={search} onChange={setSearch} placeholder="Search tasks…" aria-label="Search tasks" className="sm:w-56" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" />}
              >
                <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                {FILTER_LABELS[statusFilter]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((f) => (
                  <DropdownMenuItem key={f} onClick={() => setStatusFilter(f)}>
                    <span className={cn(statusFilter === f && "font-semibold")}>
                      {FILTER_LABELS[f]}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <OptionSelect
              aria-label="Sort tasks"
              value={sort}
              onChange={(next) => next && setSort(next)}
              options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: `Sort: ${SORT_LABELS[k]}` }))}
              className="w-48"
            />
            <div
              className="flex items-center gap-1 rounded-control border border-border bg-card p-1"
              role="group"
              aria-label="Display"
            >
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => changeView("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                aria-label="Card view"
                aria-pressed={view === "grid"}
                onClick={() => changeView("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-control bg-muted"
              />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={tasks.length === 0
                ? "No tasks yet"
                : search
                  ? "No tasks match your search"
                  : `Nothing in “${FILTER_LABELS[statusFilter]}”`}
            description={tasks.length === 0
                ? "Add your first follow-up or reminder."
                : "Try another filter, or add a task."}
            action={
              <Button onClick={openNew}>
                <Plus className="mr-1 h-4 w-4" />
                New task
              </Button>
            }
          />
        ) : view === "grid" ? (
          <div className="grid gap-2 md:grid-cols-2">
            {paged.rows.map(({ t }) => (
              <TaskItem
                key={t.id}
                task={t}
                contact={t.contactId ? contactById.get(t.contactId) : undefined}
                onClick={openEdit}
              />
            ))}
          </div>
        ) : (
          <>
            {/* Phones: task cards — the 9-column table never squeezes into 390px. */}
            <div className="grid gap-2 md:hidden">
              {paged.rows.map(({ t }) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  contact={t.contactId ? contactById.get(t.contactId) : undefined}
                  onClick={openEdit}
                />
              ))}
            </div>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-body-sm">
                <thead>
                  <tr className={DATA_TABLE_HEAD_ROW}>
                    <th className="w-10 px-3 py-3">
                      <span className="sr-only">Complete</span>
                    </th>
                    <th className="px-3 py-3">Task</th>
                    <th className="px-3 py-3">Project / Routine</th>
                    <th className="px-3 py-3">Due date</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Priority</th>
                    <th className="px-3 py-3">Assigned to</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="w-12 px-3 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map(({ t, status }) => {
                    const due = toDate(t.dueAt);
                    const contact = t.contactId
                      ? contactById.get(t.contactId)
                      : undefined;
                    const project = t.projectId ? projectById.get(t.projectId) : undefined;
                    const who = assigneeName(t);
                    const workflow = taskStatusOf(t);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => openEdit(t)}
                        className={cn(
                          "cursor-pointer border-b border-border-subtle transition-colors hover:bg-tint-violet transition-colors last:border-b-0",
                          t.completed && "opacity-60"
                        )}
                      >
                        <td
                          className="px-3 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={t.completed}
                            onCheckedChange={() => toggleComplete(t)}
                            disabled={toggling.has(t.id)}
                            aria-label={
                              t.completed
                                ? `Reopen ${t.title}`
                                : `Mark ${t.title} complete`
                            }
                          />
                        </td>
                        <td className="max-w-[300px] px-3 py-3">
                          <p
                            className={cn(
                              "truncate font-semibold",
                              t.completed && "line-through"
                            )}
                          >
                            {t.title}
                          </p>
                          {(t.parentTaskId || contact || t.notes) && (
                            <p className="text-muted-foreground truncate text-xs">
                              {t.parentTaskId && "Subtask · "}
                              {contact ? (
                                <Link
                                  href={saPath(`/contacts/${contact.id}`)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:text-primary hover:underline"
                                >
                                  {contact.name || contact.email}
                                </Link>
                              ) : (
                                t.notes
                              )}
                            </p>
                          )}
                        </td>
                        <td className="max-w-[180px] px-3 py-3">
                          {project ? (
                            <Link
                              href={saPath(`/projects/${project.id}`)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-2 truncate hover:underline"
                            >
                              <span className={cn("h-3.5 w-1 shrink-0 rounded-full", project.assignedContactId ? "bg-teal-400" : "bg-violet-400")} />
                              <span className="truncate">{project.title}</span>
                            </Link>
                          ) : t.routineId ? (
                            <Link
                              href={saPath(`/projects/routines?routine=${encodeURIComponent(t.routineId)}${t.occurrenceDate ? `&date=${t.occurrenceDate}` : ""}`)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-2 truncate hover:underline"
                            >
                              <Repeat className="h-3.5 w-3.5 shrink-0 text-link" />
                              <span className="truncate">{t.routineName || "Routine"}</span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {due ? (
                            <>
                              <p>
                                {due.toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </p>
                              {!t.completed && (
                                <p
                                  className={cn(
                                    "text-xs",
                                    status === "overdue"
                                      ? "text-status-danger-fg"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {relativeDue(due, today)}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {status === "overdue" ? (
                            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_PILL.overdue.cls)}>
                              Overdue
                            </span>
                          ) : (
                            <StatusPill status={workflow} />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <PriorityFlag priority={t.priority ?? null} />
                        </td>
                        <td className="max-w-[160px] px-3 py-3">
                          {who ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint-violet text-overline font-semibold text-tag-violet-fg">
                                {who.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="truncate text-sm">{who}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {project ? (
                            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", project.assignedContactId && t.visibility !== "internal" ? "bg-tag-aqua-bg text-tag-aqua-fg" : "bg-tag-violet-bg text-tag-violet-fg")}>
                              {project.assignedContactId && t.visibility !== "internal" ? "Client" : "Internal"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td
                          className="px-3 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Actions for ${t.title}`}
                                />
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(t)}>
                                Open task
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toggleComplete(t)}
                              >
                                {t.completed ? "Reopen" : "Mark complete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && shown.length > 0 && (
          <Pagination
            page={paged.page}
            pageCount={paged.pageCount}
            total={shown.length}
            pageSize={PAGE_SIZE}
            noun={shown.length === 1 ? "task" : "tasks"}
            onPage={setPage}
          />
        )}
      </section>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        task={editTask}
      />
      <TaskDetailModal
        taskId={detailId}
        open={!!detailId}
        onOpenChange={closeDetail}
      />
    </ProjectsShell>
  );
}

function MetricButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-visible:ring-ring rounded-card text-left transition-transform outline-none hover:-translate-y-0.5 focus-visible:ring-2"
    >
      {children}
    </button>
  );
}
