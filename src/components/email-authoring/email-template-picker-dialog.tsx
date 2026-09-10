"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loadEmailTemplate,
  subscribeToEmailTemplates,
  type EmailTemplateSummary,
} from "@/lib/email/template-library";
import type { BroadcastContent } from "@/types/broadcast-content";

export interface PickedEmailTemplate {
  /** The template's own id — provenance only, never used to re-fetch or
   *  re-link content. Everything a picker needs to author with is already
   *  copied into the other fields below. */
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
}

/**
 * Shared "start from template" picker — Email Templates only, no SMS toggle
 * (there is no such thing as an SMS email template). Used from the
 * Broadcast composer and from Workflow's Design Email / Quick Compose, so
 * a template built anywhere shows up everywhere an email is authored.
 * Selecting one COPIES its content in; nothing here ever creates a live
 * link back to the template.
 */
export function EmailTemplatePickerDialog({
  open,
  onOpenChange,
  subAccountId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccountId: string;
  onPick: (picked: PickedEmailTemplate) => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const unsub = subscribeToEmailTemplates(subAccountId, (list) => {
      setTemplates(list);
      setLoading(false);
    });
    return () => unsub();
  }, [open, subAccountId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q)
    );
  }, [templates, query]);

  async function pick(summary: EmailTemplateSummary) {
    setPickingId(summary.id);
    try {
      const loaded = await loadEmailTemplate(summary.id, summary.source);
      if (!loaded) return;
      onPick({
        id: summary.id,
        name: loaded.name,
        subject: loaded.subject,
        preheader: loaded.preheader,
        content: loaded.content,
      });
      onOpenChange(false);
    } finally {
      setPickingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            This copies the template&apos;s content in — editing it here never
            changes the saved template.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email templates…"
            className="pl-8"
            aria-label="Search email templates"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            {templates.length === 0
              ? "No email templates yet. Save one from a broadcast or the Email Template Library to reuse it here."
              : "No templates match that search."}
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={pickingId !== null}
                onClick={() => pick(t)}
                className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm disabled:opacity-60"
              >
                <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                  {pickingId === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {t.subject || "(no subject)"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
