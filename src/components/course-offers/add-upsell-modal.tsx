"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2, MousePointerClick } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CourseOffer, UpsellType } from "@/types/course-offers";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-[13px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

/**
 * "Select Upsell" flow — pick One-Click vs In-App, then the target offer.
 * Mirrors the GHL reference exactly: type cards with the "one one-click
 * upsell per offer" notice, then a second step for the target.
 */
export function AddUpsellModal({
  subAccountId,
  offerId,
  otherOffers,
  hasOneClick,
  open,
  onOpenChange,
  onCreated,
}: {
  subAccountId: string;
  offerId: string;
  otherOffers: CourseOffer[];
  hasOneClick: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<"type" | "target">("type");
  const [type, setType] = useState<UpsellType>("inApp");
  const [targetOfferId, setTargetOfferId] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep("type");
    setType("inApp");
    setTargetOfferId("");
  }

  async function create() {
    if (!targetOfferId) {
      toast.error("Choose an offer to upsell");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/course-offers/${offerId}/upsells`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, targetOfferId }),
        },
      );
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || d.ok === false) throw new Error(d.error ?? "Couldn't add upsell");
      toast.success("Upsell added.");
      onOpenChange(false);
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add upsell");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Upsell</DialogTitle>
          <p className="text-[13px] text-muted-foreground">
            Upsell gives you the capability to make additional sales after the
            initial purchase
          </p>
        </DialogHeader>

        {step === "type" ? (
          <div className="space-y-3">
            <Label className="text-[13px]">Choose Upsell Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={hasOneClick}
                onClick={() => setType("oneClick")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 text-center disabled:cursor-not-allowed disabled:opacity-40",
                  type === "oneClick" && !hasOneClick && "border-primary bg-primary/5",
                )}
              >
                <MousePointerClick className="h-6 w-6" />
                <span className="text-[13px] font-medium">One Click Upsell</span>
                <span className="text-[12px] text-muted-foreground">
                  Sell an offer after the initial offer is purchased
                </span>
              </button>
              <button
                type="button"
                onClick={() => setType("inApp")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 text-center",
                  type === "inApp" && "border-primary bg-primary/5",
                )}
              >
                <Layers className="h-6 w-6" />
                <span className="text-[13px] font-medium">In App Upsell</span>
                <span className="text-[12px] text-muted-foreground">
                  Lock products or offers as a bundle in the buyer&apos;s
                  library
                </span>
              </button>
            </div>
            {hasOneClick && (
              <p className="rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
                A single one-click upsell is allowed per offer
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("target")}>Continue</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <Label htmlFor="upsell-target" className="text-[13px]">
              Target offer
            </Label>
            <select
              id="upsell-target"
              className={SELECT}
              value={targetOfferId}
              onChange={(e) => setTargetOfferId(e.target.value)}
            >
              <option value="">Choose an offer…</option>
              {otherOffers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("type")}>
                Back
              </Button>
              <Button onClick={create} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Add Upsell
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
