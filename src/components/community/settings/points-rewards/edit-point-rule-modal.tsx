"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PointLimitType, PointRule } from "@/types/points-rewards";

const LIMIT_OPTIONS: { value: PointLimitType; label: string }[] = [
  { value: "none", label: "No limit" },
  { value: "per_day", label: "Per day" },
  { value: "per_entity", label: "Once per invitee" },
];

/**
 * Community Settings → Points & Rewards → Points System → "Edit Point
 * Rule" — the approved mockup's focused modal (not inline row editing).
 * `per_entity` is only ever offered for `invite_member` in V1 (the only
 * action with a natural "related entity" — see `PointRuleLimit`'s doc
 * comment); every other action only gets "No limit" / "Per day".
 */
export function EditPointRuleModal({
  open,
  onOpenChange,
  rule,
  brand,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: PointRule | null;
  brand: string;
  onSave: (next: PointRule) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<PointRule | null>(rule);

  useEffect(() => {
    if (open) setDraft(rule);
  }, [open, rule]);

  if (!draft) return null;

  const canEditPerEntity = draft.action === "invite_member";
  const limitChoices = canEditPerEntity
    ? LIMIT_OPTIONS
    : LIMIT_OPTIONS.filter((o) => o.value !== "per_entity");

  const pointsValid = Number.isFinite(draft.points) && draft.points >= 0 && draft.points <= 1000;
  const maxPerDayValid =
    draft.limit.type !== "per_day" || ((draft.limit.maxPerDay ?? 0) >= 1 && (draft.limit.maxPerDay ?? 0) <= 1000);
  const canSave = pointsValid && maxPerDayValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#202124] sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[#202124]">Edit Point Rule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Action</p>
            <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2 text-sm font-medium text-[#202124]">
              {draft.label}
            </div>
            <p className="mt-1 text-xs text-[#909090]">{draft.description}</p>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-[#E4E4E4] px-3 py-2.5">
            <span className="text-sm font-medium text-[#202124]">Enable this rule</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
              className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
              style={{ backgroundColor: draft.enabled ? brand : "#E4E4E4" }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: draft.enabled ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
          </label>

          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Points awarded</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1000}
                value={draft.points}
                onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
              />
              <span className="text-sm text-[#909090]">pts</span>
            </div>
            {!pointsValid && <p className="mt-1 text-xs text-red-600">Enter a value between 0 and 1000.</p>}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Limit</p>
            <select
              value={draft.limit.type}
              onChange={(e) => {
                const type = e.target.value as PointLimitType;
                setDraft({
                  ...draft,
                  limit: type === "per_day" ? { type, maxPerDay: draft.limit.maxPerDay ?? 10 } : { type },
                });
              }}
              className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
            >
              {limitChoices.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {draft.limit.type === "per_day" && (
            <div>
              <p className="mb-1 text-xs font-medium text-[#909090]">Maximum rewarded actions per day</p>
              <input
                type="number"
                min={1}
                max={1000}
                value={draft.limit.maxPerDay ?? 10}
                onChange={(e) =>
                  setDraft({ ...draft, limit: { type: "per_day", maxPerDay: Number(e.target.value) } })
                }
                className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
              />
              <p className="mt-1 text-xs text-[#909090]">
                Members can earn up to {draft.limit.maxPerDay ?? 10} points per day from this action.
              </p>
              {!maxPerDayValid && <p className="mt-1 text-xs text-red-600">Enter a value of 1 or more.</p>}
            </div>
          )}

          {draft.action === "share_video" && (
            <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] p-3 text-xs text-[#3a3a44]">
              A video post earns these points instead of the regular &ldquo;Create a post&rdquo; points — never
              both.
            </div>
          )}
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
            onClick={() => onSave(draft)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: brand }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
