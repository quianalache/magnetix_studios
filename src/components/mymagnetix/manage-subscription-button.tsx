"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ManageSubscriptionButton({
  subscriptionId,
  endpoint = "/api/my/billing/portal",
}: {
  subscriptionId: string;
  /** Space Billing reuse (2026-09-16): a Portal visitor is authenticated
   *  via a Member session (ls_member_session), never a MyMagnetix Person
   *  session (mm_session) — the default MyMagnetix endpoint would 401 for
   *  them. Space Billing passes its own Member-authenticated sibling
   *  route instead; everything else about this button (loading state,
   *  error handling, the redirect itself) is identical either way. */
  endpoint?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function manage() {
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(
          data.error ?? "Subscription management is unavailable."
        );
      }
      window.location.assign(data.url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Subscription management is unavailable."
      );
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => void manage()}
      disabled={loading}
    >
      {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
      Manage subscription
    </Button>
  );
}
