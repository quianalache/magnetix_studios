"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Pencil, RotateCw, StickyNote, Trash2 } from "lucide-react";
import { useContactFeedHead } from "@/hooks/use-contact-feed-head";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddNoteInput } from "@/components/contacts/add-note-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContactNoteView, ContactNotesPage } from "@/types/contact-feed";

/**
 * Contact profile → Notes tab (Contacts redesign, 2026-09-25).
 *
 * Same `contacts/{id}/notes` records as always (also shown as internal
 * notes in Conversations) — now with create / view / edit / delete through
 * `/api/contacts/[id]/notes`. Authorship comes from the server session and
 * is shown from the sub-account's team-member names; editing keeps the
 * original author + creation time and marks the note "edited". Only the
 * author can edit; the author or a workspace admin can delete (confirmed).
 */
export function ContactNotesPanel({
  contactId,
  focusNoteId,
}: {
  contactId: string;
  /** Scroll to + highlight this note (from an Activity "View in Notes"). */
  focusNoteId?: string | null;
}) {
  const [notes, setNotes] = useState<ContactNoteView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ContactNoteView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestId = useRef(0);
  const headVersion = useContactFeedHead(contactId, ["notes"]);

  const loadFirst = useCallback(
    async (quiet = false) => {
      const id = ++requestId.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/contacts/${contactId}/notes`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as ContactNotesPage & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't load notes.");
        if (id !== requestId.current) return;
        setNotes(data.notes ?? []);
        setCursor(data.nextCursor ?? null);
      } catch (err) {
        if (id === requestId.current) {
          setError(err instanceof Error ? err.message : "Couldn't load notes.");
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [contactId],
  );

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    if (headVersion > 0 && !editingId) void loadFirst(true);
  }, [headVersion, loadFirst, editingId]);

  useEffect(() => {
    if (!focusNoteId || loading) return;
    document
      .getElementById(`note-${focusNoteId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusNoteId, loading, notes]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/contacts/${contactId}/notes?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as ContactNotesPage & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't load more notes.");
      setNotes((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...(data.notes ?? []).filter((n) => !seen.has(n.id))];
      });
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load more notes.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveEdit(note: ContactNoteView) {
    const content = draft.trim();
    if (!content) {
      toast.error("A note can't be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the note.");
      setEditingId(null);
      toast.success("Note updated");
      void loadFirst(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the note.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes/${confirmDelete.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't delete the note.");
      setNotes((prev) => prev.filter((n) => n.id !== confirmDelete.id));
      setConfirmDelete(null);
      toast.success("Note deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the note.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <AddNoteInput contactId={contactId} onSaved={() => void loadFirst(true)} />

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading notes">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" className="h-7" onClick={() => void loadFirst()}>
            <RotateCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
          <StickyNote className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No notes yet</p>
          <p className="text-xs text-muted-foreground">
            Call recaps, next steps and context your team should know.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const created = note.createdAt ? new Date(note.createdAt) : null;
            const editing = editingId === note.id;
            return (
              <li
                key={note.id}
                id={`note-${note.id}`}
                className={cn(
                  "rounded-xl border bg-card p-4 transition-shadow",
                  focusNoteId === note.id && "ring-2 ring-primary/40",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {note.authorName ?? "Team member"}
                    </span>
                    {created && (
                      <>
                        {" · "}
                        <time dateTime={note.createdAt ?? undefined} title={created.toLocaleString()}>
                          {formatRelativeTime(created)}
                        </time>
                      </>
                    )}
                    {note.updatedAt && (
                      <span title={`Edited ${new Date(note.updatedAt).toLocaleString()}`}>
                        {" · edited"}
                      </span>
                    )}
                  </p>
                  {!editing && (note.canEdit || note.canDelete) && (
                    <div className="flex items-center gap-1">
                      {note.canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditingId(note.id);
                            setDraft(note.content);
                          }}
                        >
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                      )}
                      {note.canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                          onClick={() => setConfirmDelete(note)}
                          aria-label="Delete note"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="min-h-24"
                      aria-label="Edit note"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(note)} disabled={saving || !draft.trim()}>
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.content}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cursor && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Load older notes
          </Button>
        </div>
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && !deleting && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription>
              It will be removed for everyone, including from the contact&apos;s
              conversation view. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {confirmDelete && (
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs">
              {confirmDelete.content}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
