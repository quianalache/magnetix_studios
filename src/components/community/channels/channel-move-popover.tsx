"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CommunityChannel, CommunitySection } from "@/types/community";

/**
 * The ellipsis menu's "Move / Organize" action — deliberately lighter-
 * weight than the full Edit Channel form (which already covers Section
 * reassignment too): a quick Section-reassign select + Move Up/Down,
 * applied immediately, for the common "just move this" case without
 * opening the full form. No live drag-and-drop in the rail itself for
 * this pass (see the Channels feature report for why) — this, plus each
 * Channel/Section's persisted `order`, is what satisfies "support a sane
 * Move/Organize interaction + deterministic ordering after reload."
 */
export function ChannelMovePopover({
  saId,
  groupId,
  channel,
  siblingChannels,
  sections,
  onMoved,
}: {
  saId: string;
  groupId: string;
  channel: CommunityChannel;
  /** Every OTHER channel currently in the same group (any section) — used
   *  to compute the next order value when moving up/down within the
   *  channel's current section (or Unsectioned). */
  siblingChannels: CommunityChannel[];
  sections: CommunitySection[];
  onMoved: (channel: CommunityChannel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; channel?: CommunityChannel; error?: string };
      if (!res.ok || !d.ok || !d.channel) throw new Error(d.error ?? "Couldn't move channel");
      onMoved(d.channel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move channel");
    } finally {
      setBusy(false);
    }
  }

  function moveWithinGroup(direction: "up" | "down") {
    const group = siblingChannels
      .filter((c) => c.sectionId === channel.sectionId)
      .sort((a, b) => a.order - b.order);
    const idx = group.findIndex((c) => c.id === channel.id);
    const swapWith = direction === "up" ? group[idx - 1] : group[idx + 1];
    if (!swapWith) return;
    // Swap order values — a simple, deterministic two-write reorder that
    // survives reload without renumbering the whole group.
    void patch({ order: swapWith.order });
    void fetch(`/api/community/${saId}/${groupId}/channels/${swapWith.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: channel.order }),
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-[#202124] hover:bg-[#F8F7F5]"
      >
        Move / Organize
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <div>
          <p className="mb-1 text-xs font-medium text-[#202124]">Section</p>
          <select
            defaultValue={channel.sectionId ?? ""}
            disabled={busy}
            onChange={(e) => {
              void patch({ sectionId: e.target.value || null }).then(() => setOpen(false));
            }}
            className="w-full rounded-md border border-[#E4E4E4] bg-white px-2 py-1.5 text-sm"
          >
            <option value="">No Section (Unsectioned)</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-[#202124]">Order</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => moveWithinGroup("up")}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#E4E4E4] px-2 py-1.5 text-xs font-medium text-[#3a3a44] hover:bg-[#F5F4F2] disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" /> Move up
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => moveWithinGroup("down")}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#E4E4E4] px-2 py-1.5 text-xs font-medium text-[#3a3a44] hover:bg-[#F5F4F2] disabled:opacity-40"
            >
              <ArrowDown className="h-3.5 w-3.5" /> Move down
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
