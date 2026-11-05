"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bell, Loader2, Mail, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { Switch } from "@/components/ui/switch";
import { communityHomeHref } from "@/lib/community/routes";
import { cn } from "@/lib/utils";
import type {
  CommunityNotificationCategory,
  CommunityNotificationSettings,
  DigestFrequency,
  NotificationDelivery,
} from "@/types/community-membership";

type Payload = { ok: true; settings: CommunityNotificationSettings };

const rows: { key: CommunityNotificationCategory; title: string; description: string }[] = [
  { key: "member_joined", title: "New member alerts", description: "Get notified when someone joins your community." },
  { key: "content", title: "Content updates", description: "Get notified when new posts, courses, or events are published." },
  { key: "replies", title: "Comments & replies", description: "Get notified about replies and mentions on community content." },
];

const frequencies: { value: DigestFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function NotificationsWorkspace({
  saId,
  pretty = false,
  staffGroupId,
  groupId,
  groupSlug,
  brand,
}: {
  saId: string;
  pretty?: boolean;
  staffGroupId?: string;
  groupId: string;
  groupSlug: string;
  brand: string;
}) {
  const api = `/api/community/${saId}/${groupId}/notification-settings`;
  const [settings, setSettings] = useState<CommunityNotificationSettings | null>(null);
  const [draft, setDraft] = useState<CommunityNotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(api, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as Partial<Payload> & { error?: string };
    if (!response.ok || !body.settings) throw new Error(body.error ?? "Couldn't load notification settings.");
    setSettings(body.settings);
    setDraft(body.settings);
  }, [api]);

  useEffect(() => { void load().catch((error) => toast.error(error instanceof Error ? error.message : "Couldn't load notification settings.")); }, [load]);

  const dirty = JSON.stringify(settings) !== JSON.stringify(draft);

  function setDelivery(category: CommunityNotificationCategory, channel: keyof NotificationDelivery, value: boolean) {
    setDraft((current) => current ? ({ ...current, events: { ...current.events, [category]: { ...current.events[category], [channel]: value } } }) : current);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: draft.events, digestFrequency: draft.digest.frequency }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<Payload> & { error?: string };
      if (!response.ok || !body.settings) throw new Error(body.error ?? "Couldn't save notification settings.");
      setSettings(body.settings);
      setDraft(body.settings);
      toast.success("Notification settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save notification settings.");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div role="heading" aria-level={1} className="text-title-lg font-semibold text-foreground">Community Settings</div>
          <a href={communityHomeHref({ saId, pretty, staffGroupId }, groupSlug)} className="mt-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
          </a>
        </div>
        <div className="flex gap-2">
          <button onClick={() => settings && setDraft(settings)} disabled={!dirty || saving} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-50">Discard Changes</button>
          <button onClick={save} disabled={!dirty || saving || !draft} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: brand }}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <SettingsNav brand={brand} active="notifications" link={{ saId, pretty, staffGroupId }} groupSlug={groupSlug} />
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3 border-b border-border pb-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tag-violet-bg text-tag-violet-fg"><Bell className="h-5 w-5" /></span>
              <div><h2 className="text-section font-semibold text-foreground">Notifications &amp; Digest</h2><p className="mt-0.5 text-body-sm text-muted-foreground">Keep members informed about activity in your community.</p></div>
            </div>
            <div className="mt-5">
              <h3 className="text-body-sm font-semibold text-foreground">System Notifications</h3>
              <p className="mt-0.5 text-micro text-muted-foreground">Choose which community activities trigger notifications and where they are delivered.</p>
              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 border-b border-border pb-2 text-overline font-semibold text-muted-foreground"><span /> <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email</span><span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> In-App</span></div>
              <div className="divide-y divide-border">
                {rows.map((row) => <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 py-3">
                  <div><p className="text-caption font-semibold text-foreground">{row.title}</p><p className="mt-0.5 text-overline text-muted-foreground">{row.description}</p></div>
                  <Switch aria-label={`${row.title} email`} checked={draft?.events[row.key].email ?? false} onCheckedChange={(value) => setDelivery(row.key, "email", value)} disabled={!draft || saving} />
                  <Switch aria-label={`${row.title} in-app`} checked={draft?.events[row.key].inApp ?? false} onCheckedChange={(value) => setDelivery(row.key, "inApp", value)} disabled={!draft || saving} />
                </div>)}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-3 border-b border-border pb-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tag-violet-bg text-tag-violet-fg"><Mail className="h-5 w-5" /></span><div><h2 className="text-section font-semibold text-foreground">Community Digest</h2><p className="mt-0.5 text-body-sm text-muted-foreground">Send members a summary of real community activity.</p></div></div>
            <div className="mt-5"><h3 className="text-body-sm font-semibold text-foreground">Digest frequency</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{frequencies.map((frequency) => <button key={frequency.value} onClick={() => setDraft((current) => current ? ({ ...current, digest: { ...current.digest, frequency: frequency.value } }) : current)} className={cn("rounded-lg border px-3 py-2 text-sm font-medium", draft?.digest.frequency === frequency.value ? "border-primary bg-tag-violet-bg text-primary" : "border-border text-foreground hover:bg-muted")}>{frequency.label}</button>)}</div><p className="mt-3 rounded-lg bg-tag-violet-bg p-3 text-micro leading-relaxed text-primary">Digests include top posts, upcoming events, and new member activity members can access. They are not AI-generated. Turning a digest on starts a new window; it does not send a backlog.</p></div>
          </section>
        </div>
      </div>
    </div>
  );
}
