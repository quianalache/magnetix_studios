"use client";

import { useEffect, useState } from "react";
import { GripVertical, ListChecks, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
  MAX_POLL_OPTION_LENGTH,
} from "@/lib/community/poll-limits";
import { cn } from "@/lib/utils";

export interface PollOptionDraft {
  id: string;
  text: string;
}

export interface PollDraftState {
  options: PollOptionDraft[];
  allowMultiple: boolean;
  showResults: boolean;
  /** `<input type="datetime-local">` value, or "" for no end date. */
  endsAt: string;
}

let optionSeq = 0;
function newOptionId() {
  optionSeq += 1;
  return `draft_${optionSeq}_${Date.now()}`;
}

export function emptyPollDraft(): PollDraftState {
  return {
    options: [{ id: newOptionId(), text: "" }, { id: newOptionId(), text: "" }],
    allowMultiple: false,
    showResults: false,
    endsAt: "",
  };
}

/**
 * The actual poll-EDITING implementation — option rows (drag reorder,
 * remove, add), and the three settings checkboxes. Extracted out of
 * `CreatePollSheet`'s own popup chrome (composer correction pass) so this
 * SAME implementation — same limits, same locking, same drag mechanics —
 * can be mounted two ways without being written twice:
 *  - inline, directly inside `PostComposer`'s Create Post modal body (the
 *    actual product behavior: Poll is part of the post being composed,
 *    not a second popup layered on top of the first — see PostComposer's
 *    own module comment for why this replaced the old `CreatePollSheet`
 *    popup there), and
 *  - standalone, inside `CreatePollSheet` below (kept working — nothing
 *    currently mounts it after the correction pass, but it's real,
 *    functioning code, not a stub, should a future surface want a
 *    standalone poll sheet without embedding it inline).
 *
 * Deliberately controlled (`draft`/`onChange`), not self-contained local
 * state — the composer needs `poll` in ITS OWN state (submitted together
 * with title/body/attachments on Post), not hidden inside a child only
 * that child can read.
 */
