"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import type { YtcsIdea } from "@/types/ytcs";

/**
 * Saved Ideas — read-only in Phase 1 (migration spec Phase 3 builds the
 * full add/edit/delete UI). Real data only: the 2 real migrated ideas,
 * their real fields, no invented ones.
 */
export default function SavedIdeasPage() {
  const { subAccountId } = useSubAccount();
  const [ideas, setIdeas] = useState<YtcsIdea[] | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/ytcs/ideas`)
      .then((r) => r.json())
      .then((d) => setIdeas(d.ideas ?? []))
      .catch(() => setIdeas([]));
  }, [subAccountId]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Drop in the random thoughts and hot takes before they vanish. Full add/edit
        support is coming in a later phase — this is a real, read-only view of what&apos;s
        already saved.
      </p>

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
      <div className="space-y-2">
        {ideas?.map((idea) => (
          <div key={idea.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{idea.title || "(untitled idea)"}</p>
              <p className="text-xs text-muted-foreground">
                {idea.type ?? "—"} · {idea.priority ?? "—"} · {idea.status ?? "—"}
              </p>
              {idea.notes && <p className="mt-1 text-xs text-muted-foreground">{idea.notes}</p>}
              {(idea.ideaVoiceNotes?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {idea.ideaVoiceNotes!.length} voice note{idea.ideaVoiceNotes!.length === 1 ? "" : "s"} attached
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
