"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import type { Contact } from "@/types/contacts";

/** Client Portal access for this contact — copy their sign-in link or email it to them directly. */
export function ContactPortalAccess({ contact }: { contact: Contact }) {
  const { subAccountId } = useSubAccount();
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const portalUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/portal/${subAccountId}/login`
      : `/portal/${subAccountId}/login`;

  async function handleCopy() {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleInvite() {
    if (!contact.email.trim()) {
      toast.error("This contact has no email on file.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/portal/${subAccountId}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contact.email }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Portal sign-in link sent to ${contact.email}.`);
    } catch {
      toast.error("Couldn't send the invite. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Client Portal
        </p>
        <p className="mt-0.5 text-sm font-semibold">
          Courses, readings, bookings &amp; invoices in one place
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1 justify-start">
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy portal link"}
        </Button>
        <Button size="sm" onClick={handleInvite} disabled={sending} className="flex-1 justify-start">
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Email invite
        </Button>
      </div>
    </div>
  );
}