export function PollDraftFields({
  draft,
  onChange,
  locked,
}: {
  draft: PollDraftState;
  onChange: (draft: PollDraftState) => void;
  /** True once the poll already has votes — options/allowMultiple become
   *  read-only (Part 9's "no destructive changes after votes exist"), the
   *  UI enforces this too, not just the server. */
  locked?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.options.findIndex((o) => o.id === active.id);
    const newIndex = draft.options.findIndex((o) => o.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({ ...draft, options: arrayMove(draft.options, oldIndex, newIndex) });
  }

  function updateOption(id: string, text: string) {
    onChange({ ...draft, options: draft.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  }

  function removeOption(id: string) {
    if (draft.options.length <= MIN_POLL_OPTIONS) return;
    onChange({ ...draft, options: draft.options.filter((o) => o.id !== id) });
  }

  function addOption() {
    if (draft.options.length >= MAX_POLL_OPTIONS) return;
    onChange({ ...draft, options: [...draft.options, { id: newOptionId(), text: "" }] });
  }

  return (
    <div className="space-y-4">
      {locked && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This poll already has votes, so options and the multiple-answer setting are locked. You can still update results visibility and the end date.
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-[#202124]">Options</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draft.options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {draft.options.map((opt, i) => (
                <PollOptionRow
                  key={opt.id}
                  option={opt}
                  index={i}
                  disabled={!!locked}
                  canRemove={draft.options.length > MIN_POLL_OPTIONS && !locked}
                  onChange={(text) => updateOption(opt.id, text)}
                  onRemove={() => removeOption(opt.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {!locked && draft.options.length < MAX_POLL_OPTIONS && (
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={addOption}>
            + Add option
          </Button>
        )}
      </div>

      <div className="space-y-3 border-t border-[#f0f0f0] pt-3">
        <p className="text-sm font-medium text-[#202124]">Settings</p>
        <label className="flex items-center gap-2 text-sm text-[#3a3a44]">
          <input
            type="checkbox"
            disabled={!!locked}
            checked={draft.allowMultiple}
            onChange={(e) => onChange({ ...draft, allowMultiple: e.target.checked })}
            className="h-4 w-4 rounded border-[#E4E4E4]"
          />
          Allow multiple answers
        </label>
        <label className="flex items-center gap-2 text-sm text-[#3a3a44]">
          <input
            type="checkbox"
            checked={draft.showResults}
            onChange={(e) => onChange({ ...draft, showResults: e.target.checked })}
            className="h-4 w-4 rounded border-[#E4E4E4]"
          />
          Allow members to see results
        </label>
        <label className="flex items-center gap-2 text-sm text-[#3a3a44]">
          <input
            type="checkbox"
            checked={!!draft.endsAt}
            onChange={(e) =>
              onChange({ ...draft, endsAt: e.target.checked ? draft.endsAt || defaultEndsAtValue() : "" })
            }
            className="h-4 w-4 rounded border-[#E4E4E4]"
          />
          Set an end date
        </label>
        {draft.endsAt && (
          <input
            type="datetime-local"
            value={draft.endsAt}
            min={defaultEndsAtValue()}
            onChange={(e) => onChange({ ...draft, endsAt: e.target.value })}
            className="ml-6 rounded-md border border-[#E4E4E4] px-2 py-1.5 text-sm"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Standalone Create/Edit Poll bottom sheet, built entirely on top of
 * `PollDraftFields` above. As of the composer correction pass, `PostComposer`
 * no longer mounts this — Poll now expands inline in the Create Post modal
 * instead of opening a second popup over it. Left working (not deleted) —
 * see the module comment on `PollDraftFields` for why.
 */
export function CreatePollSheet({
  open,
  onOpenChange,
  initial,
  locked,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PollDraftState;
  locked?: boolean;
  onSave: (draft: PollDraftState) => void;
}) {
  const [draft, setDraft] = useState<PollDraftState>(initial);

  useEffect(() => {
    if (open) setDraft(initial);
    // Reset to the current `initial` every time the sheet opens — editing
    // an already-attached poll a second time should start from what's
    // actually there, not stale state from the first edit session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filledCount = draft.options.filter((o) => o.text.trim()).length;
  const canSave = filledCount >= MIN_POLL_OPTIONS;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Desktop centering (Part 2: "appropriately sized modal/panel")
        // MUST be qualified with `data-[side=bottom]:` on every override,
        // not just `sm:` — SheetContent's own base classes already apply
        // `data-[side=bottom]:inset-x-0` etc. unconditionally, and that
        // compound (class + attribute selector) beats a plain `sm:`
        // single-class rule on specificity regardless of viewport width,
        // so a bare `sm:inset-x-auto` silently loses and never applies.
        // Confirmed live: without this, the sheet stayed pinned flush-left
        // full-bleed on desktop even past the `sm:` breakpoint.
        //
        // NOTE this pattern only ever centers HORIZONTALLY — it never
        // overrides `bottom-0`, so the sheet still sits flush against the
        // bottom edge of the viewport even on desktop. That was fine for
        // THIS sheet (a small, intentionally bottom-anchored panel) but
        // turned out to be exactly wrong when the SAME pattern was reused
        // for the much bigger Create Post modal — see PostComposer's own
        // module comment for the real fix used there (a purpose-built
        // centered dialog on desktop, not another override on this
        // pattern).
        className="max-h-[85vh] overflow-y-auto sm:data-[side=bottom]:inset-x-auto sm:data-[side=bottom]:left-1/2 sm:data-[side=bottom]:right-auto sm:data-[side=bottom]:w-full sm:data-[side=bottom]:max-w-md sm:data-[side=bottom]:-translate-x-1/2 sm:data-[side=bottom]:rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Create poll
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 p-4 pt-0">
          <PollDraftFields draft={draft} onChange={setDraft} locked={locked} />

          <div className="flex justify-end gap-2 border-t border-[#f0f0f0] pt-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => {
                onSave({ ...draft, options: draft.options.filter((o) => o.text.trim()) });
                onOpenChange(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function defaultEndsAtValue(): string {
  // One hour from now, formatted for `<input type="datetime-local">` —
  // just a sensible starting point the moderator adjusts, not a real
  // default choice (the server independently rejects a non-future date
  // regardless of what this pre-fills).
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PollOptionRow({
  option,
  index,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: {
  option: PollOptionDraft;
  index: number;
  disabled: boolean;
  canRemove: boolean;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className={cn("shrink-0 text-[#c4c4c4]", disabled ? "cursor-not-allowed" : "cursor-grab hover:text-[#909090]")}
        aria-label="Reorder option"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <input
        value={option.text}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_POLL_OPTION_LENGTH))}
        placeholder={`Option ${index + 1}`}
        className="min-w-0 flex-1 rounded-lg border border-[#E4E4E4] px-3 py-2 text-sm outline-none focus:border-[#b4b4b4] disabled:bg-[#F8F7F5] disabled:text-[#909090]"
      />
      <button
        type="button"
        disabled={!canRemove}
        onClick={onRemove}
        title="Remove option"
        className="shrink-0 text-[#c4c4c4] hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
