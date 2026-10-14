"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FolderKanban,
  Circle,
  Clock,
  Home,
  ListChecks,
  Pencil,
  UserRound,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useProjectsData } from "@/hooks/use-projects-data";
import { subscribeToProjectSteps } from "@/lib/firestore/projects";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { toDate } from "@/lib/format";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
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
import { ProjectDialog } from "@/components/projects/project-dialog";
import { setProjectStatus } from "@/components/projects/projects-list";
import { useProjectStepActions } from "@/components/projects/project-step-actions";
import {
  ClientAddedBadge,
  ProjectWorkspaceTasks,
} from "@/components/projects/project-workspace-tasks";
import { ProjectWorkspaceActivity } from "@/components/projects/project-workspace-activity";
import {
  TaskProjectActivity,
  TaskProjectOverview,
  TaskProjectTasks,
  useProjectTasks,
} from "@/components/projects/project-task-views";
import { TaskDetailModal } from "@/components/tasks/detail/task-detail-modal";
import { formatDuration } from "@/types/time-tracking";
import { useSearchParams } from "next/navigation";
import {
  projectProgressPct,
  projectTaskModel,
  type Project,
  type ProjectStep,
} from "@/types/projects";

/**
 * Project Workspace (approved mockup 04 — the SIMPLIFIED version): Back to
 * Projects, one header (name, single description, status, dates, progress),
 * and exactly three tabs — Overview · Tasks · Activity. No quick links, no
 * permanent right sidebar, no cover image requirement. Editing, archiving
 * and deleting stay in the existing Edit Project sheet, opened contextually.
 *
 * The project is looked up inside the CURRENT sub-account's project list
 * (never by bare id), so a URL for another tenant's project renders
 * "not found" rather than leaking it.
 */

type Tab = "overview" | "tasks" | "activity";

function formatDay(d: Date | null): string {
  return d
    ? d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not set";
}

