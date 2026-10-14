"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsSection } from "@/components/system/settings-section";
import { useSettingsForm } from "@/components/system/settings-workspace";
import { StatusPill } from "@/components/system/status-pill";

/**
 * Sending preferences — the per-workspace outbound-email + workflow-engine
 * settings that used to live on the legacy Automations → Settings page
 * (deleted in the Workflow Builder v1 clean-slate replace, which orphaned
 * them; see the user report of 2026-07-07):
 *
 *   - `replyToEmail` — Reply-To header on every automated/broadcast email
 *   - `sendWindow`   — quiet-hours restriction for workflow sends
 *   - `automationsPaused` — the workflow-engine kill switch (still enforced
 *     by lib/workflows/engine.ts, so legacy paused workspaces need this UI
 *     to un-pause)
 *
 * All three PATCH the existing /api/agency/sub-accounts/[id] route
 * (sub-account-admin gated) — no new backend. Admin-only card, mirrors the
 * other settings sections.
 *
 * Design system (proof pages, 2026-10-14): SettingsSection cards, the shared
 * Select + Switch, inline validation and a warning Alert while paused. Same
 * fields, same PATCH bodies, same admin gate as before.
 */

const HOURS = Array.from({ length: 25 }, (_, i) => i);

function hourLabel(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 24) return "12:00 AM (end of day)";
  if (h === 12) return "12:00 PM";
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

