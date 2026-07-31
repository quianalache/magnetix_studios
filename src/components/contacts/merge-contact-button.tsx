"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Merge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactPicker } from "@/components/quotes/contact-picker";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import type { Contact } from "@/types/contacts";

/**
 * GoHighLevel-style "merge duplicate contacts" tool. Pick a second
 * contact, choose which of the two becomes the survivor, resolve the
 * primary email/phone if they differ, and confirm. The other record's
 * tags/custom fields/conversation history fold onto the survivor and
 * it's removed. Not reversible.
 */
export function MergeContactButton({ contact }: { contact: Contact }) {
  const { subAccountId, agencyId, isAdmin, saPath } = useSubAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [otherId, setOtherId] = useState("");
  const [survivorIsSelf, setSurvivorIsSelf] = useState(true);
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!open || !agencyId) return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, (list) =>
      setContacts(list.filter((c) => c.id !== contact.id)),
    );
    return () => unsub();
  }, [open, agencyId, subAccountId, contact.id]);

  const other = contacts.find((c) => c.id === otherId) ?? null;
  const survivor = survivorIsSelf ? contact : other;
  const loser = survivorIsSelf ? other : contact;

  const emailChoices = useMemo(
    () =>
      Array.from(
        new Set([contact.email, other?.email].filter((v): v is string => !!v)),
      ),
    [contact.email, other?.email],
  );
  const phoneChoices = useMemo(
    () =>
      Array.from(
        new Set([contact.phone, other?.phone].filter((v): v is string => !!v)),
      ),
    [contact.phone, other?.phone],
  );

  useEffect(() => {
    setPrimaryEmail(emailChoices[0] ?? "");
    setPrimaryPhone(phoneChoices[0] ?? "");
  }, [emailChoices, phoneChoices]);

  if (!isAdmin) return null;

  async function handleMerge() {
    if (!other || !survivor || !loser) return;
    setMerging(true);
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivorId: survivor.id,
          loserId: loser.id,
          primaryEmail: primaryEmail || undefined,
          primaryPhone: primaryPhone || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        survivorId?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't merge these contacts.");
      }
      toast.success("Contacts merged.");
      setOpen(false);
      router.push(saPath(`/contacts/${survivor.id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't merge contacts.");
    } finally {
      setMerging(false);
    }
  }

  function reset(o: boolean) {
    if (merging) return;
    setOpen(o);
    if (o) {
      setOtherId("");
      setSurvivorIsSelf(true);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => reset(true)}
        title="Merge this contact with a duplicate"
      >
        <Merge className="mr-1 h-3.5 w-3.5" />
        Merge
      </Button>

      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge duplicate contacts</DialogTitle>
            <DialogDescription>
              Pick the duplicate contact. Everything on the loser — deals,
              tasks, bookings, quotes, conversation history — moves onto the
              survivor, and the loser is deleted. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Duplicate contact</Label>
              <ContactPicker
                contacts={contacts}
                value={otherId}
                onChange={setOtherId}
                title="Pick the duplicate contact"
                placeholder="Choose the contact to merge with…"
              />
            </div>

            {other && (
              <>
                <div className="space-y-1.5">
                  <Label>Keep as the primary contact</Label>
                  <div className="space-y-1">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="merge-survivor"
                        checked={survivorIsSelf}
                        onChange={() => setSurvivorIsSelf(true)}
                      />
                      {contact.name || contact.email || "This contact"}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="merge-survivor"
                        checked={!survivorIsSelf}
                        onChange={() => setSurvivorIsSelf(false)}
                      />
                      {other.name || other.email || "The duplicate"}
                    </label>
                  </div>
                </div>

                {emailChoices.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Primary email</Label>
                    <div className="space-y-1">
                      {emailChoices.map((e) => (
                        <label key={e} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="merge-primary-email"
                            checked={primaryEmail === e}
                            onChange={() => setPrimaryEmail(e)}
                          />
                          {e}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {phoneChoices.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Primary phone</Label>
                    <div className="space-y-1">
                      {phoneChoices.map((p) => (
                        <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="merge-primary-phone"
                            checked={primaryPhone === p}
                            onChange={() => setPrimaryPhone(p)}
                          />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={merging}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={!other || merging}>
              {merging ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Merging…
                </>
              ) : (
                "Merge contacts"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
