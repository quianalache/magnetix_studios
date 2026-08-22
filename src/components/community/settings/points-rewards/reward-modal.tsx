"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CommunityLevel,
  CommunityReward,
  RewardCriterion,
  RewardStatus,
} from "@/types/points-rewards";
import type { RewardInput } from "@/lib/server/community-rewards-service";

const TITLE_MAX = 120;
const DESC_MAX = 300;
const INSTRUCTIONS_MAX = 500;

const CRITERION_LABELS: Record<RewardCriterion["type"], string> = {
  top_points_period: "Top points in period",
  point_threshold: "Reach a point threshold",
  reach_level: "Reach a level",
  manual: "Manual selection",
};

function toDateInputValue(v: Date | null): string {
  if (!v) return "";
  return v.toISOString().slice(0, 10);
}

function fromDateInputValue(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RewardDraft {
  title: string;
  description: string;
  status: RewardStatus;
  startAt: Date | null;
  endAt: Date | null;
  criterion: RewardCriterion;
  instructions: string;
  url: string;
}

function draftFromReward(reward: CommunityReward | null): RewardDraft {
  if (!reward) {
    return {
      title: "",
      description: "",
      status: "draft",
      startAt: null,
      endAt: null,
      criterion: { type: "manual" },
      instructions: "",
      url: "",
    };
  }
  return {
    title: reward.title,
    description: reward.description,
    status: reward.status,
    startAt: reward.startAt ? new Date((reward.startAt as unknown as { toMillis: () => number }).toMillis()) : null,
    endAt: reward.endAt ? new Date((reward.endAt as unknown as { toMillis: () => number }).toMillis()) : null,
    criterion: reward.criterion,
    instructions: reward.fulfillment.instructions,
    url: reward.fulfillment.url ?? "",
  };
}

/**
 * Community Settings → Points & Rewards → Rewards → "Create New Reward" /
 * "Edit Reward" — the approved mockup's modal, used for both create and
 * edit (passing `reward={null}` starts a fresh draft). `status` here is
 * the moderator's own INTENT (draft/scheduled/active) — the caller
 * computes and enforces the max-3-active cap server-side; this modal just
 * surfaces the server's rejection message if it happens.
 */
export function RewardModal({
  open,
  onOpenChange,
  reward,
  levels,
  brand,
  onSave,
  saving,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reward: CommunityReward | null;
  levels: CommunityLevel[];
  brand: string;
  onSave: (input: RewardInput) => void;
  saving: boolean;
  error: string | null;
}) {
  const [draft, setDraft] = useState<RewardDraft>(() => draftFromReward(reward));

  useEffect(() => {
    if (open) setDraft(draftFromReward(reward));
  }, [open, reward]);

  const trimmedTitle = draft.title.trim();
  const canSave = trimmedTitle.length > 0 && trimmedTitle.length <= TITLE_MAX && draft.instructions.trim().length > 0;

  function buildInput(status: RewardStatus): RewardInput {
    return {
      title: trimmedTitle,
      description: draft.description.trim().slice(0, DESC_MAX),
      status,
      startAt: draft.startAt,
      endAt: draft.endAt,
      criterion: draft.criterion,
      fulfillment: {
        type: "manual",
        instructions: draft.instructions.trim().slice(0, INSTRUCTIONS_MAX),
        url: draft.url.trim() || null,
      },
    };
  }

  // The primary button always PUBLISHES (never lands as another draft —
  // "Save Draft" below is the dedicated secondary action for that): a
  // "draft" selection here still activates on the primary button, same as
  // the mockup's "Activate Reward" primary action.
  const publishStatus: RewardStatus = draft.status === "draft" ? "active" : draft.status;
  const primaryLabel = publishStatus === "scheduled" ? "Schedule Reward" : "Activate Reward";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#202124] sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[#202124]">{reward ? "Edit Reward" : "Create New Reward"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Reward title</p>
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value.slice(0, TITLE_MAX) })}
              placeholder="Community Leader"
              className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-[#909090]">Description</p>
              <p className="text-xs text-[#b4b4b4]">
                {draft.description.length} / {DESC_MAX}
              </p>
            </div>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value.slice(0, DESC_MAX) })}
              rows={2}
              placeholder="Earn the most points this month and win a 1:1 strategy call."
              className="w-full resize-none rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Status</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["draft", "active", "scheduled"] as RewardStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft({ ...draft, status: s })}
                  className="rounded-md border px-3 py-1.5 text-xs font-semibold capitalize"
                  style={
                    draft.status === s
                      ? { backgroundColor: brand, borderColor: brand, color: "white" }
                      : { borderColor: "#E4E4E4", color: "#3a3a44" }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-[#909090]">Start date (optional)</p>
              <input
                type="date"
                value={toDateInputValue(draft.startAt)}
                onChange={(e) => setDraft({ ...draft, startAt: fromDateInputValue(e.target.value) })}
                className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[#909090]">End date (optional)</p>
              <input
                type="date"
                value={toDateInputValue(draft.endAt)}
                onChange={(e) => setDraft({ ...draft, endAt: fromDateInputValue(e.target.value) })}
                className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">How members win</p>
            <select
              value={draft.criterion.type}
              onChange={(e) => {
                const type = e.target.value as RewardCriterion["type"];
                const criterion: RewardCriterion =
                  type === "top_points_period"
                    ? { type, window: "30d", winnerCount: 1 }
                    : type === "point_threshold"
                      ? { type, threshold: 100 }
                      : type === "reach_level"
                        ? { type, level: levels[3]?.level ?? 4 }
                        : { type };
                setDraft({ ...draft, criterion });
              }}
              className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
            >
              {Object.entries(CRITERION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            {draft.criterion.type === "top_points_period" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={draft.criterion.window}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      criterion: { ...draft.criterion, window: e.target.value as "7d" | "30d" | "all" } as RewardCriterion,
                    })
                  }
                  className="rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="all">All-time</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={draft.criterion.winnerCount}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      criterion: { ...draft.criterion, winnerCount: Number(e.target.value) } as RewardCriterion,
                    })
                  }
                  placeholder="Winners"
                  className="rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
                />
              </div>
            )}
            {draft.criterion.type === "point_threshold" && (
              <input
                type="number"
                min={0}
                value={draft.criterion.threshold}
                onChange={(e) =>
                  setDraft({ ...draft, criterion: { type: "point_threshold", threshold: Number(e.target.value) } })
                }
                placeholder="Point threshold"
                className="mt-2 w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
              />
            )}
            {draft.criterion.type === "reach_level" && (
              <select
                value={draft.criterion.level}
                onChange={(e) =>
                  setDraft({ ...draft, criterion: { type: "reach_level", level: Number(e.target.value) } })
                }
                className="mt-2 w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
              >
                {levels.map((l) => (
                  <option key={l.level} value={l.level}>
                    Level {l.level} - {l.name}
                  </option>
                ))}
              </select>
            )}
            {draft.criterion.type === "manual" && (
              <p className="mt-2 text-xs text-[#909090]">You&apos;ll pick the winner yourself from the Winners tab.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Reward fulfillment</p>
            <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2 text-sm font-medium text-[#202124]">
              Manual (instructions)
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-[#909090]">Instructions for winner</p>
              <p className="text-xs text-[#b4b4b4]">
                {draft.instructions.length} / {INSTRUCTIONS_MAX}
              </p>
            </div>
            <textarea
              value={draft.instructions}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value.slice(0, INSTRUCTIONS_MAX) })}
              rows={2}
              placeholder="You'll receive a link to book your 1:1 strategy call. We'll email you within 48 hours."
              className="w-full resize-none rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
            />
            {draft.instructions.trim().length === 0 && (
              <p className="mt-1 text-xs text-red-600">Fulfillment instructions are required.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Button / Link URL (optional)</p>
            <input
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://calendly.com/..."
              className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter className="bg-white">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => onSave(buildInput("draft"))}
            className="rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44] disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => onSave(buildInput(publishStatus))}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: brand }}
          >
            {saving ? "Saving…" : primaryLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
