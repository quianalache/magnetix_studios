"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { BroadcastTemplateDoc } from "@/types";

/**
 * Lists ONLY the sub-account's own saved templates — nothing seeded, ever.
 * Empty state explicitly says so rather than nudging toward a preset, since
 * shipping preset content was explicitly ruled out for this feature.
 */
export function TemplatePickerDialog({
  open,
  onOpenChange,
  subAccountId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccountId: string;
  onPick: (template: BroadcastTemplateDoc) => void;
}) {
  const [templates, setTemplates] = useState<BroadcastTemplateDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const q = query(
      collection(getFirebaseDb(), "broadcastTemplates"),
      where("subAccountId", "==", subAccountId),
      orderBy("updatedAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTemplates(snap.docs.map((d) => d.data() as BroadcastTemplateDoc));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [open, subAccountId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Your saved templates</DialogTitle>
          <DialogDescription>
            Only templates you&apos;ve saved yourself — nothing is pre-built for you.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            You haven&apos;t saved any templates yet. Build a broadcast, then use
            &quot;Save as template&quot; to reuse it later.
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onPick(t);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm hover:bg-muted/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.subject}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
