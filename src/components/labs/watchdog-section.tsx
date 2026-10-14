"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlarmClockCheck, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Alert } from "@/components/ui/alert";
import { StatusPill } from "@/components/system/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  WatchdogConfigResponse,
  WatchdogRunResponse,
} from "@/types/custom-agents";

/**
 * Inbox Follow-up Watchdog config card (Labs). Admin-configurable; members
 * see a read-only description. The Labs PAGE gates on labsEnabledByAgency —
 * this card additionally surfaces the AI Suite gate requirement (the
 * watchdog spends agency AI credits) without duplicating the page gate.
 */

const THRESHOLD_OPTIONS = [1, 2, 3, 6, 12, 24] as const;
const THRESHOLD_ITEMS: Record<string, string> = Object.fromEntries(
  THRESHOLD_OPTIONS.map((h) => [String(h), `${h} hour${h === 1 ? "" : "s"}+`]),
);
const HOUR_ITEMS: Record<string, string> = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), `${h}:00`]));

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WatchdogSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();

  const [config, setConfig] = useState<WatchdogConfigResponse | null>(null);
  const [runs, setRuns] = useState<WatchdogRunResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [thresholdHours, setThresholdHours] = useState(3);
  const [instructions, setInstructions] = useState("");
  const [quietOn, setQuietOn] = useState(false);
  const [quietStart, setQuietStart] = useState(21);
  const [quietEnd, setQuietEnd] = useState(7);
  const [quietTz, setQuietTz] = useState("UTC");

  const aiGateOn = subAccount?.aiSuiteEnabledByAgency === true;

  const hydrate = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/agents/watchdog`);
      const data = (await res.json()) as {
        config?: WatchdogConfigResponse;
        runs?: WatchdogRunResponse[];
      };
      if (data.config) {
        setConfig(data.config);
        setEnabled(data.config.enabled);
        setThresholdHours(data.config.thresholdHours);
        setInstructions(data.config.instructions ?? "");
        setQuietOn(data.config.quietHours !== null);
        if (data.config.quietHours) {
          setQuietStart(data.config.quietHours.startHour);
          setQuietEnd(data.config.quietHours.endHour);
          setQuietTz(data.config.quietHours.timezone);
        } else {
          setQuietTz(
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          );
        }
      }
      setRuns(data.runs ?? []);
    } catch {
      toast.error("Couldn't load the watchdog config.");
    } finally {
      setLoaded(true);
    }
  }, [subAccountId]);

  useEffect(() => {
    if (!isAdmin) {
      setLoaded(true);
      return;
    }
    void hydrate();
  }, [isAdmin, hydrate]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/agents/watchdog`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled,
            thresholdHours,
            instructions: instructions.trim() || null,
            quietHours: quietOn
              ? { startHour: quietStart, endHour: quietEnd, timezone: quietTz }
              : null,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        config?: WatchdogConfigResponse;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      if (data.config) setConfig(data.config);
      toast.success(
        enabled
          ? "Watchdog enabled — it checks the inbox every hour."
          : "Watchdog settings saved.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const lastRun = runs[0] ?? null;

  return (
    <div className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-chip bg-tag-gold-bg text-tag-gold-fg">
          <AlarmClockCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-section font-semibold">Inbox Follow-up Watchdog</h2>
            <StatusPill tone={config?.enabled ? "success" : "neutral"}>{config?.enabled ? "Active" : "Off"}</StatusPill>
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Checks your unified inbox every hour, spots inbound conversations
            that have gone unanswered too long, and judges which ones genuinely
            need a human — then creates a follow-up task and sends a push
            notification with the reason. It never messages your customers and
            never changes your data.
          </p>
        </div>
      </div>

      {!isAdmin ? (
        <p className="mt-4 text-sm text-muted-foreground">
          A workspace admin can configure this agent.
        </p>
      ) : !loaded ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {!aiGateOn && (
            <Alert tone="warning">
              The watchdog needs the <strong>AI Suite</strong> enabled for this
              workspace (it spends your agency&apos;s AI credits). Ask your
              agency owner to enable it from the Manage panel before switching
              the watchdog on.
            </Alert>
          )}

          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
              disabled={saving || (!aiGateOn && !enabled)}
              className="mt-0.5"
            />
            <span>
              <span className="text-sm font-medium">Enable the watchdog</span>
              <span className="block text-xs text-muted-foreground">
                Runs hourly. Worst case it&apos;s wrong: an unnecessary task —
                it can&apos;t touch customers or data.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">
                Flag conversations unanswered for
              </Label>
              <Select
                value={String(thresholdHours)}
                onValueChange={(value) => value != null && setThresholdHours(Number(value))}
                items={THRESHOLD_ITEMS}
                disabled={saving}
              >
                <SelectTrigger aria-label="Alert threshold" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(THRESHOLD_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">
                Quiet hours (push suppressed; tasks still created)
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={quietOn}
                  onCheckedChange={(v) => setQuietOn(v === true)}
                  disabled={saving}
                />
                <Select
                value={String(quietStart)}
                onValueChange={(value) => value != null && setQuietStart(Number(value))}
                items={HOUR_ITEMS}
                disabled={saving || !quietOn}
              >
                <SelectTrigger aria-label="Quiet hours start" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(HOUR_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
                <span className="text-xs text-muted-foreground">to</span>
                <Select
                value={String(quietEnd)}
                onValueChange={(value) => value != null && setQuietEnd(Number(value))}
                items={HOUR_ITEMS}
                disabled={saving || !quietOn}
              >
                <SelectTrigger aria-label="Quiet hours end" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(HOUR_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs font-medium text-muted-foreground">
              Extra criteria for the judge (optional)
            </Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Prioritise anything mentioning price, cancellation, or a complaint. Ignore delivery notifications."
              maxLength={1000}
              rows={2}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-caption text-muted-foreground">
              {lastRun
                ? `Last run ${relativeTime(lastRun.startedAt)} — ${
                    lastRun.status === "completed"
                      ? `${lastRun.scanned} scanned, ${lastRun.judged} judged, ${lastRun.flagged} flagged`
                      : lastRun.status === "skipped"
                        ? `skipped (${lastRun.skippedReason ?? "—"})`
                        : "failed"
                  }`
                : "No runs yet — the first sweep lands within the hour after enabling."}
            </p>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>

          {runs.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-1.5 text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Recent runs
              </p>
              <ul className="space-y-1">
                {runs.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span className="w-16 shrink-0 tabular-nums">
                      {relativeTime(r.startedAt)}
                    </span>
                    <StatusPill
                      tone={
                        r.status === "completed"
                          ? r.flagged > 0
                            ? "warning"
                            : "success"
                          : r.status === "skipped"
                            ? "neutral"
                            : "danger"
                      }
                      className="capitalize"
                    >
                      {r.status === "completed"
                        ? r.flagged > 0
                          ? `${r.flagged} flagged`
                          : "all clear"
                        : r.status}
                    </StatusPill>
                    <span className="min-w-0 flex-1 truncate">
                      {r.status === "completed"
                        ? r.actions.length > 0
                          ? r.actions
                              .map((a) => `${a.contactName}: ${a.reason}`)
                              .join(" · ")
                          : `${r.scanned} scanned, ${r.judged} judged`
                        : (r.skippedReason ?? "")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
