"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";
import type { Funnel } from "@/types/checkout";

/**
 * Create Funnel — the same funnel service the Funnels page used (a named
 * funnel that starts with one Checkout step), asked for in a dialog from the
 * shared Create menu. Opens the new funnel when it's created.
 */
export function CreateFunnelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { subAccountId, saPath } = useSubAccount();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const d = await commerceFetch<{ funnel: Funnel }>(subAccountId, "funnels", { method: "POST", body: { name: name.trim() || "Untitled funnel", withCheckoutStep: true } });
      toast.success("Funnel created");
      router.push(saPath(`/pages-funnels/funnels/${d.funnel.id}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the funnel. Try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) setName("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={create} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create a funnel</DialogTitle>
            <DialogDescription>Name it now; you can add pages and set up its checkout next. Every funnel starts with a Checkout step.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-funnel-name">Funnel name</Label>
            <Input id="create-funnel-name" autoFocus placeholder="e.g. Spring Launch" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Create funnel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
