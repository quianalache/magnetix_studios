"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Copy, Loader2, Pencil, Search, Video } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { YtcsVideoProject } from "@/types/ytcs";

type LibraryTab = "In Progress" | "Published" | "Archived";
const TABS: LibraryTab[] = ["In Progress", "Published", "Archived"];

/**
 * Video Library — full implementation (final completion phase). Same
 * underlying `ytcsVideos` collection as Video Workspace's own project
 * list; no separate published-video collection, matching the migration
 * spec's own architecture (§15/§20). Classification uses only the real
 * `status` field (Phase 3B's `"Published"` value, now canonical — see
 * migration spec's Final Completion addendum) plus the new `archived`
 * boolean; no invented status model beyond that one new flag.
 */
export default function VideoLibraryPage() {
  const { subAccountId, saPath } = useSubAccount();
  const router = useRouter();
  const [projects, setProjects] = useState<YtcsVideoProject[] | null>(null);
  const [tab, setTab] = useState<LibraryTab>("In Progress");
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos`);
    const data = await res.json();
    setProjects(data.projects ?? []);
  }

  useEffect(() => {
    if (!subAccountId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  const counts = useMemo(() => {
    const all = projects ?? [];
    return {
      "In Progress": all.filter((p) => !p.archived && p.status !== "Published").length,
      Published: all.filter((p) => !p.archived && p.status === "Published").length,
      Archived: all.filter((p) => p.archived).length,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const all = projects ?? [];
    const byTab = all.filter((p) => {
      if (tab === "Archived") return !!p.archived;
      if (p.archived) return false;
      return tab === "Published" ? p.status === "Published" : p.status !== "Published";
    });
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((p) => (p.name ?? "").toLowerCase().includes(q));
  }, [projects, tab, search]);

  async function saveRename(project: YtcsVideoProject) {
    const name = renameValue.trim();
    if (!name) {
      toast.error("Give the project a name.");
      return;
    }
    setBusyId(project.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't rename");
      toast.success("Renamed.");
      setRenamingId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rename");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicateProject(project: YtcsVideoProject) {
    setBusyId(project.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't duplicate");
      toast.success("Project duplicated.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't duplicate");
    } finally {
      setBusyId(null);
    }
  }

  async function setArchived(project: YtcsVideoProject, archived: boolean) {
    setBusyId(project.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't update");
      toast.success(archived ? "Archived." : "Restored.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProject(project: YtcsVideoProject) {
    if (!confirm(`Delete "${project.name || "this project"}"? This can't be undone.`)) return;
    setBusyId(project.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${project.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't delete");
      toast.success("Deleted.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    } finally {
      setBusyId(null);
    }
  }

  const total = projects?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{total} total</span>
        <span>{counts["In Progress"]} in progress</span>
        <span>{counts.Published} published</span>
        <span>{counts.Archived} archived</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl border bg-muted/30 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t} · {counts[t]}
            </button>
          ))}
        </div>
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="pl-8"
          />
        </div>
      </div>

      {projects === null && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {projects && filtered.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {tab === "In Progress" && "No video projects yet."}
          {tab === "Published" && "Nothing published yet."}
          {tab === "Archived" && "Nothing archived."}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((p) => {
          const displayTitle = p.finalTitle || p.selectedTitle;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Video className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                {renamingId === p.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-8"
                      autoFocus
                    />
                    <Button size="sm" disabled={busyId === p.id} onClick={() => saveRename(p)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">{p.name || "Untitled Video Project"}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.startingPointType ?? "—"} · Step: {p.currentStep ?? "Input"} · Status: {p.status ?? "—"}
                      {p.lastUpdatedDate ? ` · Updated ${new Date(p.lastUpdatedDate).toLocaleDateString()}` : ""}
                    </p>
                    {displayTitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">&ldquo;{displayTitle}&rdquo;</p>}
                    {tab === "Published" && p.youtubeLink && (
                      <a
                        href={p.youtubeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-xs text-primary hover:underline"
                      >
                        {p.youtubeLink}
                      </a>
                    )}
                  </>
                )}
              </div>
              {renamingId !== p.id && (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(saPath(`/youtube-studio/workspace/${p.id}`))}
                  >
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRenamingId(p.id);
                      setRenameValue(p.name ?? "");
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => duplicateProject(p)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {p.archived ? (
                    <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => setArchived(p, false)}>
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => setArchived(p, true)}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId === p.id}
                    onClick={() => deleteProject(p)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
