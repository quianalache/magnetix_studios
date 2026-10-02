"use client";

import { useMemo, useState } from "react";
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
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Info,
  List,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useProjectStepActions } from "@/components/projects/project-step-actions";
import type { Project, ProjectStep } from "@/types/projects";

/**
 * Project Workspace → Tasks. One tab, three views (approved): List ·
 * Board · Calendar. The rows are the project's existing checklist steps —
 * the same records the Client Portal shows for client projects — so
 * add / complete / delete here is exactly what the Edit Project sheet did.
 *
 * Steps only carry `title` + `done` today (no due date, priority,
 * assignee or in-progress state), so:
 * - Board has two honest columns, To do / Done (drag between them).
 * - Calendar can only place the project's own start + due dates; per-task
 *   scheduling arrives with the project-task integration (Phase 2).
 */

type View = "list" | "board" | "calendar";

export function ProjectWorkspaceTasks({
  project,
  steps,
  onEditProject,
}: {
  project: Project;
  steps: ProjectStep[];
  onEditProject?: () => void;
}) {
  const [view, setView] = useState<View>("list");
  const views: { id: View; label: string; icon: typeof List }[] = [
    { id: "list", label: "List", icon: List },
    { id: "board", label: "Board", icon: Columns3 },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
  ];
  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Task view"
        className="bg-muted/60 flex w-fit gap-1 rounded-xl p-1"
      >
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              view === v.id
                ? "bg-background text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <v.icon className="h-4 w-4" />
            {v.label}
          </button>
        ))}
      </div>
      {view === "list" && <StepList project={project} steps={steps} onEditProject={onEditProject} />}
      {view === "board" && <StepBoard project={project} steps={steps} />}
      {view === "calendar" && <ProjectCalendar project={project} />}
    </div>
  );
}

function AddStepInput({
  projectId,
  placeholder = "Add a task…",
}: {
  projectId: string;
  placeholder?: string;
}) {
  const { addStep } = useProjectStepActions(projectId);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    if (await addStep(value)) setValue("");
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="New task title"
        className="h-9"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={submit}
        disabled={!value.trim() || busy}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

export function ClientAddedBadge({
  step,
  project,
}: {
  step: ProjectStep;
  project: Project;
}) {
  if (!step.createdByMemberId) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10.5px] font-medium text-teal-700 dark:text-teal-300"
      title="Added from the Client Portal"
    >
      <UserRound className="h-3 w-3" />
      {project.assignedContactName
        ? `Added by ${project.assignedContactName}`
        : "Added by client"}
    </span>
  );
}

function StepList({
  project,
  steps,
  onEditProject,
}: {
  project: Project;
  steps: ProjectStep[];
  onEditProject?: () => void;
}) {
  const { setDone, deleteStep } = useProjectStepActions(project.id);
  const open = steps.filter((s) => !s.done);
  const done = steps.filter((s) => s.done);
  const row = (s: ProjectStep) => (
    <li
      key={s.id}
      role={onEditProject ? "button" : undefined}
      tabIndex={onEditProject ? 0 : undefined}
      aria-label={onEditProject ? "Edit project for " + s.title : undefined}
      onClick={() => onEditProject?.()}
      onKeyDown={(event) => {
        if (onEditProject && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onEditProject();
        }
      }}
      className={cn(
        "group hover:bg-muted/40 flex items-center gap-3 border-b px-4 py-3 last:border-b-0",
        onEditProject && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      <span onClick={(event) => event.stopPropagation()}>
        <Checkbox
        checked={s.done}
        onCheckedChange={(v) => setDone(s, v === true)}
        aria-label={s.done ? `Reopen ${s.title}` : `Complete ${s.title}`}
        />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-sm",
          s.done && "text-muted-foreground line-through"
        )}
      >
        {s.title}
      </span>
      <ClientAddedBadge step={s} project={project} />
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          s.done
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-muted text-muted-foreground"
        )}
      >
        {s.done ? "Done" : "To do"}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          deleteStep(s);
        }}
        aria-label={`Delete ${s.title}`}
        className="text-muted-foreground hover:text-destructive rounded-md p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
  return (
    <div className="bg-card overflow-hidden rounded-2xl border">
      {steps.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-sm">
          No tasks yet — add the first one below.
        </p>
      ) : (
        <ul>
          {open.map(row)}
          {done.length > 0 && (
            <li className="bg-muted/30 text-muted-foreground border-b px-4 py-2 text-xs font-semibold tracking-wider uppercase">
              Completed ({done.length})
            </li>
          )}
          {done.map(row)}
        </ul>
      )}
      <div className="border-t p-3">
        {onEditProject && steps.length > 0 && (
          <p className="text-muted-foreground mb-2 text-xs">
            These are legacy checklist steps. Select a row to edit the project; shared Task Detail is available for modern task-based projects.
          </p>
        )}
        <AddStepInput projectId={project.id} />
      </div>
    </div>
  );
}

