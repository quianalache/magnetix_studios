"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, FolderKanban, ListChecks, Repeat } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { listRoutinesApi, updateRoutineApi } from "@/lib/client/routines-api";
import { ProjectsShell } from "@/components/projects/projects-shell";
import { ProjectsList, ProjectsEmptyState } from "@/components/projects/projects-list";
import { useProjectsData } from "@/hooks/use-projects-data";
import { Button } from "@/components/ui/button";
import type { Task } from "@/types/tasks";
import type { RoutineListItem } from "@/types/routines";

type Tab = "projects" | "routines" | "tasks";

export default function ArchivedPage() {
  const { user } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const { projects, loading: projectsLoading } = useProjectsData();
  const [tab, setTab] = useState<Tab>("projects");
  const [routines, setRoutines] = useState<RoutineListItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const reloadRoutines = useCallback(async () => {
    try { setRoutines((await listRoutinesApi(subAccountId, { includeArchived: true })).routines); } catch { setRoutines([]); }
  }, [subAccountId]);
  useEffect(() => { void reloadRoutines(); }, [reloadRoutines]);
  useEffect(() => {
    if (!user || !agencyId) return;
    return safeSubscribe(() => subscribeToTasks({ agencyId, subAccountId }, (next) => { setTasks(next); setLoading(false); }), () => { setTasks([]); setLoading(false); });
  }, [user, agencyId, subAccountId]);
  const archivedProjects = useMemo(() => projects.filter((p) => p.status === "archived"), [projects]);
  const archivedRoutines = useMemo(() => routines.filter((r) => r.routine.status === "archived"), [routines]);
  const archivedTasks = useMemo(() => tasks.filter((t) => t.archived === true), [tasks]);
  async function restoreRoutine(id: string) { try { await updateRoutineApi(subAccountId, id, { status: "active" }); toast.success("Routine restored"); await reloadRoutines(); } catch (err) { toast.error((err as Error).message); } }
  async function restoreTask(id: string) { try { const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: false }) }); if (!res.ok) throw new Error("Couldn't restore task"); toast.success("Task restored"); } catch (err) { toast.error((err as Error).message); } }
  const tabs = [{ id: "projects" as const, label: "Projects", count: archivedProjects.length, icon: FolderKanban }, { id: "routines" as const, label: "Routines", count: archivedRoutines.length, icon: Repeat }, { id: "tasks" as const, label: "Tasks", count: archivedTasks.length, icon: ListChecks }];
  return <ProjectsShell active="archived" heading="Archived" subheading="Restore work without losing its history or ownership context.">
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Archived categories">{tabs.map(({ id, label, count, icon: Icon }) => <Button key={id} variant={tab === id ? "default" : "outline"} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon className="mr-1.5 h-4 w-4" />{label}<span className="ml-1 rounded-full bg-background/30 px-1.5 text-xs">{count}</span></Button>)}</div>
    {tab === "projects" && <ProjectsList projects={archivedProjects} mode="archived" loading={projectsLoading} onEdit={() => {}} emptyState={<ProjectsEmptyState title="No archived projects" desc="Archived projects will appear here." />} />}
    {tab === "routines" && <ArchiveRows title="Archived routines" empty="No archived routines" rows={archivedRoutines.map((r) => ({ id: r.routine.id, title: r.routine.name, detail: `${r.routine.activities.length} scheduled tasks`, onRestore: () => void restoreRoutine(r.routine.id) }))} />}
    {tab === "tasks" && <ArchiveRows title="Archived tasks" empty={loading ? "Loading tasks…" : "No archived tasks"} rows={archivedTasks.map((t) => ({ id: t.id, title: t.title, detail: t.projectId ? "Project task" : "Standalone task", onRestore: () => void restoreTask(t.id) }))} />}
  </ProjectsShell>;
}

function ArchiveRows({ title, empty, rows }: { title: string; empty: string; rows: { id: string; title: string; detail: string; onRestore: () => void }[] }) {
  return <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs"><h2 className="text-2xl font-semibold">{title} <span className="text-muted-foreground font-normal">({rows.length})</span></h2>{rows.length === 0 ? <p className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">{empty}</p> : <div className="divide-y rounded-xl border">{rows.map((row) => <div key={row.id} className="flex items-center gap-3 px-4 py-3"><Archive className="text-muted-foreground h-4 w-4" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{row.title}</p><p className="text-muted-foreground text-xs">{row.detail}</p></div><Button variant="outline" size="sm" onClick={row.onRestore}><ArchiveRestore className="mr-1.5 h-4 w-4" />Restore</Button></div>)}</div>}</section>;
}
