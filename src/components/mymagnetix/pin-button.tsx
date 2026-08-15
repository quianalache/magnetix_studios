"use client";

import { useState, useTransition } from "react";
import { Pin } from "lucide-react";

export function PinButton({ pinKey, initialPinned }: { pinKey: string; initialPinned: boolean }) {
  const [pinned, setPinnedState] = useState(initialPinned);
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title={pinned ? "Unpin" : "Pin"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !pinned;
        setPinnedState(next);
        startTransition(async () => {
          await fetch("/api/my/pins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pinKey, pinned: next }),
          }).catch(() => setPinnedState(!next));
        });
      }}
      disabled={isPending}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
        pinned ? "text-[#5E2574]" : "text-[#B5B3AE] hover:text-[#5E2574]"
      }`}
    >
      <Pin className="h-4 w-4" fill={pinned ? "currentColor" : "none"} />
    </button>
  );
}
