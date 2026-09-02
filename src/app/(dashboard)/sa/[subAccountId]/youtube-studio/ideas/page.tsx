"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Lightbulb, Loader2, Pencil, Plus, Search, Trash2, Video } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdeaDialog } from "@/components/ytcs/idea-dialog";
import type { YtcsIdea } from "@/types/ytcs";

const PAGE_SIZE = 10;

/**
 * Saved Ideas — full CRUD (final completion phase). Real schema only
 * (migration spec §14): title/type/notes/priority/status/
 * ideaVoiceNotes. Search + "last 10, newest first" pagination are
 * dossier-documented, carried forward as-is since nothing real
 * contradicts them.
 */
export default function SavedIdeasPage() {
  const { subAccountId, saPath } = useSubAccount();
  const router = useRouter();
  const [ideas, setIdeas] = useState<YtcsIdea[] | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<YtcsIdea | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/ideas`);
    const data = await res.json();
    setIdeas(data.ideas ?? []);
  }

  useEffect(() => {
    if (!subAccountId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  const filtered = useMemo(() => {
    if (!ideas) return [];
    const q = search.trim().toLowerCase();
    if (!q) return ideas;
    return ideas.filter(
      (i) =>
        i.title?.toLowerCase().includes(q) ||
        i.notes?.toLowerCase().includes(q) ||
        i.type?.toLowerCase().includes(q),
    );
  }, [ideas, search]);

  // Filters reset paging to page 1 — dossier-documented behavior.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openCreate() {
    setEditingIdea(null);
    setDialogOpen(true);
  }
  function openEdit(idea: YtcsIdea) {
    setEditingIdea(idea);
    setDialogOpen(true);
  }

  async function duplicateIdea(idea: YtcsIdea) {
    setBusyId(idea.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/ideas/${idea.id}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't duplicate");
      toast.success("Idea duplicated.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't duplicate");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteIdea(idea: YtcsIdea) {
    if (!confirm(`Delete "${idea.title || "this idea"}"? This can't be undone.`)) return;
    setBusyId(idea.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/ideas/${idea.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't delete");
      toast.success("Idea deleted.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    } finally {
      setBusyId(null);
    }
  }

  async function turnIntoVideo(idea: YtcsIdea) {
    setBusyId(idea.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/ideas/${idea.id}/turn-into-video`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't create a video project");
      router.push(saPath(`/youtube-studio/workspace/${data.project.id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create a video project");
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas..."
            className="pl-8"
          />
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Save an Idea
        </Button>
      </div>

      {ideas === null && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {ideas?.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Your idea vault is waiting.
        </p>
      )}
      {ideas && ideas.length > 0 && filtered.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No ideas match your search.
        </p>
      )}

      <div className="space-y-2">
        {pageItems.map((idea) => (
          <div key={idea.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{idea.title || "(untitled idea)"}</p>
              <p className="text-xs text-muted-foreground">
                {idea.type ?? "—"} · {idea.priority ?? "—"} · {idea.status ?? "—"}
              </p>
              {idea.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{idea.notes}</p>}
              {(idea.ideaVoiceNotes?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {idea.ideaVoiceNotes!.length} voice note{idea.ideaVoiceNotes!.length === 1 ? "" : "s"} attached
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === idea.id}
                onClick={() => turnIntoVideo(idea)}
              >
                {busyId === idea.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                Turn Into Video
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(idea)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" disabled={busyId === idea.id} onClick={() => duplicateIdea(idea)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busyId === idea.id}
                onClick={() => deleteIdea(idea)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <IdeaDialog
        subAccountId={subAccountId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        idea={editingIdea}
        onSaved={load}
      />
    </div>
  );
}
