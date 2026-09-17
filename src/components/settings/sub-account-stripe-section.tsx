"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CreditCard } from "lucide-react";
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
  bad_state: {
    ok: false,
    text: "Connection failed a security check. Try again.",
  },
  not_configured: {
    ok: false,
    text: "Stripe Connect isn't configured on this deployment yet.",
  },
  error: { ok: false, text: "Stripe connection failed. Please try again." },
};

const ERROR_REASONS: Record<string, string> = {
  state_missing: "Stripe connection failed: missing security state.",
  state_invalid: "Stripe connection failed: security state was invalid.",
  auth_failed: "Stripe connection failed: your admin session was not accepted.",
  uid_mismatch: "Stripe connection failed: session mismatch.",
  missing_code: "Stripe connection failed: Stripe returned no authorization code.",
  stripe_declined: "Stripe connection was cancelled or declined.",
  client_not_configured: "Stripe connection failed: Live Connect is not configured.",
  exchange_failed:
    "Stripe connection failed during the Live Stripe authorization exchange.",
  firestore_write_failed:
    "Stripe connected successfully, but Magnetix could not save the connection.",
  exchange_or_write_failed:
    "Stripe connection failed while saving the account. Check the server diagnostic log.",
};

export function SubAccountStripeSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const connection = subAccount?.stripeConnect ?? null;
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("stripeconnect");
    if (!s) return;
    const reason = params.get("reason");
    const reasonMessage = s === "error" && reason ? ERROR_REASONS[reason] : null;
    const msg = reasonMessage ? { ok: false, text: reasonMessage } : STATUS_MESSAGES[s];
    if (msg) {
      if (msg.ok) toast.success(msg.text);
      else toast.error(msg.text);
    }
    params.delete("stripeconnect");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`
    );
  }, []);

  if (!isAdmin) return null;

  function handleConnect(environment: "test" | "live") {
    window.location.href = `/api/sub-accounts/${subAccountId}/stripe-connect/connect?environment=${environment}`;
  }

  async function handleDisconnect(environment: "test" | "live") {
    if (
      !confirm(
        "Disconnect Stripe? Course/product checkout that requires card payment will stop working until you reconnect, unless PayPal is also set up."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/stripe-connect?environment=${environment}`,
        {
          method: "DELETE",
        }
      );
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

  const legacyConnection =
    connection && !connection.test && !connection.live ? connection : null;

  function connectionCard(
    environment: "test" | "live",
    label: string,
    environmentConnection: typeof connection
  ) {
    return (
      <div className="bg-background rounded-lg border p-4" key={environment}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Stripe — {label}</p>
            {environmentConnection ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Connected
                {environmentConnection.email
                  ? ` — ${environmentConnection.email}`
                  : ""}
              </p>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                Not connected
              </p>
            )}
            {environmentConnection && (
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {environmentConnection.accountId}
              </p>
            )}
          </div>
          {environmentConnection ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDisconnect(environment)}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => handleConnect(environment)}
            >
              Connect {label}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="bg-card rounded-2xl border p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <CreditCard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Payments — Stripe</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Connect your own Stripe account so card payments on your courses and
            offers deposit directly to you — we never hold or move your money.
          </p>
        </div>
      </header>

      <div className="space-y-3">
        {legacyConnection && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              Legacy Stripe connection (environment not verified)
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              {legacyConnection.accountId}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              This older flat record is preserved for compatibility. Confirm its
              environment before migrating it into Test or Live.
            </p>
          </div>
        )}
        {connectionCard("test", "Test / Sandbox", connection?.test ?? null)}
        {connectionCard("live", "Live", connection?.live ?? null)}
      </div>
    </section>
  );
}
