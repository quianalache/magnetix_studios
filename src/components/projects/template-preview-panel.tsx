"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Crown,
  Flag,
  FolderKanban,
  ListChecks,
  Pencil,
  Repeat,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  TEMPLATE_RECURRENCE_LABELS,
  buildTimeline,
  formatEstimate,
  totalEstimatedMinutes,
  type LibraryTemplate,
  type TemplatePriority,
  type TemplateTimeBlock,
} from "@/lib/projects/template-library";
import { CategoryBadge, SourceBadge } from "@/components/projects/template-badges";

/**
 * Template preview (approved mockup 03, right-hand panel), restoring the
 * original Momentum OS preview (`ESe` + `CSe`): stats strip, estimated
 * workload, Timeline Overview (bar with milestone dots + day-by-day list),
 * tasks with offset label / time block / estimate / tags / priority,
 * numbered milestones, and routines with recurrence. Week grouping is the
 * mockup's presentation of the same day-by-day data — no week titles are
 * invented.
 */

type PreviewTab = "overview" | "tasks" | "milestones" | "routines";

export function PriorityDot({ priority }: { priority: TemplatePriority | null }) {
  if (!priority) return null;
  return (
    <span
      title={`${priority[0].toUpperCase()}${priority.slice(1)} priority`}
      className={cn(
        "mt-1 h-2 w-2 shrink-0 rounded-full",
        priority === "high" && "bg-rose-500",
        priority === "medium" && "bg-amber-400",
        priority === "low" && "bg-muted-foreground/50"
      )}
    />
  );
}

export function TimeBlockChip({ block }: { block: TemplateTimeBlock | null }) {
  if (!block) return null;
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        block === "AM" && "bg-teal-500/10 text-teal-700 dark:text-teal-300",
        block === "Midday" &&
          "bg-violet-500/10 text-violet-700 dark:text-violet-300",
        block === "PM" && "bg-pink-500/10 text-pink-700 dark:text-pink-300",
        block === "Anytime" && "bg-muted text-muted-foreground"
      )}
    >
      {block}
    </span>
  );
}

const WEEK_DOT = ["bg-violet-500", "bg-pink-500", "bg-teal-500", "bg-amber-400"];

