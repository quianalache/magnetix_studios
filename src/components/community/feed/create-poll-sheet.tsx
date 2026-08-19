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
 * The Create/Edit Poll bottom sheet — Parts 2–4 of the Polls spec, built
 * to the interaction shape of the two attached GoCollab reference
 * screenshots (draggable option rows with a trash icon, a Settings section
 * below with three checkboxes, Cancel/Save at the bottom) recreated in
 * Magnetix's own visual system, not their colors/branding. Reuses
 * `Sheet`'s existing `side="bottom"` variant (already how "New Form"
 * presents itself elsewhere in this codebase) rather than inventing a
 * second bottom-sheet primitive; on wider viewports the same sheet is
 * constrained to a centered, appropriately-sized panel via `className`
 * (Part 2: "Desktop can use the same design language in an appropriately
 * sized modal/panel" — one component, not a second desktop-only one).
 *
 * Purely a DRAFT editor — nothing here talks to the network. `onSave`
 * hands the draft back to `PostComposer`, which holds it as part of the
 * post being composed and submits it together with title/body/attachments
 * on Post/Save (same "attachment tray" mental model images/voice/files
 * already use), or (edit mode on an existing post) PATCHes it directly.
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
  /** True once the poll already has votes — options/allowMultiple become
   *  read-only (Part 9's "no destructive changes after votes exist"), the
   *  UI enforces this too, not just the server. */
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const oldIndex = d.options.findIndex((o) => o.id === active.id);
      const newIndex = d.options.findIndex((o) => o.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return d;
      return { ...d, options: arrayMove(d.options, oldIndex, newIndex) };
    });
  }

  function updateOption(id: string, text: string) {
    setDraft((d) => ({ ...d, options: d.options.map((o) => (o.id === id ? { ...o, text } : o)) }));
  }

  function removeOption(id: string) {
    setDraft((d) => (d.options.length <= MIN_POLL_OPTIONS ? d : { ...d, options: d.options.filter((o) => o.id !== id) }));
  }

  function addOption() {
    setDraft((d) => (d.options.length >= MAX_POLL_OPTIONS ? d : { ...d, options: [...d.options, { id: newOptionId(), text: "" }] }));
  }

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
        className="max-h-[85vh] overflow-y-auto sm:data-[side=bottom]:inset-x-auto sm:data-[side=bottom]:left-1/2 sm:data-[side=bottom]:right-auto sm:data-[side=bottom]:w-full sm:data-[side=bottom]:max-w-md sm:data-[side=bottom]:-translate-x-1/2 sm:data-[side=bottom]:rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Create poll
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 p-4 pt-0">
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
                onChange={(e) => setDraft((d) => ({ ...d, allowMultiple: e.target.checked }))}
                className="h-4 w-4 rounded border-[#E4E4E4]"
              />
              Allow multiple answers
            </label>
            <label className="flex items-center gap-2 text-sm text-[#3a3a44]">
              <input
                type="checkbox"
                checked={draft.showResults}
                onChange={(e) => setDraft((d) => ({ ...d, showResults: e.target.checked }))}
                className="h-4 w-4 rounded border-[#E4E4E4]"
              />
              Allow members to see results
            </label>
            <label className="flex items-center gap-2 text-sm text-[#3a3a44]">
              <input
                type="checkbox"
                checked={!!draft.endsAt}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, endsAt: e.target.checked ? d.endsAt || defaultEndsAtValue() : "" }))
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
                onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                className="ml-6 rounded-md border border-[#E4E4E4] px-2 py-1.5 text-sm"
              />
            )}
          </div>

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
