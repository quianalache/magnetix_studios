"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  LayoutTemplate,
  Plus,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useProjectsData } from "@/hooks/use-projects-data";
import { toDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectDialog } from "@/components/projects/project-dialog";
import {
  ProjectsMetric,
  ProjectsShell,
} from "@/components/projects/projects-shell";
import {
  ProjectsEmptyState,
  ProjectsList,
  TypePill,
} from "@/components/projects/projects-list";
import { projectProgressPct, type Project } from "@/types/projects";

/**
 * Projects → Overview (approved mockup 01). Metrics, the compact deadline
 * strip and the list are all computed from the live `projects` records —
 * nothing is hard-coded. "Tasks" on a project are its existing checklist
 * steps (the project-step ↔ CRM-task integration is a separate, not-yet-
 * approved phase).
 */
export default function ProjectsOverviewPage() {
  const router = useRouter();
  const { saPath } = useSubAccount();
  const { projects, templates, contacts, loading } = useProjectsData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);

  const active = useMemo(
    () => projects.filter((p) => p.status === "active"),
    [projects]
  );

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const totalTasks = active.reduce((s, p) => s + (p.stepCount || 0), 0);
    const dueThisWeek = active.filter((p) => {
      const d = toDate(p.dueAt);
      return d && d >= today && d < weekEnd;
    }).length;
    const avg =
      active.length === 0
        ? 0
        : Math.round(
            active.reduce((s, p) => s + projectProgressPct(p), 0) /
              active.length
          );
    const upcoming = active
      .map((p) => ({ p, due: toDate(p.dueAt) }))
      .filter((x): x is { p: Project; due: Date } => !!x.due && x.due >= today)
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 3);
    return { totalTasks, dueThisWeek, avg, upcoming };
  }, [active]);

  function openNew() {
    setEditProject(null);
    setDialogOpen(true);
  }

  return (
    <ProjectsShell
      active="overview"
      actions={
        <div className="flex">
          <Button className="h-11 rounded-r-none px-5" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Project
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className="h-11 rounded-l-none border-l border-white/20 px-3"
                  aria-label="More ways to start a project"
                />
              }
            >
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => router.push(saPath("/projects/templates"))}
              >
                <LayoutTemplate className="mr-2 h-4 w-4" />
                Start from a template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectsMetric
          icon={<FolderOpen className="h-5 w-5" />}
          tone="bg-violet-500/10 text-violet-600 dark:text-violet-300"
          value={loading ? "–" : active.length}
          label="Active projects"
        />
        <ProjectsMetric
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="bg-teal-500/10 text-teal-600 dark:text-teal-300"
          value={loading ? "–" : stats.totalTasks}
          label="Total project tasks"
        />
        <ProjectsMetric
          icon={<CalendarDays className="h-5 w-5" />}
          tone="bg-pink-500/10 text-pink-600 dark:text-pink-300"
          value={loading ? "–" : stats.dueThisWeek}
          label="Projects due this week"
        />
        <ProjectsMetric
          icon={<ProgressRing pct={stats.avg} />}
          tone="bg-transparent"
          value={loading ? "–" : `${stats.avg}%`}
          label="Average project progress"
        />
      </div>

      <section className="rounded-2xl border bg-gradient-to-br from-pink-50/70 to-violet-50/40 p-4 dark:from-pink-500/5 dark:to-violet-500/5">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-pink-600 dark:text-pink-300" />
          <h2 className="text-lg font-semibold">Upcoming Project Deadlines</h2>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-card/60 h-20 animate-pulse rounded-xl border"
              />
            ))}
          </div>
        ) : stats.upcoming.length === 0 ? (
          <p className="text-muted-foreground px-1 pb-1 text-sm">
            No upcoming due dates. Add a due date to an active project to see
            it here.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {stats.upcoming.map(({ p, due }) => {
              const remaining = Math.max(
                0,
                (p.stepCount || 0) - (p.stepsDoneCount || 0)
              );
              return (
                <Link
                  key={p.id}
                  href={saPath(`/projects/${p.id}`)}
                  className="bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border p-3 shadow-xs transition-colors"
                >
                  <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-pink-500/10 text-pink-700 dark:text-pink-300">
                    <span className="text-[10px] font-semibold uppercase">
                      {due.toLocaleDateString(undefined, { month: "short" })}
                    </span>
                    <span className="text-base leading-none font-bold">
                      {due.getDate()}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {p.title}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      {remaining} {remaining === 1 ? "task" : "tasks"}{" "}
                      remaining
                      <TypePill project={p} />
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <ProjectsList
        projects={active}
        mode="active"
        loading={loading}
        onEdit={(p) => {
          setEditProject(p);
          setDialogOpen(true);
        }}
        emptyState={
          <ProjectsEmptyState
            title="No active projects"
            desc="Start one for yourself, or assign one to a client."
            action={
              <Button onClick={openNew}>
                <Plus className="mr-1 h-4 w-4" />
                New project
              </Button>
            }
          />
        }
      />

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        templates={templates}
        project={editProject}
      />
    </ProjectsShell>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90" aria-hidden>
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="5"
        className="stroke-violet-500/15"
      />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * Math.min(100, Math.max(0, pct))) / 100}
        className="stroke-violet-500"
      />
    </svg>
  );
}