function StepBoard({
  project,
  steps,
}: {
  project: Project;
  steps: ProjectStep[];
}) {
  const { setDone } = useProjectStepActions(project.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  function onDragEnd(e: DragEndEvent) {
    const step = steps.find((s) => s.id === e.active.id);
    if (!step || !e.over) return;
    const toDone = e.over.id === "done";
    if (step.done !== toDone) setDone(step, toDone);
  }
  const columns: { id: "todo" | "done"; label: string; items: ProjectStep[] }[] =
    [
      { id: "todo", label: "To do", items: steps.filter((s) => !s.done) },
      { id: "done", label: "Done", items: steps.filter((s) => s.done) },
    ];
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-2">
        {columns.map((col) => (
          <BoardColumn key={col.id} id={col.id} label={col.label} count={col.items.length}>
            {col.items.map((s) => (
              <BoardCard key={s.id} step={s} project={project} />
            ))}
            {col.id === "todo" && (
              <div className="pt-1">
                <AddStepInput projectId={project.id} />
              </div>
            )}
          </BoardColumn>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Drag a card between columns, or use its checkbox.
      </p>
    </DndContext>
  );
}

function BoardColumn({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "bg-muted/30 min-h-40 space-y-2 rounded-2xl border p-3 transition-colors",
        isOver && "border-primary/50 bg-primary/5"
      )}
    >
      <h3 className="flex items-center gap-2 px-1 text-sm font-semibold">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            id === "done" ? "bg-emerald-500" : "bg-violet-500"
          )}
        />
        {label}
        <span className="text-muted-foreground font-normal">({count})</span>
      </h3>
      {children}
    </section>
  );
}

function BoardCard({ step, project }: { step: ProjectStep; project: Project }) {
  const { setDone } = useProjectStepActions(project.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: step.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "bg-card flex cursor-grab items-start gap-2 rounded-xl border p-3 shadow-xs active:cursor-grabbing",
        isDragging && "z-10 opacity-80 shadow-md"
      )}
      {...listeners}
      {...attributes}
    >
      <span
        onPointerDown={(e) => e.stopPropagation()}
        className="pt-0.5"
      >
        <Checkbox
          checked={step.done}
          onCheckedChange={(v) => setDone(step, v === true)}
          aria-label={step.done ? `Reopen ${step.title}` : `Complete ${step.title}`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm",
            step.done && "text-muted-foreground line-through"
          )}
        >
          {step.title}
        </p>
        <div className="mt-1">
          <ClientAddedBadge step={step} project={project} />
        </div>
      </div>
    </div>
  );
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function ProjectCalendar({ project }: { project: Project }) {
  const start = toDate(project.startAt);
  const due = toDate(project.dueAt);
  const [cursor, setCursor] = useState(() => {
    const anchor = due ?? start ?? new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
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
  const today = new Date();

  const inRange = (d: Date) => {
    if (!start || !due) return false;
    const t = new Date(d).setHours(12, 0, 0, 0);
    return t >= new Date(start).setHours(0, 0, 0, 0) && t <= new Date(due).setHours(23, 59, 59, 999);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
        <span className="text-muted-foreground">
          Project tasks don&apos;t have their own due dates yet, so the
          calendar shows the project&apos;s start and due dates. Scheduled
          tasks arrive with project task scheduling.
        </span>
      </div>
      <div className="bg-card overflow-hidden rounded-2xl border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">
            {cursor.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous month"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Next month"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-muted-foreground grid grid-cols-7 border-b text-center text-[11px] font-medium">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const isStart = start && sameDay(d, start);
            const isDue = due && sameDay(d, due);
            const muted = d.getMonth() !== cursor.getMonth();
            return (
              <div
                key={i}
                className={cn(
                  "min-h-20 border-r border-b p-1.5 text-xs [&:nth-child(7n)]:border-r-0",
                  muted && "text-muted-foreground/50",
                  inRange(d) && !muted && "bg-violet-500/5"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full",
                    sameDay(d, today) && "bg-primary text-primary-foreground"
                  )}
                >
                  {d.getDate()}
                </span>
                {isStart && (
                  <p className="mt-1 truncate rounded bg-teal-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-teal-700 dark:text-teal-300">
                    Project starts
                  </p>
                )}
                {isDue && (
                  <p className="mt-1 truncate rounded bg-pink-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-pink-700 dark:text-pink-300">
                    Project due
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {!start && !due && (
        <p className="text-muted-foreground text-sm">
          This project has no start or due date yet — add them from Edit
          project.
        </p>
      )}
    </div>
  );
}
