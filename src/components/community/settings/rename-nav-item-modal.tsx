"use client";

import { useState, type ComponentType } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NAV_LABEL_MAX_CHARS } from "@/lib/community/community-navigation";

/**
 * The approved "Rename this tab" modal — one small, simple dialog reused
 * for every one of the 6 nav rows (Part 7: same modal, not a per-row
 * implementation). Built directly on the plain `DialogContent` primitive
 * rather than the bigger custom Create/Edit Channel modal shell — there's
 * nothing here that needs a responsive bottom-sheet-on-mobile treatment,
 * just a small centered popup, so the simpler existing primitive is the
 * right fit (per the "reuse existing... don't duplicate" instruction).
 *
 * `bg-white`/`text-[#202124]` override `DialogContent`'s own
 * `bg-background`/theme-token default — same fix the Create/Edit Channel
 * modal needed: Community stays hardcoded-light regardless of the app's
 * global dark/light class (confirmed live during the Channels QA pass).
 */
export function RenameNavItemModal({
  open,
  onOpenChange,
  icon: Icon,
  currentLabel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ComponentType<{ className?: string }>;
  currentLabel: string;
  onSave: (label: string) => void;
}) {
  const [value, setValue] = useState(currentLabel);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= NAV_LABEL_MAX_CHARS;

  // Re-seed the draft text with THIS row's current label every time the
  // modal opens, so a previous row's leftover typed text never leaks into
  // the next row's modal.
  function handleOpenChange(next: boolean) {
    if (next) setValue(currentLabel);
    onOpenChange(next);
  }

  function save() {
    if (!canSave) return;
    onSave(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-white text-[#202124]" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[#202124]">Rename this tab</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-[#E4E4E4] px-3 py-2">
          <Icon className="h-4 w-4 shrink-0 text-[#909090]" />
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, NAV_LABEL_MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-[#202124] outline-none"
            placeholder="Tab label"
          />
        </div>
        {!canSave && trimmed.length === 0 && (
          <p className="text-xs text-red-600">A tab label can&apos;t be blank.</p>
        )}
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
            onClick={save}
            disabled={!canSave}
            className="rounded-md bg-[#202124] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
