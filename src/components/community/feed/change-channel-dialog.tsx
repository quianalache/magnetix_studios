"use client";

import { Check, X } from "lucide-react";

/**
 * "Change Channel" — moves a post to a different channel/category
 * (distinct from Pin to Channel, which features a post at the top of its
 * CURRENT channel without moving it — see feed-view.tsx's togglePin).
 * Shows every channel this community has, current one clearly marked,
 * pick a different one to reassign.
 */
export function ChangeChannelDialog({
  categories,
  currentCategory,
  saving,
  onSelect,
  onClose,
}: {
  categories: string[];
  currentCategory: string | null;
  saving: boolean;
  onSelect: (category: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-channel-title"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border bg-white p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="change-channel-title" className="text-sm font-semibold">
            Change Channel
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-[#909090]">
            This community has no other channels to move this post to yet.
          </p>
        ) : (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {categories.map((c) => {
              const isCurrent = c === currentCategory;
              return (
                <button
                  key={c}
                  disabled={saving || isCurrent}
                  onClick={() => onSelect(c)}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F5F4FB] disabled:cursor-default disabled:opacity-60"
                >
                  <span>{c}</span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-xs font-medium text-[#5E2574]">
                      <Check className="h-3.5 w-3.5" /> Current
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
