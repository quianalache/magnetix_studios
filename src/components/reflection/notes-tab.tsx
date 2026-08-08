"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NoteDoc } from "@/types/reflection";

/**
 * Notes — real "Quick Note" composer ported verbatim from the compiled app
 * bundle 2026-08-08 (title auto-derives from the note's first line, not a
 * separate field — that's real behavior, not a simplification). The saved-
 * notes list below it follows this app's existing card conventions; the
 * bundle excerpt captured the composer but not that list's own markup.
 */
export function NotesTab({ subAccountId }: { subAccountId: string }) {
  const [notes, setNotes] = useState<NoteDoc[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/reflection/notes`)
      .then((r) => r.json())
      .then((d) => setNotes(d.notes ?? []))
      .catch(() => toast.error("Couldn't load notes."));
  }
  useEffect(load, [subAccountId]);

  async function save() {
    const plain = draft.trim();
    if (!plain) return;
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
      toast.success("Note saved to Reflection > Notes");
    } catch {
      toast.error("Couldn't save note.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(noteId: string) {
    setNotes((prev) => prev?.filter((n) => n.id !== noteId) ?? null);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/reflection/notes/${noteId}`, { method: "DELETE" });
    } catch {
      toast.error("Couldn't delete note.");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Notes</h2>
      </div>

      <div className="rounded-2xl border-none shadow-sm bg-card">
        <div className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ScrollText className="h-4 w-4 text-primary" /> Quick Note
          </span>
        </div>
        <div className="px-4 pb-4">
          <div className="min-h-[80px] rounded-xl bg-muted/30">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Jot down a quick thought..."
              className="min-h-[80px] w-full resize-none rounded-xl border-none bg-transparent p-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Capture thoughts quickly</span>
            <Button size="sm" className="h-7 rounded-full px-3 text-xs" onClick={save} disabled={!draft.trim() || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {notes === null ? (
        <div className="h-24 animate-pulse rounded-2xl border bg-muted/20" />
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-2xl border-none shadow-sm bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{n.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">{n.category}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{n.content}</p>
                </div>
                <button type="button" onClick={() => remove(n.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
