"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Member } from "@/types/community";
import type { OfferType } from "@/types/course-offers";

/**
 * Offer-page CTA + instant signup — same two-step pattern as the Standalone
 * Course `EnrollModal` (`src/app/course/[saId]/[courseId]/enroll-modal.tsx`),
 * generalized for an Offer instead of a single course.
 */
export function EnrollOfferModal({
  saId,
  offerId,
  type,
  priceLabel,
  brand,
  member,
}: {
  saId: string;
  offerId: string;
  type: OfferType;
  priceLabel: string;
  brand: string;
  member: Member | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "checkout">("form");
  const [name, setName] = useState(member?.displayName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const cta = type === "free" ? "Enroll Now" : `Enroll Now — ${priceLabel}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offer/${saId}/${offerId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        mode?: "free" | "paid";
        redirectTo?: string;
        clientSecret?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't sign up. Try again.");
      }
      if (data.mode === "free" && data.redirectTo) {
        router.push(data.redirectTo);
        return;
      }
      if (data.mode === "paid" && data.clientSecret) {
        setClientSecret(data.clientSecret);
        setStep("checkout");
        return;
      }
      throw new Error("Something went wrong. Try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign up. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setStep("form");
          setClientSecret(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {cta}
      </DialogTrigger>
      <DialogContent
        className={step === "checkout" ? "sm:max-w-lg" : "sm:max-w-sm"}
      >
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>{cta}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="offer-enroll-name">Name</Label>
                <Input
                  id="offer-enroll-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-enroll-email">Email</Label>
                <Input
                  id="offer-enroll-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-enroll-phone">Phone</Label>
                <Input
                  id="offer-enroll-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={busy}
                className="w-full"
                style={{ backgroundColor: brand }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {type === "free" ? "Enroll Now" : "Continue to payment"}
              </Button>
            </form>
          </>
        ) : (
          clientSecret && (
            <EmbeddedCheckoutProvider
              stripe={getStripe()}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