const START_ITEMS = Object.fromEntries(
  HOURS.filter((h) => h < 24).map((h) => [String(h), hourLabel(h)])
);
const END_ITEMS = Object.fromEntries(
  HOURS.filter((h) => h > 0).map((h) => [String(h), hourLabel(h)])
);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SubAccountSendingPreferencesSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();

  const [replyTo, setReplyTo] = useState("");
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Saved values from the live doc — the baseline for "unsaved changes".
  const saved = {
    replyTo: subAccount?.replyToEmail ?? "",
    windowEnabled: !!subAccount?.sendWindow,
    startHour: subAccount?.sendWindow?.startHour ?? 8,
    endHour: subAccount?.sendWindow?.endHour ?? 20,
    timezone: subAccount?.sendWindow?.timezone ?? subAccount?.timezone ?? "UTC",
  };
  function resetToSaved() {
    setReplyTo(saved.replyTo);
    setWindowEnabled(saved.windowEnabled);
    setStartHour(saved.startHour);
    setEndHour(saved.endHour);
    setTimezone(saved.timezone);
    setSubmitted(false);
  }

  // Sync from the live doc (onSnapshot via the provider) whenever the
  // workspace changes — but not on every keystroke-triggered re-render.
  useEffect(() => {
    resetToSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId, subAccount?.updatedAt]);

  const replyToError =
    replyTo.trim() && !EMAIL_RE.test(replyTo.trim())
      ? "Enter a full email address, like you@yourbusiness.com."
      : null;
  const windowError =
    windowEnabled && startHour >= endHour
      ? "The send window must start before it ends."
      : null;
  const dirty =
    replyTo.trim() !== saved.replyTo.trim() ||
    windowEnabled !== saved.windowEnabled ||
    (windowEnabled &&
      (startHour !== saved.startHour ||
        endHour !== saved.endHour ||
        (timezone.trim() || "UTC") !== saved.timezone));

  async function patch(body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`/api/agency/sub-accounts/${subAccountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to save.");
  }

  async function save(): Promise<boolean> {
    setSubmitted(true);
    if (windowError || replyToError) {
      toast.error(windowError ?? replyToError);
      return false;
    }
    setSaving(true);
    try {
      await patch({
        replyToEmail: replyTo.trim() || null,
        sendWindow: windowEnabled
          ? { startHour, endHour, timezone: timezone.trim() || "UTC" }
          : null,
      });
      toast.success("Sending preferences saved.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Inside the Settings workspace the sticky save bar saves this form.
  const managed = useSettingsForm("sending-preferences", {
    label: "Sending preferences",
    dirty: isAdmin && dirty,
    save,
    discard: resetToSaved,
  });

  if (!isAdmin) return null;

  const paused = subAccount?.automationsPaused === true;

  function handleSave(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  async function handleTogglePause() {
    setTogglingPause(true);
    try {
      await patch({ automationsPaused: !paused });
      toast.success(
        paused
          ? "Workflows resumed — new triggers fire again."
          : "All workflows paused — nothing will fire until you resume."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setTogglingPause(false);
    }
  }

  const showReplyToError = !!replyToError && (submitted || replyTo.length > 3);
  const saveButton = managed ? undefined : (
    <Button type="submit" disabled={saving}>
      {saving ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Saving…
        </>
      ) : (
        "Save sending preferences"
      )}
    </Button>
  );

  return (
    <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
      <SettingsSection
        title="Sender identity"
        description="Replies go straight to this inbox — they never pass through the CRM."
      >
        <div className="flex flex-col gap-1.5 sm:max-w-md">
          <Label htmlFor="sp-reply-to">Reply-to email</Label>
          <Input
            id="sp-reply-to"
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="you@yourbusiness.com"
            disabled={saving}
            aria-invalid={showReplyToError || undefined}
            aria-describedby="sp-reply-to-help"
          />
          <p
            id="sp-reply-to-help"
            className={showReplyToError ? "text-caption text-destructive" : "text-caption text-muted-foreground"}
          >
            {showReplyToError
              ? replyToError
              : "Must be an inbox you check. Replies to every automated and broadcast email come back here — and, once a dedicated sending domain is verified, also to that domain's own inbox in Conversations. Required before sending from a dedicated domain."}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Send window"
        description="Automation steps that fall outside this window wait until it opens."
        action={<StatusPill tone={windowEnabled ? "success" : "neutral"}>{windowEnabled ? "On" : "Off"}</StatusPill>}
        footer={saveButton}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="sp-window">Restrict sending hours</Label>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Workflow messages outside the window wait for the next window start instead of sending at 3 AM.
            </p>
          </div>
          <Switch id="sp-window" checked={windowEnabled} onCheckedChange={setWindowEnabled} disabled={saving} />
        </div>
        {windowEnabled && (
          <div className="flex flex-col gap-1.5">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
              <div className="flex flex-col gap-1.5">
                <Label id="sp-start-label">Start</Label>
                <Select
                  value={String(startHour)}
                  onValueChange={(v) => v && setStartHour(Number(v))}
                  items={START_ITEMS}
                  disabled={saving}
                >
                  <SelectTrigger aria-labelledby="sp-start-label" aria-invalid={!!windowError || undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(START_ITEMS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label id="sp-end-label">End</Label>
                <Select
                  value={String(endHour)}
                  onValueChange={(v) => v && setEndHour(Number(v))}
                  items={END_ITEMS}
                  disabled={saving}
                >
                  <SelectTrigger aria-labelledby="sp-end-label" aria-invalid={!!windowError || undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(END_ITEMS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sp-timezone">Time zone (IANA)</Label>
                <Input
                  id="sp-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Australia/Sydney"
                  disabled={saving}
                />
              </div>
            </div>
            {windowError ? (
              <p role="alert" className="text-caption text-destructive">
                {windowError}
              </p>
            ) : null}
          </div>
        )}

        {/* Pause-all — applies immediately (it's an emergency stop), so it
            isn't part of the unsaved-changes bar. */}
        <div className="-mx-5 flex flex-col gap-3 border-t border-border px-5 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="sp-pause-label" className="text-body-sm font-semibold text-foreground">
                Pause all workflows
              </p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Emergency stop: prevents every workflow from firing or continuing until you turn this off.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {togglingPause ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : null}
              <Switch
                checked={paused}
                onCheckedChange={() => handleTogglePause()}
                disabled={togglingPause}
                aria-label={paused ? "Resume workflows" : "Pause all workflows"}
              />
            </div>
          </div>
          {paused ? (
            <Alert tone="warning" title="All workflows are paused">
              No triggers fire and in-flight runs stop at their next step until you resume.
            </Alert>
          ) : null}
        </div>
      </SettingsSection>
    </form>
  );
}