export function TemplatePreviewPanel({
  template,
  favorite,
  onToggleFavorite,
  onClose,
  onGenerate,
  onEdit,
  className,
}: {
  template: LibraryTemplate;
  favorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
  /** Workspace templates only — opens the existing New Project flow. */
  onGenerate?: () => void;
  /** Workspace templates only — opens the existing template editor. */
  onEdit?: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState<PreviewTab>("overview");
  const minutes = totalEstimatedMinutes(template);
  const hours = minutes > 0 ? (minutes / 60).toFixed(1) : null;
  const timeline = useMemo(() => buildTimeline(template), [template]);
  const isSystem = template.source === "system";

  const tabs: { id: PreviewTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "tasks", label: "Tasks", count: template.tasks.length },
    ...(template.milestones.length > 0
      ? [
          {
            id: "milestones" as const,
            label: "Milestones",
            count: template.milestones.length,
          },
        ]
      : []),
    ...(template.routines.length > 0
      ? [
          {
            id: "routines" as const,
            label: "Routines",
            count: template.routines.length,
          },
        ]
      : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "overview";

  return (
    <aside
      aria-label={`${template.name} preview`}
      className={cn("bg-card flex flex-col overflow-hidden", className)}
    >
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
          <FolderKanban className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">Template preview</p>
          <h2 className="text-lg leading-snug font-semibold">
            {template.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <SourceBadge template={template} />
            <CategoryBadge template={template} />
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          className="hover:bg-muted rounded-md p-1.5"
        >
          <Star
            className={cn(
              "h-4 w-4",
              favorite
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground"
            )}
          />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="hover:bg-muted rounded-md p-1.5"
        >
          <X className="text-muted-foreground h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {template.description && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {template.description}
          </p>
        )}

        <dl className="grid grid-cols-4 divide-x rounded-xl border text-center">
          <Stat
            icon={<ListChecks className="h-4 w-4" />}
            value={template.tasks.length}
            label="Tasks"
          />
          <Stat
            icon={<Flag className="h-4 w-4" />}
            value={template.milestones.length}
            label="Milestones"
          />
          <Stat
            icon={<Repeat className="h-4 w-4" />}
            value={template.routines.length}
            label="Routines"
          />
          <Stat
            icon={<CalendarDays className="h-4 w-4" />}
            value={template.durationDays ? `${template.durationDays}` : "—"}
            label="Days"
          />
        </dl>
        {hours && (
          <p className="text-muted-foreground -mt-2 flex items-center gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5" />~{hours} hrs estimated total work
          </p>
        )}

        <div
          role="tablist"
          aria-label="Template preview sections"
          className="flex flex-wrap gap-1 border-b pb-2"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === t.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t.label}
              {t.count !== undefined && ` (${t.count})`}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-5">
            {template.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-pink-500/10 px-2.5 py-0.5 text-xs text-pink-700 dark:text-pink-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {timeline.length > 0 ? (
              <TimelineOverview template={template} />
            ) : template.tasks.length > 0 ? (
              <div className="rounded-xl border p-4">
                <p className="text-sm font-semibold">Checklist</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {template.tasks.length}{" "}
                  {template.tasks.length === 1 ? "step" : "steps"}, in order.
                  This template has no day-by-day schedule.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                No workflow items yet.
                {!isSystem && " Edit this template to add steps."}
              </p>
            )}
          </div>
        )}

        {activeTab === "tasks" && (
          <ul className="space-y-2">
            {template.tasks.map((task, i) => (
              <li
                key={`${task.title}-${i}`}
                className="bg-muted/30 flex items-start gap-2 rounded-xl border px-3 py-2"
              >
                <PriorityDot priority={task.priority} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug font-medium">
                    {task.title}
                  </p>
                  {(task.offsetLabel || task.timeBlock || task.estimatedMinutes) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {task.offsetLabel && (
                        <span className="text-muted-foreground text-[11px]">
                          {task.offsetLabel}
                        </span>
                      )}
                      <TimeBlockChip block={task.timeBlock} />
                      {formatEstimate(task.estimatedMinutes) && (
                        <span className="text-muted-foreground flex items-center gap-0.5 text-[11px]">
                          <Clock className="h-3 w-3" />
                          {formatEstimate(task.estimatedMinutes)}
                        </span>
                      )}
                    </div>
                  )}
                  {task.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {task.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="bg-background text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {template.tasks.length === 0 && (
              <li className="text-muted-foreground text-sm">No tasks.</li>
            )}
          </ul>
        )}

        {activeTab === "milestones" && (
          <ol className="space-y-2">
            {template.milestones.map((m, i) => (
              <li
                key={`${m.title}-${i}`}
                className="flex items-center gap-3 rounded-xl border px-3 py-2"
              >
                <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.title}</p>
                  {m.offsetLabel && (
                    <p className="text-muted-foreground text-[11px]">
                      {m.offsetLabel}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  Day {m.dayOffset}
                </span>
              </li>
            ))}
          </ol>
        )}

        {activeTab === "routines" && (
          <ul className="space-y-2">
            {template.routines.map((r, i) => (
              <li
                key={`${r.title}-${i}`}
                className="flex items-start gap-3 rounded-xl border px-3 py-2"
              >
                <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.title}</p>
                  {r.description && (
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {r.description}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">
                      {TEMPLATE_RECURRENCE_LABELS[r.recurrenceType] ??
                        r.recurrenceType}
                    </span>
                    {r.recurrenceType === "daily" && (
                      <span className="text-muted-foreground">· Every Day</span>
                    )}
                    <TimeBlockChip block={r.timeBlock} />
                    {r.estimatedMinutes ? (
                      <span className="text-muted-foreground">
                        {r.estimatedMinutes}m
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t p-4">
        <div className="rounded-xl border bg-violet-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Use this template
          </p>
          {isSystem ? (
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              <Crown className="mr-1 inline h-3 w-3" />
              System templates are read-only. Generating a scheduled project
              from one — with dated tasks, milestones and routines — isn&apos;t
              available yet; it arrives with project task scheduling.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mt-1 text-xs">
                Create a new project with this template&apos;s steps, for a
                client or for internal use.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={onEdit}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Edit Template
                </Button>
                <Button onClick={onGenerate}>
                  <Zap className="mr-1.5 h-4 w-4" />
                  Generate Project
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="px-2 py-3">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-center justify-center gap-1.5 text-lg font-semibold tabular-nums">
        <span className="text-violet-500">{icon}</span>
        {value}
      </dd>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function TimelineOverview({ template }: { template: LibraryTemplate }) {
  const days = useMemo(() => buildTimeline(template), [template]);
  const total = Math.max(template.durationDays ?? 1, 1);
  const weeks = useMemo(() => {
    const map = new Map<number, typeof days>();
    for (const d of days) {
      const w = Math.floor(d.day / 7);
      map.set(w, [...(map.get(w) ?? []), d]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [days]);
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(weeks.length ? [weeks[0][0]] : [])
  );

  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <CalendarDays className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold">Project timeline</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {total} day workflow
        </span>
      </div>
      <div className="px-4 pt-4 pb-2">
        <div className="relative h-2 rounded-full bg-gradient-to-r from-teal-300/60 via-violet-300/60 to-pink-300/60">
          {template.milestones.map((m, i) => (
            <span
              key={`${m.title}-${i}`}
              title={`${m.title} (Day ${m.dayOffset})`}
              className="border-card absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 bg-violet-600"
              style={{
                left: `${Math.min((m.dayOffset / total) * 100, 97)}%`,
              }}
            />
          ))}
        </div>
        <div className="text-muted-foreground mt-1.5 flex justify-between text-[10px]">
          <span>Day 0</span>
          <span>Day {total}</span>
        </div>
      </div>
      <ol className="space-y-2 px-4 pb-4">
        {weeks.map(([week, weekDays], wi) => {
          const isOpen = open.has(week);
          const taskCount = weekDays.reduce(
            (s, d) => s + d.items.filter((x) => x.type === "task").length,
            0
          );
          const msCount = weekDays.reduce(
            (s, d) => s + d.items.filter((x) => x.type === "milestone").length,
            0
          );
          const first = week * 7;
          return (
            <li key={week} className="rounded-lg border">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(week)) next.delete(week);
                    else next.add(week);
                    return next;
                  })
                }
                className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    WEEK_DOT[wi % WEEK_DOT.length]
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    Week {week + 1}
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · Days {first}–{first + 6}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {taskCount} {taskCount === 1 ? "task" : "tasks"}
                    {msCount > 0 &&
                      ` · ${msCount} ${msCount === 1 ? "milestone" : "milestones"}`}
                  </span>
                </span>
                {isOpen ? (
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-4 w-4" />
                )}
              </button>
              {isOpen && (
                <div className="space-y-1.5 border-t px-3 py-2">
                  {weekDays.map((d) => (
                    <div key={d.day} className="flex items-start gap-3">
                      <span className="text-muted-foreground w-12 shrink-0 pt-0.5 text-right text-[10px] font-medium">
                        Day {d.day}
                      </span>
                      <div className="flex-1 space-y-1">
                        {d.items.map((item, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            {item.type === "milestone" ? (
                              <Flag className="mt-0.5 h-3 w-3 shrink-0 text-violet-600" />
                            ) : (
                              <PriorityDot priority={item.priority} />
                            )}
                            <span
                              className={cn(
                                "text-xs leading-tight",
                                item.type === "milestone"
                                  ? "font-semibold"
                                  : "text-muted-foreground"
                              )}
                            >
                              {item.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