export default function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const { subAccountId, saPath } = useSubAccount();
  const { projects, templates, contacts, loading } = useProjectsData();
  const [steps, setSteps] = useState<ProjectStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );
  // Phase 2: task-based projects read real project tasks; step-based
  // (pre-Phase-2) projects keep their checklist views below.
  const isTaskProject = !!project && projectTaskModel(project) === "tasks";
  const { tasks: projectTasks, loading: tasksLoading } = useProjectTasks(
    isTaskProject ? project : null
  );
  const searchParams = useSearchParams();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  useEffect(() => {
    const id = searchParams.get("task");
    if (id) setOpenTaskId(id);
  }, [searchParams]);

  useEffect(() => {
    if (!project || project.taskModel === "tasks") {
      setStepsLoading(false);
      return;
    }
    setStepsLoading(true);
    const unsub = safeSubscribe(
      () =>
        subscribeToProjectSteps(project.id, subAccountId, (l) => {
          setSteps(l);
          setStepsLoading(false);
        }),
      () => setStepsLoading(false)
    );
    return () => unsub?.();
    // Re-subscribe only when the project identity changes, not on every
    // parent-doc update (step counts bump the parent on each toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, subAccountId]);

  if (loading) {
    return <PageShellLoading width="data" />;
  }

  if (!project) {
    return (
      <PageShell width="data">
        <BackLink href={saPath("/projects")} />
        <h1 className="sr-only">Project not found</h1>
        <EmptyState
          icon={FolderKanban}
          title="Project not found"
          description="It may have been deleted, or it belongs to another workspace."
        />
      </PageShell>
    );
  }

  const pct = projectProgressPct(project);
  const start = toDate(project.startAt);
  const due = toDate(project.dueAt);
  const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "tasks", label: "Tasks", icon: ListChecks },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  return (
    <PageShell width="data">
      <BackLink
        href={saPath(
          project.status === "archived" ? "/projects/archived" : "/projects"
        )}
      />

      <header className="grid gap-5 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-title-lg font-semibold tracking-tight break-words text-foreground">
              {project.title}
            </h1>
            <StatusMenu
              project={project}
              onChange={(status) =>
                setProjectStatus(subAccountId, project, status)
              }
            />
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit project
            </Button>
          </div>
          {project.description && (
            <p className="max-w-3xl text-body-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {project.description}
            </p>
          )}
          <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-1">
            <Meta icon={CalendarDays} label="Start date" value={formatDay(start)} />
            <Meta icon={CalendarDays} label="Due date" value={formatDay(due)} />
            <Meta
              icon={project.assignedContactId ? UserRound : Briefcase}
              label={project.assignedContactId ? "Client" : "Type"}
              value={
                project.assignedContactId ? (
                  <Link
                    href={saPath(`/contacts/${project.assignedContactId}`)}
                    className="hover:text-primary hover:underline"
                  >
                    {project.assignedContactName || "View contact"}
                  </Link>
                ) : (
                  "Internal project"
                )
              }
            />
          </dl>
        </div>
        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <div className="flex items-baseline justify-between">
            <p className="text-section font-semibold">Overall Progress</p>
            <p className="text-title-lg font-semibold text-link tabular-nums">
              {pct}%
            </p>
          </div>
          <div className="bg-muted mt-3 h-2.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            {project.stepsDoneCount} of {project.stepCount}{" "}
            {project.stepCount === 1 ? "task" : "tasks"} completed
          </p>
          {isTaskProject && (project.timeSpentSeconds ?? 0) > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {formatDuration(project.timeSpentSeconds ?? 0)} tracked
            </p>
          )}
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Project workspace"
        className="flex gap-5 overflow-x-auto border-b border-border"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-0.5 pt-1 pb-2.5 text-body-sm font-medium whitespace-nowrap transition-colors",
              tab === t.id
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>

      {isTaskProject ? (
        <>
          {tab === "overview" && (
            <TaskProjectOverview
              project={project}
              tasks={projectTasks}
              loading={tasksLoading}
              onOpenTask={setOpenTaskId}
              onViewTasks={() => setTab("tasks")}
            />
          )}
          {tab === "tasks" && (
            <TaskProjectTasks
              project={project}
              tasks={projectTasks}
              loading={tasksLoading}
              onOpenTask={setOpenTaskId}
            />
          )}
          {tab === "activity" && (
            <TaskProjectActivity project={project} onOpenTask={setOpenTaskId} />
          )}
          <TaskDetailModal
            taskId={openTaskId}
            open={!!openTaskId}
            onOpenChange={(o) => {
              if (o) return;
              setOpenTaskId(null);
              if (searchParams.get("task")) router.replace(saPath(`/projects/${project.id}`));
            }}
          />
        </>
      ) : (
        <>
          {tab === "overview" && (
            <WorkspaceOverview
              project={project}
              steps={steps}
              stepsLoading={stepsLoading}
              onViewTasks={() => setTab("tasks")}
            />
          )}
          {tab === "tasks" && (
            <ProjectWorkspaceTasks
              project={project}
              steps={steps}
              onEditProject={() => setEditOpen(true)}
            />
          )}
          {tab === "activity" && (
            <ProjectWorkspaceActivity project={project} steps={steps} />
          )}
        </>
      )}

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contacts={contacts}
        templates={templates}
        project={project}
        onDeleted={() => {
          router.replace(saPath("/projects"));
        }}
      />
    </PageShell>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      Back to Projects
    </Link>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Home;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tag-violet-bg text-tag-violet-fg">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="text-sm font-semibold">{value}</dd>
      </div>
    </div>
  );
}

