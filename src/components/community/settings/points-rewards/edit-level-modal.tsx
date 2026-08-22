"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CommunityLevel } from "@/types/points-rewards";

const LEVEL_NAME_MAX = 30;

/**
 * Community Settings → Points & Rewards → Levels → "Edit Level" — the
 * approved mockup's focused modal. `level` (the 1–9 number) is always
 * read-only (no reordering/deletion in V1); `nextThreshold` (the level
 * above this one's threshold, or null for Level 9) drives the live
 * "Members with X–Y points will be Level N - Name" preview line.
 */
export function EditLevelModal({
  open,
  onOpenChange,
  level,
  prevThreshold,
  nextThreshold,
  brand,
  onSave,
  saving,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: CommunityLevel | null;
  /** The level below this one's threshold — this level's own threshold
   *  must be strictly greater. Null for Level 1 (always 0, not editable). */
  prevThreshold: number | null;
  /** The level above this one's threshold, exclusive. Null for Level 9
   *  (no ceiling). */
  nextThreshold: number | null;
  brand: string;
  onSave: (next: CommunityLevel) => void;
  saving: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(level?.name ?? "");
  const [threshold, setThreshold] = useState(level?.threshold ?? 0);

  useEffect(() => {
    if (open && level) {
      setName(level.name);
      setThreshold(level.threshold);
    }
  }, [open, level]);

  if (!level) return null;

  const isLevelOne = level.level === 1;
  const trimmedName = name.trim();
  const thresholdValid =
    isLevelOne ||
    (Number.isFinite(threshold) &&
      threshold > (prevThreshold ?? -1) &&
      (nextThreshold === null || threshold < nextThreshold));
  const canSave = trimmedName.length > 0 && trimmedName.length <= LEVEL_NAME_MAX && thresholdValid;

  const upperBound = nextThreshold !== null ? nextThreshold - 1 : null;
  const rangeLabel =
    threshold >= 0 && thresholdValid
      ? `Members with ${threshold.toLocaleString()}${upperBound !== null ? `–${upperBound.toLocaleString()}` : "+"} points will be Level ${level.level} - ${trimmedName || "…"}.`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#202124] sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[#202124]">Edit Level</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Level</p>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              {level.level}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-[#909090]">Level name</p>
              <p className="text-xs text-[#b4b4b4]">
                {trimmedName.length} / {LEVEL_NAME_MAX}
              </p>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, LEVEL_NAME_MAX))}
              className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-[#909090]">Points required to reach this level</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                disabled={isLevelOne}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm text-[#202124] outline-none disabled:bg-[#F8F7F5] disabled:text-[#909090]"
              />
              <span className="text-sm text-[#909090]">pts</span>
            </div>
            {isLevelOne && <p className="mt-1 text-xs text-[#909090]">Level 1 always starts at 0 points.</p>}
            {!isLevelOne && !thresholdValid && (
              <p className="mt-1 text-xs text-red-600">
                Must be greater than Level {level.level - 1}&apos;s threshold
                {upperBound !== null ? ` and less than Level ${level.level + 1}'s` : ""}.
              </p>
            )}
          </div>

          {rangeLabel && (
            <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] p-3 text-xs text-[#3a3a44]">
              {rangeLabel}
            </div>
          )}

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
            onClick={() => onSave({ ...level, name: trimmedName, threshold })}
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
