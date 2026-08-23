"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/community/member-avatar";
import type { RewardWithEffectiveStatus, EligibleWinner } from "@/lib/server/community-rewards-service";

const NOTES_MAX = 250;

const CRITERION_LABEL: Record<string, string> = {
  top_points_period: "Top points in period",
  point_threshold: "Reached point threshold",
  reach_level: "Reached level",
  manual: "Manual selection",
};

function endDateLabel(reward: RewardWithEffectiveStatus): string | null {
  const endAt = reward.endAt as unknown as { toMillis?: () => number } | null;
  if (!endAt?.toMillis) return null;
  return new Date(endAt.toMillis()).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Community Settings → Points & Rewards → Rewards / Winners → "Award
 * Winner" — the approved mockup's modal. `candidates` (from
 * `evaluateEligibleWinners`) is populated for a calculable criterion; for
 * a "manual" criterion it's empty and the moderator searches the member
 * directory instead. Always an explicit, confirmed moderator action —
 * never automatic — per Part 17.
 */
export function AwardWinnerModal({
  open,
  onOpenChange,
  reward,
  candidates,
  memberSearchResults,
  onSearch,
  brand,
  awardedByName,
  onAward,
  onViewWinners,
  awarding,
  awarded,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reward: RewardWithEffectiveStatus | null;
  candidates: EligibleWinner[];
  /** Manual-criterion fallback: member search results for the free-text query. */
  memberSearchResults: { memberId: string; displayName: string; avatarUrl: string | null }[];
  onSearch: (query: string) => void;
  brand: string;
  awardedByName: string;
  onAward: (memberId: string, notes: string) => void;
  /** Closes the modal AND switches the workspace to the Winners tab — found
   *  live during QA that this button previously only closed the modal,
   *  leaving the moderator on the Rewards tab despite the label. */
  onViewWinners: () => void;
  awarding: boolean;
  awarded: { memberId: string; displayName: string } | null;
  error: string | null;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedMemberId(null);
      setNotes("");
      setQuery("");
    }
  }, [open, reward?.id]);

  if (!reward) return null;
  const isManual = reward.criterion.type === "manual";
  const options = isManual
    ? memberSearchResults.map((m) => ({ memberId: m.memberId, displayName: m.displayName, avatarUrl: m.avatarUrl, points: null as number | null }))
    : candidates.map((c) => ({ memberId: c.memberId, displayName: c.displayName, avatarUrl: c.avatarUrl, points: c.points }));

  const sortedOptions = isManual ? options : [...options].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#202124] sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[#202124]">Award Winner</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${brand}22` }}>
            <Gift className="h-4.5 w-4.5" style={{ color: brand }} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#202124]">{reward.title}</p>
            {endDateLabel(reward) && <p className="text-xs text-[#909090]">Ends {endDateLabel(reward)}</p>}
          </div>
        </div>

        {awarded ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-800">Winner Awarded!</p>
            <p className="mt-1 text-sm text-green-700">
              {awarded.displayName} has been awarded &ldquo;{reward.title}&rdquo;.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-[#909090]">Select winner</p>
              {isManual && (
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    onSearch(e.target.value);
                  }}
                  placeholder="Search members…"
                  className="mb-2 w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
                />
              )}
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {sortedOptions.length === 0 && (
                  <p className="p-2 text-xs text-[#909090]">
                    {isManual ? "Search for a member above." : "No members currently qualify for this reward."}
                  </p>
                )}
                {sortedOptions.map((o) => (
                  <label
                    key={o.memberId}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#E4E4E4] px-3 py-2"
                    style={selectedMemberId === o.memberId ? { borderColor: brand, backgroundColor: `${brand}0d` } : undefined}
                  >
                    <input
                      type="radio"
                      name="winner"
                      checked={selectedMemberId === o.memberId}
                      onChange={() => setSelectedMemberId(o.memberId)}
                    />
                    <MemberAvatar author={{ memberId: o.memberId, displayName: o.displayName, avatarUrl: o.avatarUrl, level: 1 }} size={28} brand={brand} />
                    <span className="flex-1 truncate text-sm font-medium text-[#202124]">{o.displayName}</span>
                    {o.points !== null && <span className="text-xs font-semibold text-[#909090]">{o.points.toLocaleString()} pts</span>}
                  </label>
                ))}
              </div>
              {!isManual && (
                <p className="mt-1 text-xs text-[#909090]">{CRITERION_LABEL[reward.criterion.type]}</p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-[#909090]">Awarded by</p>
              <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2 text-sm text-[#202124]">{awardedByName}</div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-[#909090]">Notes (optional)</p>
                <p className="text-xs text-[#b4b4b4]">
                  {notes.length} / {NOTES_MAX}
                </p>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                rows={2}
                placeholder="Incredible engagement all month!"
                className="w-full resize-none rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
              />
              <p className="mt-1 text-xs text-[#909090]">This will be recorded in the Winners history.</p>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </>
        )}

        <DialogFooter className="bg-white">
          {awarded ? (
            <button
              type="button"
              onClick={onViewWinners}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              View Winners
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedMemberId || awarding}
                onClick={() => selectedMemberId && onAward(selectedMemberId, notes)}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: brand }}
              >
                {awarding ? "Awarding…" : "Award Reward"}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