function StatusMenu({
  project,
  onChange,
}: {
  project: Project;
  onChange: (status: "active" | "archived") => void;
}) {
  const active = project.status === "active";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Status: ${active ? "Active" : "Archived"}. Change status`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              active
                ? "bg-tag-green-bg text-tag-green-fg"
                : "bg-muted text-muted-foreground"
            )}
          />
        }
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-status-success-dot" : "bg-muted-foreground"
          )}
        />
        {active ? "Active" : "Archived"}
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem
          onClick={() => !active && onChange("active")}
          disabled={active}
        >
          Active (current)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => active && onChange("archived")}
          disabled={!active}
        >
          Archive project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceOverview({
  project,
  steps,
  stepsLoading,
  onViewTasks,
}: {
  project: Project;
  steps: ProjectStep[];
  stepsLoading: boolean;
  onViewTasks: () => void;
}) {
  const { setDone } = useProjectStepActions(project.id);
  const start = toDate(project.startAt);
  const due = toDate(project.dueAt);
  const created = toDate(project.createdAt);
  const remaining = Math.max(0, project.stepCount - project.stepsDoneCount);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let dueNote: { text: string; tone: string } | null = null;
  if (due) {
    const dueDay = new Date(due);
    dueDay.setHours(0, 0, 0, 0);
    const diff = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
    dueNote =
      project.stepCount > 0 && remaining === 0
        ? { text: "All tasks complete", tone: "bg-tag-green-bg text-tag-green-fg" }
        : diff < 0
          ? { text: `${-diff} ${diff === -1 ? "day" : "days"} overdue`, tone: "bg-status-danger-bg text-status-danger-fg" }
          : diff === 0
            ? { text: "Due today", tone: "bg-status-warning-bg text-status-warning-fg" }
            : { text: `${diff} ${diff === 1 ? "day" : "days"} left`, tone: "bg-tag-violet-bg text-tag-violet-fg" };
  }

  // Limited preview: open tasks first, in checklist order.
  const preview = [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)].slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <OverviewCard icon={BarChart3} title="Project Snapshot">
          <div className="grid grid-cols-2 gap-3">
            <SnapTile tone="bg-tag-violet-bg" icon={<ListChecks className="h-4 w-4 text-tag-violet-fg" />} value={project.stepCount} label="Total tasks" />
            <SnapTile tone="bg-tag-green-bg" icon={<CheckCircle2 className="h-4 w-4 text-tag-green-fg" />} value={project.stepsDoneCount} label="Completed" />
            <SnapTile tone="bg-tag-blue-bg" icon={<Circle className="h-4 w-4 text-tag-blue-fg" />} value={remaining} label="Remaining" />
            <SnapTile tone="bg-tag-pink-bg" icon={<BarChart3 className="h-4 w-4 text-tag-pink-fg" />} value={`${projectProgressPct(project)}%`} label="Progress" />
          </div>
        </OverviewCard>

        <OverviewCard icon={CalendarDays} title="Key Dates">
          <ul className="space-y-3 text-sm">
            <DateRow label="Start date" value={start} />
            <DateRow label="Due date" value={due} badge={dueNote} />
            <DateRow label="Created" value={created} />
          </ul>
        </OverviewCard>

        <OverviewCard
          icon={project.assignedContactId ? UserRound : Briefcase}
          title={project.assignedContactId ? "Client Project" : "Internal Project"}
        >
          {project.assignedContactId ? (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Shared with{" "}
              <span className="text-foreground font-medium">
                {project.assignedContactName || "this client"}
              </span>{" "}
              in their Client Portal. They see these tasks and can check them
              off, add, or remove them.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Only your team sees this project. Assign a client from Edit
              project to share it in their Client Portal.
            </p>
          )}
          {project.sourceOfferId && (
            <p className="text-muted-foreground mt-3 text-xs">
              Created automatically from an offer purchase.
            </p>
          )}
        </OverviewCard>
      </div>

      <section className="rounded-card border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 text-section font-semibold">
            <ListChecks className="h-4 w-4 text-link" />
            Task Preview
          </h2>
          <button
            type="button"
            onClick={onViewTasks}
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            View all tasks <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {stepsLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-control bg-muted" />
            ))}
          </div>
        ) : preview.length === 0 ? (
          <p className="text-muted-foreground px-5 py-6 text-sm">
            No tasks yet.{" "}
            <button type="button" onClick={onViewTasks} className="text-primary hover:underline">
              Add the first one
            </button>
            .
          </p>
        ) : (
          <ul>
            {preview.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0">
                <Checkbox
                  checked={s.done}
                  onCheckedChange={(v) => setDone(s, v === true)}
                  aria-label={s.done ? `Reopen ${s.title}` : `Complete ${s.title}`}
                />
                <span className={cn("min-w-0 flex-1 truncate text-sm", s.done && "text-muted-foreground line-through")}>
                  {s.title}
                </span>
                <ClientAddedBadge step={s} project={project} />
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-micro font-medium",
                    s.done
                      ? "bg-tag-green-bg text-tag-green-fg"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {s.done ? "Done" : "To do"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {steps.length > preview.length && (
          <p className="text-muted-foreground border-t px-5 py-2.5 text-xs">
            Showing {preview.length} of {steps.length} tasks
          </p>
        )}
      </section>
    </div>
  );
}

function OverviewCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Home;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-card">
      <h2 className="mb-4 flex items-center gap-2 text-section font-semibold">
        <Icon className="h-4 w-4 text-link" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function SnapTile({
  tone,
  icon,
  value,
  label,
}: {
  tone: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className={cn("rounded-control p-3", tone)}>
      {icon}
      <p className="mt-1.5 text-title-md font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function DateRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: Date | null;
  badge?: { text: string; tone: string } | null;
}) {
  return (
    <li className="flex items-center gap-3">
      <Clock className="text-muted-foreground h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium">{formatDay(value)}</p>
      </div>
      {badge && (
        <span className={cn("rounded-full px-2 py-0.5 text-micro font-medium whitespace-nowrap", badge.tone)}>
          {badge.text}
        </span>
      )}
    </li>
  );
}
