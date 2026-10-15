"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DecoderContactPicker, contactDisplayLabel } from "@/components/energetic-decoder/contact-picker";
import type { Contact } from "@/types/contacts";

/**
 * Legacy-reading repair (Wave 2 follow-up, 2026-10-15): attach an existing
 * contact to a reading whose original contact no longer exists. Picks with
 * the same contact picker as New Reading, then saves ONLY the relationship
 * (POST …/readings/[id]/contact — refused server-side unless the current
 * link is broken). The reading itself is never changed.
 */
export function LinkReadingContactDialog({
  open,
  onOpenChange,
  readingId,
  readingName,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readingId: string;
  readingName: string;
  onLinked: (contactId: string) => void;
}) {
  const { subAccountId, agencyId } = useSubAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !agencyId || !subAccountId) return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, setContacts, () => setContacts([]));
    return () => unsub();
  }, [open, agencyId, subAccountId]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setError(null);
    }
  }, [open]);

  async function link() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings/${readingId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selected.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't link this contact.");
      toast.success(`Reading linked to ${contactDisplayLabel(selected)}.`);
      onLinked(selected.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't link this contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-title-md font-semibold tracking-tight">Link a contact</DialogTitle>
          <DialogDescription>
            {readingName}&apos;s reading points to a contact that no longer exists. Choose their current contact — only the
            link changes; the reading stays exactly as it is.
          </DialogDescription>
        </DialogHeader>
        <DecoderContactPicker contacts={contacts} onPick={setSelected} selectedId={selected?.id ?? null} disabled={saving} />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="min-w-0 truncate text-caption text-muted-foreground">
            {selected ? (
              <>
                Link to <span className="font-semibold text-foreground">{contactDisplayLabel(selected)}</span>
              </>
            ) : (
              "Select a contact above"
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void link()} disabled={!selected || saving}>
              <Link2 className="size-4" />
              {saving ? "Linking…" : "Link contact"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
