"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe/client";
import { readAttributionFromBrowser } from "@/lib/attribution";
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
import { Checkbox } from "@/components/ui/checkbox";
import type { Member } from "@/types/community";
import type {
  CourseOfferCheckoutSettings,
  OfferType,
} from "@/types/course-offers";

type CheckoutMember = Pick<Member, "email" | "displayName" | "phone">;

/**
 * Offer-page CTA + instant signup — same two-step pattern as the Standalone
 * Course `EnrollModal` (`src/app/course/[saId]/[courseId]/enroll-modal.tsx`),
 * generalized for an Offer instead of a single course. Phone/Address fields
 * and the Service Agreement checkbox are conditional on `checkoutSettings`
 * (the Offer's "Extra Contact Information" / "Service Agreement" checkout
 * options) rather than always collected.
 */
export function EnrollOfferModal({
  saId,
  offerId,
  type,
  priceLabel,
  brand,
  member,
  checkoutSettings,
}: {
  saId: string;
  offerId: string;
  type: OfferType;
  priceLabel: string;
  brand: string;
  member: CheckoutMember | null;
  checkoutSettings: CourseOfferCheckoutSettings;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "checkout">("form");
  const [name, setName] = useState(member?.displayName ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [address, setAddress] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  // Snapshot on mount, same pattern as the hosted-form flow — before
  // anything could change window.location.
  const attributionRef = useRef(readAttributionFromBrowser());

  const cta = type === "free" ? "Enroll Now" : `Enroll Now — ${priceLabel}`;
  const { serviceAgreement } = checkoutSettings;
  const agreementRequired = serviceAgreement.mode !== "notRequired";
  const agreementText =
    serviceAgreement.mode === "custom"
      ? serviceAgreement.customText
      : "I have read and agree to the terms and conditions of this page.";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (agreementRequired && !agreementAccepted) {
      setError("You must agree to the terms before continuing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offer/${saId}/${offerId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          address,
          serviceAgreementAccepted: agreementAccepted,
          attribution: attributionRef.current,
        }),
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
      setError(
        err instanceof Error ? err.message : "Couldn't sign up. Try again."
      );
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
        className={
          step === "checkout"
            ? "max-h-[90vh] overflow-y-auto sm:max-w-lg"
            : "sm:max-w-sm"
        }
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
              {checkoutSettings.collectPhoneNumber && (
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
              )}
              {checkoutSettings.collectAddress && (
                <div className="space-y-1.5">
                  <Label htmlFor="offer-enroll-address">Address</Label>
                  <Input
                    id="offer-enroll-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </div>
              )}
              {agreementRequired && (
                <label className="text-muted-foreground flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={agreementAccepted}
                    onCheckedChange={(v) => setAgreementAccepted(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    {agreementText}
                    {serviceAgreement.linkUrl && (
                      <>
                        {" "}
                        <a
                          href={serviceAgreement.linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          View agreement
                        </a>
                      </>
                    )}
                  </span>
                </label>
              )}
              {error && <p className="text-destructive text-xs">{error}</p>}
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
