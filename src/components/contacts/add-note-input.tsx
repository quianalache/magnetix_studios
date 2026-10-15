"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton } from "@/components/ui/dictate-button";
import { addNote } from "@/lib/firestore/contacts";
import { useAuth } from "@/hooks/use-auth";

export function AddNoteInput({
  contactId,
  postUrl,
  onSaved,
  variant = "card",
}: {
  contactId: string;
  /** Post to this notes endpoint instead of the contact's (Deal Details). */
  postUrl?: string;
  /** Called after a note is saved (the Notes tab refreshes its list). */
  onSaved?: () => void;
  /**
   * `compact` = the Conversations composer's note mode (approved Wave 3
   * layout): no card, a subtle gold label, internal-only helper text. Same
   * save path and payload as the card.
   */
  variant?: "card" | "compact";
}) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !user) return;

    setSaving(true);
    try {
      if (postUrl) {
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to save note.");
      } else {
        await addNote(contactId, trimmed, user.uid);
      }
      setContent("");
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }

  if (variant === "compact") {
    return (
      <form onSubmit={handleSubmit} aria-label="Add internal note">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-caption font-semibold text-tag-gold-fg">
            <StickyNote className="size-3.5" aria-hidden="true" />
            Add internal note
          </span>
          <DictateButton value={content} onChange={setContent} />
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-label="Internal note"
          placeholder="Write a note for your team…"
          rows={2}
          className="min-h-16 resize-none border-gold-300/70 bg-card px-3 py-2 text-body-sm focus-visible:border-gold-600/60 focus-visible:ring-gold-300/40"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-muted-foreground">
            Visible to your team only — never sent to the contact.
          </p>
          <Button type="submit" size="sm" className="ml-auto h-8" disabled={saving || !content.trim()}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save Note"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-card border border-border bg-card shadow-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          Add a note
        </span>
        <DictateButton value={content} onChange={setContent} />
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Call recap, next steps, anything worth remembering…"
        className="min-h-20"
      />
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" disabled={saving || !content.trim()}>
          {saving ? "Saving…" : "Save Note"}
        </Button>
      </div>
    </form>
  );
}
