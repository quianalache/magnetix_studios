"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarSync, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { CUSTOM_BRAND } from "@/config/landing";
import { Button } from "@/components/ui/button";

/**
 * Google Calendar two-way sync (Phase 1: read-only pull-in) — the reverse
 * direction of `SubAccountCalendarSyncSection`'s export feed. Each member
 * connects their OWN Google account; their events then show up on the CRM's
 * Calendar page alongside bookings and tasks. Per-member, not sub-account-
 * wide — every active member sees and manages only their own connection.
 *
 * Gate-driven like the Meta section: renders nothing unless the agency has
 * flipped `googleCalendarSyncEnabledByAgency` on. Reads connection status
 * from a small server route (`GET .../google-calendar/status`) rather than
 * the sub-account doc, since the connection (with its OAuth tokens) is
 * stored server-only and never sent to the client.
 */

const STATUS_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Calendar connected." },
  cancelled: { ok: false, text: "Connection cancelled." },
  bad_state: { ok: false, text: "Connection failed a security check. Try again." },
  not_configured: {
    ok: false,
    text: "Google Calendar sync isn't configured on this deployment yet (missing Google OAuth credentials).",
  },
  gate_off: { ok: false, text: "This feature is locked by your agency." },
  no_refresh_token: {
    ok: false,
    text: `Google didn't grant offline access. Remove ${CUSTOM_BRAND.name}'s access at myaccount.google.com/permissions, then try Connect again.`,
  },
  error: { ok: false, text: "Couldn't connect to Google Calendar. Please try again." },
};

interface StatusResponse {
  connected: boolean;
  googleAccountEmail?: string | null;
  lastSyncedAt?: string | null;
}

export function SubAccountGoogleCalendarSection() {
  const { subAccountId, subAccount } = useSubAccount();
  const gateOn = subAccount?.googleCalendarSyncEnabledByAgency === true;
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!gateOn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/google-calendar/status`)
      .then((res) => res.json())
      .then((data: StatusResponse) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gateOn, subAccountId]);

  // Surface the ?gcal=… status the connect/callback routes redirect back
  // with, then strip it so a refresh doesn't re-toast.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("gcal");
    if (!s) return;
    const msg = STATUS_MESSAGES[s];
    if (msg) {
      if (msg.ok) toast.success(msg.text);
      else toast.error(msg.text);
    }
    params.delete("gcal");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  if (!gateOn) return null;

  function handleConnect() {
    window.location.href = `/api/sub-accounts/${subAccountId}/google-calendar/connect`;
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/google-calendar/disconnect`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error();
      setStatus({ connected: false });
      toast.success("Google Calendar disconnected.");
    } catch {
      toast.error("Couldn't disconnect. Try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <CalendarSync className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Google Calendar sync</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Connect your own Google Calendar so your real events show up
            here, on this CRM&apos;s Calendar page — the reverse of the
            export feed above. Read-only; we never edit your calendar.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border bg-background p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Checking connection…
        </div>
      ) : status?.connected ? (
        <div className="space-y-3">
          <div className="rounded-lg border bg-background p-4 text-sm">
            <p className="font-medium text-foreground">
              Connected{status.googleAccountEmail ? ` — ${status.googleAccountEmail}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {status.lastSyncedAt
                ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
                : "First sync in progress — check back in a minute."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" onClick={handleConnect}>
          Connect Google Calendar
        </Button>
      )}
    </section>
  );
}
