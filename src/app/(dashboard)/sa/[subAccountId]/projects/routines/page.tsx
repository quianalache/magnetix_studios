"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderKanban, Plus, Repeat, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToProjects } from "@/lib/firestore/projects";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { deleteRoutineApi, listRoutinesApi, updateRoutineApi } from "@/lib/client/routines-api";
import { ProjectsShell } from "@/components/projects/projects-shell";
import { RoutineCard } from "@/components/routines/routine-card";
import { RoutineEditorDialog } from "@/components/routines/routine-editor-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TASK_RECURRENCE_LABELS, type TaskRecurrenceType } from "@/types/tasks";
import type { Project } from "@/types/projects";
import type { ProjectRoutineItem, RoutineListItem, RoutineView } from "@/types/routines";

type Filter = "all" | "active" | "paused";
type Sort = "next" | "name" | "recent";

/**
 * Projects → Routines. Named groups of recurring activities that don't need
 * a project. Cards + filters on the left; a routine opens in its dedicated
 * full-page workspace.
 */
function RoutinesPageInner() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<RoutineListItem[]>([]);
  const [projectRoutines, setProjectRoutines] = useState<ProjectRoutineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("next");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RoutineView | null>(null);
  const [editorStep, setEditorStep] = useState<0 | 1 | 2 | 3>(0);
  const [deleting, setDeleting] = useState<RoutineView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await listRoutinesApi(subAccountId);
      setItems(r.routines);
      setProjectRoutines(r.projectRoutines);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [subAccountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    return safeSubscribe(
      () => subscribeToProjects({ agencyId, subAccountId }, setProjects),
      () => {}
    );
  }, [authLoading, user, agencyId, subAccountId]);

  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((i) => i.routine.status === "active").length,
      paused: items.filter((i) => i.routine.status === "paused").length,
    }),
    [items]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((i) => {
      if (filter !== "all" && i.routine.status !== filter) return false;
      if (!q) return true;
      return (
        i.routine.name.toLowerCase().includes(q) ||
        i.routine.description.toLowerCase().includes(q) ||
        i.routine.activities.some((a) => a.title.toLowerCase().includes(q)) ||
        (i.routine.projectTitle ?? "").toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      if (sort === "name") return a.routine.name.localeCompare(b.routine.name);
      if (sort === "recent") return (b.routine.createdAt ?? "").localeCompare(a.routine.createdAt ?? "");
      // Next occurrence; paused / finished routines sink to the end.
      const an = a.nextDate ?? "9999";
      const bn = b.nextDate ?? "9999";
      return an === bn ? a.routine.name.localeCompare(b.routine.name) : an.localeCompare(bn);
    });
  }, [items, search, filter, sort]);

  const shownProjectRoutines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (filter === "paused") return [];
    return projectRoutines.filter(
      (p) => !q || p.title.toLowerCase().includes(q) || p.projectTitle.toLowerCase().includes(q)
    );
  }, [projectRoutines, search, filter]);

  function openEditor(routine: RoutineView | null, step: 0 | 1 | 2 | 3 = 0) {
    setEditing(routine);
    setEditorStep(step);
    setEditorOpen(true);
  }

  async function toggleStatus(r: RoutineView) {
    const status = r.status === "active" ? "paused" : "active";
    try {
      await updateRoutineApi(subAccountId, r.id, { status });
      toast.success(status === "paused" ? "Routine paused" : "Routine resumed");
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteRoutineApi(subAccountId, deleting.id);
      toast.success("Routine deleted");
      setDeleting(null);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <ProjectsShell
      active="routines"
      heading="Routines"
      subheading="Create recurring groups of tasks to streamline your ongoing work. Routines are flexible, ongoing and don't require a project."
      actions={
        <Button onClick={() => openEditor(null)}>
          <Plus className="mr-1.5 h-4 w-4" /> Create Routine
        </Button>
      }
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter routines">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["paused", "Paused"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                "inline-flex min-h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                filter === id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
              )}
            >
              {label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  filter === id ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                )}
              >
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="routines-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search routines…"
              aria-label="Search routines"
              className="bg-card h-9 pl-9 sm:w-64"
            />
          </label>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            Sort
            <select
              id="routines-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="border-input bg-card text-foreground h-9 flex-1 rounded-md border px-2.5 text-sm"
            >
              <option value="next">Next occurrence</option>
              <option value="name">Name</option>
              <option value="recent">Recently created</option>
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm">
          Couldn&apos;t load routines: {error}{" "}
          <button type="button" className="underline" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-muted/40 h-60 animate-pulse rounded-2xl border" />
          ))}
        </div>
      ) : shown.length === 0 && !error ? (
        <div className="bg-card flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <span className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
            <Repeat className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            {items.length ? "No routines match" : "Build your first routine"}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">
            {items.length
              ? "Try another search or filter."
              : "Group the recurring work you do every day, week or month (a morning routine, a weekly CEO reset, a monthly check-in) and check it off each time."}
          </p>
          {!items.length && (
            <Button className="mt-5" onClick={() => openEditor(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create Routine
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <RoutineCard
              key={item.routine.id}
              item={item}
              onOpen={() => router.push(`${pathname}/${item.routine.id}`)}
              onEdit={() => openEditor(item.routine)}
              onToggleStatus={() => void toggleStatus(item.routine)}
              onDelete={() => setDeleting(item.routine)}
            />
          ))}
        </div>
      )}

      {shownProjectRoutines.length > 0 && (
        <section aria-labelledby="project-routines-heading" className="space-y-3">
          <div>
            <h2 id="project-routines-heading" className="text-base font-semibold">
              From your projects
            </h2>
            <p className="text-muted-foreground text-sm">
              Routines generated with a project template. They repeat inside their project and are managed there.
            </p>
          </div>
          <ul className="bg-card divide-y rounded-2xl border">
            {shownProjectRoutines.map((p) => (
              <li key={p.taskId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <Repeat className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
                <span className="min-w-0 flex-1 font-medium">{p.title}</span>
                <span className="text-muted-foreground text-xs">
                  {TASK_RECURRENCE_LABELS[p.recurrenceType as TaskRecurrenceType] ?? p.recurrenceType}
                  {p.estimateMinutes ? ` · ${p.estimateMinutes} min` : ""}
                </span>
                <Link
                  href={`/sa/${subAccountId}/projects/${p.projectId}`}
                  className="text-primary inline-flex max-w-full items-center gap-1 text-xs font-medium hover:underline"
                >
                  <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{p.projectTitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RoutineEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        routine={editing}
        initialStep={editorStep}
        projects={projects}
        onSaved={(r) => {
          void reload();
          if (!editing) router.push(`${pathname}/${r.id}`);
        }}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              The routine stops and its upcoming unfinished activities are removed. Activities already completed (or with
              tracked time) stay in your task history. To stop it without deleting, pause it instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            {deleting?.status === "active" && (
              <Button
                variant="outline"
                disabled={deleteBusy}
                onClick={async () => {
                  const r = deleting;
                  setDeleting(null);
                  if (r) await toggleStatus(r);
                }}
              >
                Pause instead
              </Button>
            )}
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete routine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProjectsShell>
  );
}

export default function RoutinesPage() {
  return (
    <Suspense fallback={null}>
      <RoutinesPageInner />
    </Suspense>
  );
}
