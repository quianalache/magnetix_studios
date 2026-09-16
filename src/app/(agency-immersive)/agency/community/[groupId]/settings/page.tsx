"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommunityGroup } from "@/types/community";

/**
 * Agency Community settings — deliberately a small, bespoke form (name /
 * about / published-status) rather than reusing the full tenant
 * `settings-workspace.tsx` (446 lines: General + image/logo/favicon
 * upload + Branding theme + Navigation + Points & Rewards + Skool Import
 * tabs). Image upload needs its own Storage upload pipeline this pass
 * doesn't build (see community-agency-service.ts's module comment), and
 * the other tabs don't apply to a fresh agency group at all — a bespoke
 * subset form for the fields that DO work is more honest than wiring the
 * full workspace and leaving most of it non-functional. See the Agency
 * Community task's "remaining work" for full settings parity.
 */
export default function AgencyCommunitySettingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => r.json())
      .then((d: { group?: CommunityGroup }) => {
        if (!d.group) return;
        setGroup(d.group);
        setName(d.group.name);
        setAbout(d.group.about);
        setPublished(d.group.status === "published");
      });
  }, [isOwner, groupId]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/agency/community/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          about,
          status: published ? "published" : "draft",
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Couldn't save");
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }
  if (!group) return <div className="mx-auto max-w-2xl p-8" />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Link
        href={`/agency/community/${groupId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {group.name}
      </Link>

      <div>
        <h1 className="text-xl font-bold tracking-tight">Community settings</h1>
        <p className="text-sm text-muted-foreground">
          General settings for this Agency-owned community.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="group-name">Community name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-about">About</Label>
          <Textarea
            id="group-about"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={4}
            disabled={saving}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            disabled={saving}
          />
          Published (visible/usable — unpublished stays a private draft)
        </label>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
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
      </div>

      <div className="rounded-2xl border border-dashed bg-card p-5 text-xs text-muted-foreground">
        Logo/cover image, brand color, and full Branding presets aren&apos;t
        wired for Agency communities yet — see the Agency Community task&apos;s
        remaining-work notes. Channels and Sections are managed from the
        community feed itself (the ⋯ menu next to Channels).
      </div>
    </div>
  );
}
