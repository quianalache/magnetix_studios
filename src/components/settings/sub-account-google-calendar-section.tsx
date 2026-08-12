"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarSync, Loader2, RefreshCw } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { CUSTOM_BRAND } from "@/config/landing";
import { Button } from "@/components/ui/button";
import type { GoogleCalendarListEntry } from "@/types/google-calendar";

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
 *
 * Calendar selection + Sync Now (2026-08-12) — pull-in sync used to be
 * hardcoded to the account's "primary" calendar with no way to pick a
 * different one and no on-demand trigger beyond the dead 15-minute
 * schedule (root-caused and fixed the same day, see the Build Log). Both
 * added here, once a connection exists.
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

interface CalendarsResponse {
  ok: boolean;
  calendars: GoogleCalendarListEntry[];
  selectedCalendarIds: string[];
  error?: string;
}

export function SubAccountGoogleCalendarSection() {
  const { subAccountId, subAccount } = useSubAccount();
  const gateOn = subAccount?.googleCalendarSyncEnabledByAgency === true;
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  function loadCalendars() {
    setCalendarsLoading(true);
    setCalendarsError(null);
    fetch(`/api/sub-accounts/${subAccountId}/google-calendar/calendars`)
      .then(async (res) => {
        const data = (await res.json()) as CalendarsResponse;
        if (!res.ok) throw new Error(data.error || "Couldn't load your calendars.");
        setCalendars(data.calendars);
        setSelected(new Set(data.selectedCalendarIds));
      })
      .catch((e: Error) => setCalendarsError(e.message))
      .finally(() => setCalendarsLoading(false));
  }

  useEffect(() => {
    if (status?.connected) loadCalendars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

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
      setCalendars(null);
      toast.success("Google Calendar disconnected.");
    } catch {
      toast.error("Couldn't disconnect. Try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  function toggleCalendar(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveSelection() {
    if (selected.size === 0) {
      toast.error("Pick at least one calendar to sync.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/google-calendar/calendars`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCalendarIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save your selection.");
      toast.success("Calendar selection saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your selection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/google-calendar/sync-now`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Sync failed.");
      setStatus((prev) => (prev ? { ...prev, lastSyncedAt: data.lastSyncedAt } : prev));
      toast.success(
        data.synced > 0 ? `Synced — ${data.synced} event${data.synced === 1 ? "" : "s"} updated.` : "Synced — no changes.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed. Try again.");
    } finally {
      setSyncing(false);
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
        <div className="space-y-4">
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

          <div className="rounded-lg border bg-background p-4">
            <p className="mb-2 text-sm font-medium text-foreground">Calendars to sync in</p>
            {calendarsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your calendars…
              </div>
            ) : calendarsError ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{calendarsError}</p>
                <Button type="button" variant="outline" size="sm" onClick={loadCalendars}>
                  Retry
                </Button>
              </div>
            ) : calendars && calendars.length > 0 ? (
              <div className="space-y-2">
                <div className="max-h-52 space-y-1.5 overflow-y-auto">
                  {calendars.map((cal) => (
                    <label
                      key={cal.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(cal.id)}
                        onChange={() => toggleCalendar(cal.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      {cal.backgroundColor && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cal.backgroundColor }}
                        />
                      )}
                      <span className="truncate text-foreground">
                        {cal.summary}
                        {cal.primary ? " (Primary)" : ""}
                      </span>
                    </label>
                  ))}
                </div>
                <Button type="button" size="sm" onClick={handleSaveSelection} disabled={saving}>
                  {saving ? "Saving…" : "Save selection"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No calendars found on this Google account.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
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
        </div>
      ) : (
        <Button type="button" size="sm" onClick={handleConnect}>
          Connect Google Calendar
        </Button>
      )}
    </section>
  );
}
