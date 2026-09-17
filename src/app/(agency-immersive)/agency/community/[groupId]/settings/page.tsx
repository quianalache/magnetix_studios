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
import { SettingsImageRow } from "@/components/community/settings/settings-image-row";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import type { CommunityGroup } from "@/types/community";

async function uploadAgencySettingsImage(
  groupId: string,
  file: File,
  kind: "logo" | "cover" | "favicon",
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const res = await fetch(`/api/agency/community/${groupId}/settings/upload`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !data.ok || !data.url) throw new Error(data.error ?? "Upload failed");
  return data.url;
}

/**
 * Agency Community settings — General + image/logo/favicon/branding-color
 * (2026-09-17 parity pass). Reuses the SAME `SettingsImageRow` component
 * and Admin-SDK upload pattern the tenant Settings → General page uses
 * (see /api/agency/community/[groupId]/settings/upload) rather than a
 * separate uploader. Deliberately still without the tenant's Branding
 * theme presets / Navigation drag-reorder UI / Points & Rewards / Skool
 * Import tabs — the underlying data model (`UpdateAgencyGroupPatch`) is
 * already extended to accept navigation/theme/etc., but those workspaces'
 * own UI shells assume a tenant Settings sub-nav (linking to pages that
 * don't exist for agency groups) and weren't ported this pass — see the
 * Agency Community Parity report's "remaining true dependencies."
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
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [published, setPublished] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [pointsEnabled, setPointsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => r.json())
      .then((d: { group?: CommunityGroup }) => {
        if (!d.group) return;
        setGroup(d.group);
        setName(d.group.name);
        setTagline(d.group.tagline ?? "");
        setAbout(d.group.about);
        setPublished(d.group.status === "published");
        setLogoUrl(d.group.logoUrl ?? null);
        setFaviconUrl(d.group.faviconUrl ?? null);
        setCoverUrl(d.group.coverUrl ?? null);
        setBrandColor(d.group.brandColor ?? null);
        setPointsEnabled(d.group.pointsEnabled === true);
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
          tagline,
          about,
          status: published ? "published" : "draft",
          logoUrl,
          faviconUrl,
          coverUrl,
          brandColor,
          pointsEnabled,
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

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
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

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <SettingsNav
          brand={brand}
          active="general"
          link={{ saId: "", pretty: false, agencyGroupId: groupId }}
          groupSlug={group.slug}
        />
        <div className="max-w-2xl space-y-6">
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
          <Label htmlFor="group-tagline">Tagline</Label>
          <Input
            id="group-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={100}
            placeholder="Short one-line description"
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
        <div className="space-y-1.5">
          <Label htmlFor="group-brand-color">Brand color</Label>
          <div className="flex items-center gap-2">
            <input
              id="group-brand-color"
              type="color"
              value={brandColor || "#202124"}
              onChange={(e) => setBrandColor(e.target.value)}
              disabled={saving}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
            />
            <Input
              value={brandColor ?? ""}
              onChange={(e) => setBrandColor(e.target.value || null)}
              placeholder="#202124"
              disabled={saving}
              className="max-w-[140px]"
            />
          </div>
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pointsEnabled}
            onChange={(e) => setPointsEnabled(e.target.checked)}
            disabled={saving}
          />
          Points &amp; Leaderboard (members earn points for posting/commenting;
          uses the standard point values and levels)
        </label>
      </div>

      <div className="divide-y rounded-2xl border bg-card p-5">
        <SettingsImageRow
          label="Community logo"
          description="Shown in the header and About page."
          guidance={["Recommended: 512×512px", "PNG or JPG, up to 5MB"]}
          value={logoUrl}
          onChange={setLogoUrl}
          onUpload={(file) => uploadAgencySettingsImage(groupId, file, "logo")}
          shape="square"
        />
        <SettingsImageRow
          label="Favicon"
          description="Browser-tab icon."
          guidance={["PNG or ICO, up to 5MB"]}
          value={faviconUrl}
          onChange={setFaviconUrl}
          onUpload={(file) => uploadAgencySettingsImage(groupId, file, "favicon")}
          shape="tiny"
        />
        <SettingsImageRow
          label="Cover image"
          description="Home banner and About page hero."
          guidance={["Recommended: 1600×400px", "PNG or JPG, up to 5MB"]}
          value={coverUrl}
          onChange={setCoverUrl}
          onUpload={(file) => uploadAgencySettingsImage(groupId, file, "cover")}
          shape="wide"
        />
      </div>

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

      <div className="rounded-2xl border border-dashed bg-card p-5 text-xs text-muted-foreground">
        Custom Points &amp; Rewards editing (point values, levels, prize
        redemption) and Skool Import aren&apos;t ported to Agency communities
        yet — see the Agency Community Parity report. Channels and Sections
        are managed from the community feed itself (the ⋯ menu next to
        Channels).
      </div>
        </div>
      </div>
    </div>
  );
}
