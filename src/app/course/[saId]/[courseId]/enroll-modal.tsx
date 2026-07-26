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

/**
 * Sales-page CTA + instant signup. Replaces the old magic-link-first flow:
 * clicking "Enroll Now" opens a popup that collects name/email/phone right
 * there — for every course, free or paid, no email round trip. Free courses
 * drop straight into the classroom; paid courses transition the same dialog
 * to an embedded Stripe Checkout form for the card.
 */
export function EnrollModal({
  saId,
  courseId,
  access,
  priceLabel,
  brand,
  member,
}: {
  saId: string;
  courseId: string;
  access: "open" | "purchase";
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

  const cta =
    access === "purchase" ? `Enroll Now — ${priceLabel}` : "Enroll Now";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/course/${saId}/${courseId}/signup`, {
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
                <Label htmlFor="enroll-name">Name</Label>
                <Input
                  id="enroll-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enroll-email">Email</Label>
                <Input
                  id="enroll-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enroll-phone">Phone</Label>
                <Input
                  id="enroll-phone"
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
                {access === "purchase" ? "Continue to payment" : "Enroll Now"}
              </Button>
              <p className="text-center text-xs text-[#909090]">
                Already purchased?{" "}
                <a
                  href={`/course/${saId}/login?course=${courseId}`}
                  className="underline"
                >
                  Log in
                </a>
              </p>
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
