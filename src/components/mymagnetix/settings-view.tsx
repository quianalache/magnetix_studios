"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LockKeyhole,
  Loader2,
  MessageCircle,
  MonitorSmartphone,
  Radio,
  UserRound,
} from "lucide-react";
import type { PersonCommunityItem } from "@/lib/server/mymagnetix-service";
import { Switch } from "@/components/ui/switch";

type DeviceState =
  | "checking"
  | "not-configured"
  | "unsupported"
  | "ios-install"
  | "blocked"
  | "ready";

function DeviceNotifications() {
  const [state, setState] = useState<DeviceState>("checking");

  useEffect(() => {
    const vapidConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    if (!vapidConfigured) return setState("not-configured");
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return setState(ios && !standalone ? "ios-install" : "unsupported");
    }
    setState(Notification.permission === "denied" ? "blocked" : "ready");
  }, []);

  const copy = {
    checking: [
      "Checking this device…",
      "Verifying browser notification support.",
    ],
    "not-configured": [
      "Device notifications aren't available yet",
      "You'll still get emails for purchases, bookings and Readings.",
    ],
    unsupported: [
      "This browser cannot receive push notifications",
      "Try an installed app or a supported browser.",
    ],
    "ios-install": [
      "Install MyMagnetix first",
      "On iPhone and iPad, add MyMagnetix to your Home Screen before enabling notifications.",
    ],
    blocked: [
      "Notifications are blocked",
      "Allow notifications in your browser settings, then return here.",
    ],
    ready: [
      "This device can receive notifications",
      "Device notifications are coming soon. Emails keep arriving as usual.",
    ],
  }[state];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tag-violet-bg text-tag-violet-fg">
          <MonitorSmartphone className="h-4 w-4" />
        </span>
        <div>
          <p className="text-body-sm font-semibold text-foreground">
            Push notifications (this device)
          </p>
          <p className="mt-1 max-w-xl text-micro leading-relaxed text-muted-foreground">
            {copy[1]}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-overline font-semibold ${state === "ready" ? "bg-status-success-bg text-status-success-fg" : "bg-muted text-muted-foreground"}`}
      >
        {copy[0]}
      </span>
    </div>
  );
}

function FutureToggle({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3 first:border-t-0">
      <div>
        <p className="text-caption font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-overline text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-overline font-semibold tracking-wide text-muted-foreground uppercase">
        Coming soon
      </span>
    </div>
  );
}

export function MyMagnetixSettingsView({
  communities,
}: {
  communities: PersonCommunityItem[];
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-micro font-semibold tracking-[0.16em] text-tag-violet-fg uppercase">
            MyMagnetix
          </p>
          <h1 className="mt-1 text-title-lg font-semibold tracking-[-0.03em] text-foreground">
            Settings
          </h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Manage your account, notifications, and preferences.
          </p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-tag-violet-bg px-3 py-2 text-caption font-semibold text-primary">
            <Bell className="h-4 w-4" /> Notifications
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-caption text-muted-foreground">
            <UserRound className="h-4 w-4" /> Profile &amp; Account
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-caption text-muted-foreground">
            <LockKeyhole className="h-4 w-4" /> Privacy &amp; Security
          </div>
        </nav>
        <div className="space-y-5">
          <section className="rounded-card border border-border bg-card p-4 shadow-card sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tag-violet-bg text-tag-violet-fg">
                <Bell className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-section font-semibold text-foreground">
                  Notifications
                </h2>
                <p className="mt-0.5 text-micro text-muted-foreground">
                  Choose how and when MyMagnetix keeps you informed.
                </p>
              </div>
            </div>
            <DeviceNotifications />
            <div className="mt-5 rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Radio className="h-4 w-4 text-tag-violet-fg" />
                <h3 className="text-body-sm font-semibold text-foreground">
                  Personal notifications
                </h3>
              </div>
              <p className="mb-2 text-micro text-muted-foreground">
                Account activity independent of any one community.
              </p>
              <FutureToggle
                label="Purchases and access"
                description="Purchase confirmations and access updates"
              />
              <FutureToggle
                label="Bookings and readings"
                description="Booking confirmations, reminders, and reading results"
              />
            </div>
            <div className="mt-5 rounded-xl border border-border bg-card p-4">
              <div className="mb-1 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-tag-violet-fg" />
                <h3 className="text-body-sm font-semibold text-foreground">
                  Community notifications
                </h3>
              </div>
              <p className="mb-3 text-micro text-muted-foreground">
                Customize notification preferences for each community you belong
                to.
              </p>
              {communities.length === 0 ? (
                <p className="rounded-lg bg-muted p-3 text-caption text-muted-foreground">
                  No communities yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {communities.map((community) => (
                    <div
                      key={community.pinKey}
                      className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-tag-violet-bg text-caption font-semibold text-tag-violet-fg">
                        {community.logoUrl ? (
                          <img
                            src={community.logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          community.name.slice(0, 1)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-semibold text-foreground">
                          {community.name}
                        </p>
                        <p className="truncate text-overline text-muted-foreground">
                          {community.businessName}
                        </p>
                      </div>
                      <Link
                        href={`/my/settings/community/${community.groupId}${community.subAccountId ? `?subAccountId=${encodeURIComponent(community.subAccountId)}` : ""}`}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-tag-violet-bg px-2.5 py-2 text-overline font-semibold text-primary hover:bg-accent"
                      >
                        Customize <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5 rounded-xl border border-dashed border-border bg-muted p-4">
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-tag-violet-fg" />
                <p className="text-micro leading-relaxed text-muted-foreground">
                  Device notifications are coming soon. Until then, email
                  notifications keep working exactly as they do today.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function CommunityNotificationSettings({
  community,
}: {
  community: PersonCommunityItem;
}) {
  type Category = "member_joined" | "content" | "replies";
  type Delivery = { email: boolean; inApp: boolean };
  type Prefs = { digestFrequency: "off" | "daily" | "weekly" | "monthly"; digest: boolean; events: Record<Category, Delivery> };
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = new URLSearchParams({ groupId: community.groupId });
  if (community.subAccountId) query.set("subAccountId", community.subAccountId);
  const endpoint = `/api/my/notifications/community-prefs?${query.toString()}`;
  useEffect(() => {
    if (!community.subAccountId) {
      setError("Member notification preferences are currently available for workspace communities only.");
      return;
    }
    let cancelled = false;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      const body = (await response.json().catch(() => ({}))) as Prefs & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Couldn't load preferences.");
      if (!cancelled) setPrefs(body);
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load preferences."); });
    return () => { cancelled = true; };
  }, [endpoint, community.subAccountId]);
  function updateDelivery(category: Category, channel: keyof Delivery, value: boolean) {
    setPrefs((current) => current ? ({ ...current, events: { ...current.events, [category]: { ...current.events[category], [channel]: value } } }) : current);
  }
  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: prefs.events, digest: prefs.digest ? "inherit" : false }) });
      const body = (await response.json().catch(() => ({}))) as Prefs & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Couldn't save preferences.");
      setPrefs(body);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save preferences."); }
    finally { setSaving(false); }
  }
  const rows: { key: Category; title: string; description: string }[] = [
    { key: "member_joined", title: "New member alerts", description: "When someone joins this community." },
    { key: "content", title: "Content updates", description: "When new posts, courses, or events are published." },
    { key: "replies", title: "Comments, replies & mentions", description: "When someone replies to or mentions you." },
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/my/settings"
        className="mb-5 inline-flex items-center gap-1 text-micro font-semibold text-tag-violet-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to all settings
      </Link>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-4 border-b border-border p-5 sm:p-7">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-tag-violet-bg text-xl font-semibold text-tag-violet-fg">
            {community.logoUrl ? (
              <img
                src={community.logoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              community.name.slice(0, 1)
            )}
          </div>
          <div>
            <p className="text-micro font-semibold tracking-wide text-tag-violet-fg uppercase">
              Community notification settings
            </p>
            <h1 className="mt-1 text-title-lg font-semibold text-foreground">
              {community.name}
            </h1>
            <p className="mt-1 text-caption text-muted-foreground">
              Choose which community activity you want to be notified about.
            </p>
          </div>
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          {error && <p className="rounded-lg bg-status-danger-bg p-3 text-micro text-status-danger-fg">{error}</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_58px_58px] items-center gap-2 border-b border-border pb-2 text-overline font-semibold text-muted-foreground"><span>Community activity</span><span>Email</span><span>In-App</span></div>
          <div className="divide-y divide-border">{rows.map((row) => <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_58px_58px] items-center gap-2 py-3"><div><p className="text-caption font-semibold text-foreground">{row.title}</p><p className="mt-0.5 text-overline text-muted-foreground">{row.description}</p></div><Switch aria-label={`${row.title} email`} checked={prefs?.events[row.key].email ?? false} onCheckedChange={(value) => updateDelivery(row.key, "email", value)} disabled={!prefs || saving} /><Switch aria-label={`${row.title} in-app`} checked={prefs?.events[row.key].inApp ?? false} onCheckedChange={(value) => updateDelivery(row.key, "inApp", value)} disabled={!prefs || saving} /></div>)}</div>
          <div className="rounded-xl border border-border bg-muted p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-caption font-semibold text-foreground">Community digest</p><p className="mt-0.5 text-overline text-muted-foreground">Use the community&apos;s digest schedule, or turn it off for yourself.</p></div><Switch aria-label="Community digest" checked={prefs?.digest ?? false} onCheckedChange={(value) => setPrefs((current) => current ? ({ ...current, digest: value }) : current)} disabled={!prefs || saving} /></div>{prefs && <p className="mt-3 text-overline text-muted-foreground">Community schedule: <span className="font-semibold text-foreground">{prefs.digestFrequency === "off" ? "Off" : prefs.digestFrequency[0].toUpperCase() + prefs.digestFrequency.slice(1)}</span></p>}</div>
          <div className="flex justify-end"><button onClick={save} disabled={!prefs || saving || !!error} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-caption font-semibold text-primary-foreground disabled:opacity-50">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {saving ? "Saving…" : "Save preferences"}</button></div>
        </div>
      </div>
    </div>
  );
}
