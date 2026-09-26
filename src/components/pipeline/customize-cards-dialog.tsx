"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CARD_FIELDS, type CardFieldKey } from "@/types/pipeline-cards";

/**
 * Customize Cards (Multiple Pipelines, 2026-09-25) — pick which facts deal
 * cards show on this pipeline, for you. Display only: deal records are
 * never changed. The deal title always shows.
 */
export function CustomizeCardsDialog({
  open,
  onOpenChange,
  fields,
  onChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: CardFieldKey[];
  onChange: (next: CardFieldKey[]) => void;
  onReset: () => void;
}) {
  const toggle = (k: CardFieldKey) =>
    onChange(
      fields.includes(k)
        ? fields.filter((f) => f !== k)
        : CARD_FIELDS.map((f) => f.key).filter((f) => f === k || fields.includes(f)),
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Cards</DialogTitle>
          <DialogDescription>
            Choose what deal cards show on this pipeline. The deal title always shows; a field only
            appears on a card when the deal has that information.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <div className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-primary bg-primary text-primary-foreground opacity-60">
              <Check className="h-3.5 w-3.5" />
            </span>
            Deal title <span className="text-xs">(always shown)</span>
          </div>
          {CARD_FIELDS.map((f) => {
            const on = fields.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(f.key)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                  )}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block">{f.label}</span>
                  {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onReset}>
            Reset to default
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
