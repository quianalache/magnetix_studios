"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

/**
 * Sub-account Stripe Connect settings panel — the real fix for the
 * "student's course sale deposits into the agency owner's Stripe account"
 * problem (see the Aug 2026 Build Log entry). Once connected, Course
 * Offer / Standalone Course checkout runs as a direct charge on THIS
 * account instead of the shared platform one.
 *
 * Admin-only, same as SubAccountPayPalSection. `subAccount.stripeConnect`
 * is read straight off the live sub-account doc — no secret tokens are
 * stored there (see connect.ts's doc comment), so it's safe to expose the
 * same way paypalConfig already is.
 */

const STATUS_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Stripe connected." },
  cancelled: { ok: false, text: "Connection cancelled." },
  bad_state: { ok: false, text: "Connection failed a security check. Try again." },
  not_configured: {
    ok: false,
    text: "Stripe Connect isn't configured on this deployment yet.",
  },
  error: { ok: false, text: "Couldn't connect Stripe. Please try again." },
};

export function SubAccountStripeSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const connection = subAccount?.stripeConnect ?? null;
  const connected = !!connection?.accountId;

  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("stripeconnect");
    if (!s) return;
    const msg = STATUS_MESSAGES[s];
    if (msg) {
      if (msg.ok) toast.success(msg.text);
      else toast.error(msg.text);
    }
    params.delete("stripeconnect");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  if (!isAdmin) return null;

  function handleConnect() {
    window.location.href = `/api/sub-accounts/${subAccountId}/stripe-connect/connect`;
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect Stripe? Course/product checkout that requires card payment will stop working until you reconnect, unless PayPal is also set up.",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/stripe-connect`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to disconnect.");
      }
      toast.success("Stripe disconnected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <CreditCard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Payments — Stripe</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect your own Stripe account so card payments on your courses
            and offers deposit directly to you — we never hold or move your
            money.
          </p>
        </div>
      </header>

      {connected ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected{connection?.email ? ` — ${connection.email}` : ""}
          </p>
          {connection && !connection.chargesEnabled && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Stripe still needs a bit more info from you before this account
              can accept charges — finish setup in your Stripe Dashboard.
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Disconnecting…
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" onClick={handleConnect}>
          Connect with Stripe
        </Button>
      )}
    </section>
  );
}
