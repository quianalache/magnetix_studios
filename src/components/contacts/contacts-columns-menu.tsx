"use client";

import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ContactColumn } from "@/components/contacts/contact-columns";

/**
 * "Customize columns" (Contacts redesign, 2026-09-25): pick which contact
 * fields appear (Name always shows) and their order. The choice is saved per
 * user + sub-account by useContactTableColumns.
 */
export function ContactsColumnsMenu({
  all,
  selected,
  onChange,
  onReset,
}: {
  all: ContactColumn[];
  selected: string[];
  onChange: (next: string[]) => void;
  onReset: () => void;
}) {
  const valid = selected.filter((id) => all.some((c) => c.id === id));
  const unselected = all.filter((c) => !valid.includes(c.id));

  function move(id: string, delta: -1 | 1) {
    const i = valid.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= valid.length) return;
    const next = [...valid];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3 text-sm" />
        }
      >
        <Columns3 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Customize columns</span>
        <span className="sm:hidden">Columns</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-semibold">Columns</p>
          <p className="text-[11px] text-muted-foreground">Name is always shown. Saved for you on every device.</p>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {valid.map((id, idx) => {
            const col = all.find((c) => c.id === id)!;
            return (
              <div key={id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/50">
                <Checkbox
                  id={`col-${id}`}
                  checked
                  onCheckedChange={() => onChange(valid.filter((x) => x !== id))}
                />
                <label htmlFor={`col-${id}`} className="min-w-0 flex-1 truncate text-sm">
                  {col.label}
                </label>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={idx === 0}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${col.label} left`}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={idx === valid.length - 1}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${col.label} right`}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          {unselected.length > 0 && valid.length > 0 && <div className="my-1.5 border-t" />}
          {unselected.map((col) => (
            <div key={col.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/50">
              <Checkbox
                id={`col-${col.id}`}
                checked={false}
                onCheckedChange={() => onChange([...valid, col.id])}
              />
              <label htmlFor={`col-${col.id}`} className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {col.label}
              </label>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t px-3 py-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
            Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
