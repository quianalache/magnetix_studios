"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CheckSquare, Square, Lock } from "lucide-react";
import type { FeedPoll } from "@/types/community";
import { cn } from "@/lib/utils";

/**
 * ONE poll renderer, mounted by both the feed card (`feed-view.tsx`) and
 * the post-detail page (`post-detail-view.tsx`) — Part 8's explicit
 * instruction, not two near-identical implementations. Purely a function
 * of the viewer-safe `FeedPoll` the server already computed (see
 * `buildFeedPoll` in community-feed-service.ts) — this component never
 * has to reason about permissions itself; if `resultsVisible` is false the
 * counts simply aren't in the object it was handed.
 */
export function CommunityPollCard({
  poll,
  brand,
  onVote,
  className,
}: {
  poll: FeedPoll;
  brand: string;
  /** Resolves/rejects based on the actual server response — the parent
   *  owns the optimistic-update + revert-on-failure state (same convention
   *  `toggleLike` already uses in feed-view.tsx), this component just
   *  renders whatever `poll` it's currently handed. */
  onVote: (optionIds: string[]) => Promise<void>;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const hasVoted = poll.viewerSelection.length > 0;
  const selection = draft ?? poll.viewerSelection;
  const canVote = !poll.closed;

  function toggle(optionId: string) {
    if (!canVote || pending) return;
    if (poll.allowMultiple) {
      setDraft(
        selection.includes(optionId)
          ? selection.filter((id) => id !== optionId)
          : [...selection, optionId],
      );
    } else {
      setDraft([optionId]);
    }
  }

  async function submit() {
    if (!draft || draft.length === 0 || pending) return;
    setPending(true);
    try {
      await onVote(draft);
      setDraft(null);
    } finally {
      setPending(false);
    }
  }

  const totalVotes = poll.optionCounts
    ? Object.values(poll.optionCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className={cn("mt-2 rounded-xl border border-[#E4E4E4] bg-[#FAFAFA] p-3", className)}>
      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const isSelected = selection.includes(opt.id);
          const count = poll.optionCounts?.[opt.id] ?? 0;
          const pct = poll.resultsVisible && totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          // Results render once the viewer has voted (their own choice is
          // always visible to them) OR results are visible to everyone —
          // before voting on a still-open, results-hidden poll, only the
          // plain option list shows (nothing to leak).
          const showBar = poll.resultsVisible && (hasVoted || poll.closed || !canVote);
          const Icon = poll.allowMultiple
            ? isSelected
              ? CheckSquare
              : Square
            : isSelected
              ? CheckCircle2
              : Circle;

          return (
            <button
              key={opt.id}
              type="button"
              disabled={!canVote || pending}
              onClick={() => toggle(opt.id)}
              className={cn(
                "relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                isSelected ? "border-transparent" : "border-[#E4E4E4] bg-white",
                !canVote && "cursor-default",
              )}
              style={isSelected ? { borderColor: brand, backgroundColor: `${brand}14` } : undefined}
            >
              {showBar && (
                <span
                  className="absolute inset-y-0 left-0 -z-10 opacity-[0.12]"
                  style={{ width: `${pct}%`, backgroundColor: brand }}
                  aria-hidden
                />
              )}
              <Icon
                className="h-4 w-4 shrink-0"
                style={isSelected ? { color: brand } : undefined}
              />
              <span className="min-w-0 flex-1 truncate text-[#202124]">{opt.text}</span>
              {showBar && (
                <span className="shrink-0 text-xs font-medium text-[#909090]">
                  {count} · {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#909090]">
        <span className="flex items-center gap-1">
          {poll.closed ? (
            <>
              <Lock className="h-3 w-3" /> Poll closed
            </>
          ) : poll.allowMultiple ? (
            "Select one or more"
          ) : (
            "Select one"
          )}
          {poll.resultsVisible && poll.voterCount !== null && (
            <span>
              {" "}
              · {poll.voterCount} {poll.voterCount === 1 ? "vote" : "votes"}
            </span>
          )}
        </span>
        {canVote && draft && draft.length > 0 && (
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {pending ? "Saving…" : hasVoted ? "Update vote" : "Vote"}
          </button>
        )}
      </div>
    </div>
  );
}
