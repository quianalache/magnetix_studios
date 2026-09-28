"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  FolderPlus,
  Info,
  ListPlus,
  type LucideIcon,
} from "lucide-react";
import { toDate } from "@/lib/format";
import type { Project, ProjectStep } from "@/types/projects";

/**
 * Project Workspace → Activity. Projects have no audit log, so this tab
 * shows ONLY events that the stored records actually prove: when the
 * project was created (and from what), when each task was added and by
 * which side (team vs client portal), and which tasks are done. Nothing
 * is fabricated; the footnote says what isn't recorded.
 */

interface ActivityEvent {
  id: string;
  at: Date | null;
  icon: LucideIcon;
  tone: string;
  title: string;
  detail?: string;
}

/** Steps written in the same batch as the project (template / purchase grant) land within a few seconds of it. */
const CREATION_BATCH_MS = 10_000;

export function ProjectWorkspaceActivity({
  project,
  steps,
}: {
  project: Project;
  steps: ProjectStep[];
}) {
  const events = useMemo(() => {
    const out: ActivityEvent[] = [];
    const createdAt = toDate(project.createdAt);
    const clientName = project.assignedContactName || "the client";
    const byClient = (s: { createdByMemberId: string | null }) =>
      !!s.createdByMemberId;

    const initial = steps.filter((s) => {
      const at = toDate(s.createdAt);
      return (
        createdAt &&
        at &&
        at.getTime() - createdAt.getTime() < CREATION_BATCH_MS &&
        (project.templateId || project.sourceOfferId || project.sourceTemplateId)
      );
    });
    const initialIds = new Set(initial.map((s) => s.id));

    const origin = project.sourceOfferId
      ? "Granted from an offer purchase"
      : project.templateId || project.sourceTemplateId
        ? "Started from a template"
        : null;
    out.push({
      id: "created",
      at: createdAt,
      icon: FolderPlus,
      tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
      title: byClient(project)
        ? `Project started by ${clientName} in the Client Portal`
        : "Project created",
      detail: [
        origin,
        initial.length > 0
          ? `${initial.length} ${initial.length === 1 ? "task" : "tasks"} included`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    });

    for (const s of steps) {
      if (initialIds.has(s.id)) continue;
      out.push({
        id: `added-${s.id}`,
        at: toDate(s.createdAt),
        icon: ListPlus,
        tone: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
        title: byClient(s)
          ? `${clientName} added a task`
          : "Task added",
        detail: s.title,
      });
    }
    for (const s of steps) {
      if (!s.done) continue;
      out.push({
        id: `done-${s.id}`,
        at: toDate(s.updatedAt),
        icon: CheckCircle2,
        tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
        title: "Task completed",
        detail: s.title,
      });
    }
    return out.sort(
      (a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)
    );
  }, [project, steps]);

  return (
    <div className="space-y-3">
      <ol className="bg-card divide-y rounded-2xl border">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${e.tone}`}
            >
              <e.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{e.title}</p>
              {e.detail && (
                <p className="text-muted-foreground truncate text-sm">
                  {e.detail}
                </p>
              )}
            </div>
            <time className="text-muted-foreground shrink-0 text-xs">
              {e.at
                ? e.at.toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "—"}
            </time>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Built from recorded timestamps. Completion times show each task&apos;s
        last update. Edits, deletions and date changes aren&apos;t recorded
        for projects yet.
      </p>
    </div>
  );
}
