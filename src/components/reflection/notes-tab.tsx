"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/system/section-header";
import { EmptyState } from "@/components/system/empty-state";
import { Tag, tagColorFor } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import type { NoteDoc } from "@/types/reflection";

/**
 * Notes — Visual Direction 2 (2026-10-23). The MomentumOS "Quick note"
 * composer (the title comes from the note's first line, not a separate
 * field) and the saved notes list. ⌘/Ctrl + Enter saves.
 */
/** The note body without its first line when that line IS the title (it's where the title came from). */
function notePreview(n: NoteDoc): string {
  const [first, ...rest] = n.content.split("\n");
  return (first.trim() === n.title.trim() ? rest.join("\n") : n.content).trim();
}

export function NotesTab({ subAccountId }: { subAccountId: string }) {
  const { confirm, dialog } = useConfirm();
  const [notes, setNotes] = useState<NoteDoc[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/reflection/notes`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setNotes(d.notes ?? []))
      .catch(() => {
        setNotes((prev) => prev ?? []);
        toast.error("Couldn't load notes.");
      });
  }
  useEffect(load, [subAccountId]);

  async function save() {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (!res.ok) throw new Error();
      setDraft("");
      load();
      toast.success("Note saved.");
    } catch {
      toast.error("Couldn't save note.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(n: NoteDoc) {
    if (!(await confirm({ title: `Delete “${n.title}”?`, description: "This can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    setNotes((prev) => prev?.filter((x) => x.id !== n.id) ?? null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/reflection/notes/${n.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't delete note.");
      load();
    }
  }

  return (
    <div className="space-y-4">
      {dialog}
      <SectionHeader title="Notes" description="Capture thoughts as they come. The first line becomes the title." />

      <Card className="gap-3 p-4">
        <label htmlFor="quick-note" className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
          <ScrollText className="size-4 text-link" aria-hidden="true" />
          Quick note
        </label>
        <Textarea
          id="quick-note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Jot down a quick thought…"
          rows={4}
          className="text-body"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-muted-foreground">⌘/Ctrl + Enter to save</span>
          <Button onClick={save} disabled={!draft.trim() || saving}>
            {saving ? "Saving…" : "Save note"}
          </Button>
        </div>
      </Card>

      {notes === null ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState compact icon={ScrollText} title="No notes yet" description="Notes you save appear here, newest first." />
      ) : (
        <div className="space-y-2.5">
          {notes.map((n) => (
            <Card key={n.id} size="sm" className="gap-1.5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-body-sm font-semibold">{n.title}</p>
                  {n.category && <Tag color={tagColorFor(n.category)} className="shrink-0">{n.category}</Tag>}
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => remove(n)} aria-label={`Delete ${n.title}`} title="Delete" className="-mt-0.5 shrink-0">
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
              {notePreview(n) && <p className="line-clamp-4 whitespace-pre-wrap text-body-sm text-muted-foreground">{notePreview(n)}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
