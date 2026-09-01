"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Video } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YTCS_STARTING_POINTS, type YtcsStartingPointType, type YtcsVideoProject } from "@/types/ytcs";

/**
 * Video Workspace landing — "Start New Video" (the real 6-starting-point
 * picker, migration spec §7) plus the real project list (Resume/Rename/
 * Delete — the "project foundation" Phase 1 asks for). Doubles as the
 * management surface Video Library's own nav entry links back to in
 * Phase 1 — there's one real project list, not two.
 */
export default function WorkspaceLandingPage() {
  const { subAccountId, saPath } = useSubAccount();
  const router = useRouter();
  const [projects, setProjects] = useState<YtcsVideoProject[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadProjects() {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos`);
    const data = await res.json();
    setProjects(data.projects ?? []);
  }

  useEffect(() => {
    if (!subAccountId) return;
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  async function startNewVideo(startingPointType: YtcsStartingPointType) {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled Video Project" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't create project");
      // Set the starting point immediately so the Input step opens on the
      // right surface rather than the picker again.
      await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingPointType }),
      });
      router.push(saPath(`/youtube-studio/workspace/${data.project.id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start a new video");
    } finally {
      setCreating(false);
    }
  }

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
      await loadProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rename");
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
      await loadProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!pickerOpen ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Plus className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-base font-semibold">Start New Video</span>
            <span className="block text-sm text-muted-foreground">
              Begin a new video project from scratch using a guided workflow.
            </span>
          </span>
        </button>
      ) : (
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-semibold">Choose Your Starting Point</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick whatever content you have right now. The studio will help you turn it
            into a YouTube video.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {YTCS_STARTING_POINTS.map((sp) => (
              <div key={sp.value} className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">{sp.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{sp.description}</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={creating}
                  onClick={() => startNewVideo(sp.value)}
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Select
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => setPickerOpen(false)}>
            Cancel
          </Button>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold">Your Video Projects</h2>
        {projects === null && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {projects?.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No video projects yet — start one above.
          </p>
        )}
        <div className="space-y-2">
          {projects?.map((p) => (
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
                    </p>
                  </>
                )}
              </div>
              {renamingId !== p.id && (
                <div className="flex shrink-0 items-center gap-1">
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId === p.id}
                    onClick={() => deleteProject(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
