"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, MoreHorizontal, Pencil, RotateCw, StickyNote, Trash2 } from "lucide-react";
import { useContactFeedHead } from "@/hooks/use-contact-feed-head";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddNoteInput } from "@/components/contacts/add-note-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 *
 * `variant="internal"` is the Conversations → Internal Notes view (approved
 * Wave 3 layout): the same records, fetch, edit and delete, presented as
 * warm gold cards with the actions in a ⋯ menu. The note composer lives in
 * the conversation's own composer there, so this variant renders no input;
 * `refreshKey` changes (from the live notes snapshot) reload the list.
 */
export function ContactNotesPanel({
  contactId,
  focusNoteId,
  notesUrl,
  variant = "default",
  refreshKey,
}: {
  contactId: string;
  variant?: "default" | "internal";
  /** Reload (quietly) whenever this changes — e.g. a note was just saved. */
  refreshKey?: string;
  /** Scroll to + highlight this note (from an Activity "View in Notes"). */
  focusNoteId?: string | null;
  /**
   * Notes endpoint. Defaults to the contact's notes; Deal Details passes
   * `/api/deals/{id}/notes` (same record shape + rules, separate records).
   */
  notesUrl?: string;
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
  const base = notesUrl ?? `/api/contacts/${contactId}/notes`;
  // Live refresh only exists for contact notes (a client-readable feed).
  const headVersion = useContactFeedHead(notesUrl ? "" : contactId, ["notes"]);

  const loadFirst = useCallback(
    async (quiet = false) => {
      const id = ++requestId.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const res = await fetch(base, { cache: "no-store" });
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
    [base],
  );

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    if (headVersion > 0 && !editingId) void loadFirst(true);
  }, [headVersion, loadFirst, editingId]);

  const lastRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === lastRefreshKey.current) return;
    lastRefreshKey.current = refreshKey;
    if (!editingId) void loadFirst(true);
  }, [refreshKey, loadFirst, editingId]);

  const internal = variant === "internal";

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
        `${base}?cursor=${encodeURIComponent(cursor)}`,
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
      const res = await fetch(`${base}/${note.id}`, {
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
      const res = await fetch(`${base}/${confirmDelete.id}`, {
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
      {!internal && (
        <AddNoteInput
          contactId={contactId}
          postUrl={notesUrl}
          onSaved={() => void loadFirst(true)}
        />
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading notes">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-control bg-muted" />
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
      ) : notes.length === 0 && internal ? (
        <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-chip bg-tag-gold-bg text-tag-gold-fg" aria-hidden="true">
            <StickyNote className="size-5" />
          </span>
          <p className="text-body-sm font-medium">No internal notes yet</p>
          <p className="mt-0.5 max-w-xs text-caption text-muted-foreground">
            Notes are for your team only — they&rsquo;re never sent to the contact.
          </p>
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-card p-8 text-center">
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
            if (internal) {
              return (
                <li
                  key={note.id}
                  id={`note-${note.id}`}
                  className={cn(
                    "rounded-card border border-gold-300/70 bg-tint-gold p-4",
                    focusNoteId === note.id && "ring-2 ring-primary/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-gold-bg text-tag-gold-fg" aria-hidden="true">
                      <StickyNote className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-caption text-muted-foreground">
                          <span className="text-body-sm font-semibold text-foreground">
                            {note.authorName ?? "Team member"}
                          </span>
                          {created && (
                            <>
                              {" · "}
                              <time dateTime={note.createdAt ?? undefined} title={created.toLocaleString()}>
                                {created.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
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
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="-mt-1 -mr-1 size-8 shrink-0 text-muted-foreground"
                                  aria-label="Note actions"
                                />
                              }
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {note.canEdit && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingId(note.id);
                                    setDraft(note.content);
                                  }}
                                >
                                  <Pencil className="size-3.5" /> Edit note
                                </DropdownMenuItem>
                              )}
                              {note.canDelete && (
                                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(note)}>
                                  <Trash2 className="size-3.5" /> Delete note
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {editing ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="min-h-20 bg-card"
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
                        <p className="mt-1 whitespace-pre-wrap text-body-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                          {note.content}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            }
            return (
              <li
                key={note.id}
                id={`note-${note.id}`}
                className={cn(
                  "rounded-card border border-border bg-card shadow-card p-4 transition-shadow",
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
              {notesUrl
                ? "It will be removed for everyone. This can’t be undone."
                : "It will be removed for everyone, including from the conversation’s Internal Notes. This can’t be undone."}
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
