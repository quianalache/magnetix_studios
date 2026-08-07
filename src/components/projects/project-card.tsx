"use client";

import { User } from "lucide-react";
import { toDate } from "@/lib/format";
import { projectProgressPct, type Project } from "@/types/projects";

/**
 * Mirrors the real MomentumOS project card exactly (title + status pill,
 * description, Start/Due dates, progress bar, "No milestones added yet"
 * fallback) — audited from the "Momentum OS — Daily Flow" artifact rather
 * than redesigned. The one addition MomentumOS itself has no concept of:
 * the "For: <name>" pill when a project is assigned to a client, per her
 * ask for "some sort of bubble or something."
 */
export function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const pct = projectProgressPct(project);
  const start = toDate(project.startAt);
  const due = toDate(project.dueAt);

  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold leading-snug">{project.title}</p>
        {project.status === "active" && (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Active
          </span>
        )}
      </div>

      {project.assignedContactId && (
        <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <User className="h-3 w-3" />
          For {project.assignedContactName || "a client"}
        </span>
      )}

      {project.description && (
        <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
          {project.description}
        </p>
      )}

      {(start || due) && (
        <div className="mt-3 flex gap-3.5 text-[11.5px] text-muted-foreground">
          {start && <span>Start: {start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
          {due && <span>Due: {due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
        </div>
      )}

      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>Progress</span>
        <span className="tabular-nums">{pct}%</span>
      </div>

      {project.stepCount === 0 ? (
        <p className="mt-3 border-t pt-3 text-[11.5px] italic text-muted-foreground">
          No milestones added yet.
        </p>
      ) : (
        <p className="mt-3 border-t pt-3 text-[11.5px] text-muted-foreground">
          {project.stepsDoneCount} of {project.stepCount} steps done
        </p>
      )}
    </button>
  );
}
