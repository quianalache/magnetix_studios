"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ManageSubscriptionButton({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [loading, setLoading] = useState(false);

  async function manage() {
    setLoading(true);
    try {
      const response = await fetch("/api/my/billing/portal", {
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
