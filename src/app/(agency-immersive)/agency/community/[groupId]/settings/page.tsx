"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AboutRichTextEditor } from "@/components/community/about-rich-text-editor";
import { SettingsImageRow } from "@/components/community/settings/settings-image-row";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { LivePreviewPanel } from "@/components/community/settings/live-preview-panel";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import type { CommunityGroup } from "@/types/community";
import type { AgencyGroupMemberRoster } from "@/lib/server/community-agency-service";

const ABOUT_MAX_CHARS = 1000;

function plainTextOf(html: string): string {
  if (typeof window === "undefined")
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim();
}

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
 * Agency Community settings — General (2026-09-19 portal-settings parity
 * pass). Now matches tenant Settings → General field-for-field: rich-text
 * About (same `AboutRichTextEditor`, writes `aboutHtml` not the legacy
 * plain `about`), the "Show Community Banner" toggle, and the same real
 * `LivePreviewPanel` tenant uses — fed real active-member counts from the
 * roster (`/api/agency/community/[groupId]/members`). Every field here
 * (`aboutHtml`, `showBanner`, `theme`/`navigation`/`pointsEnabled`, …) was
 * already accepted end-to-end by `UpdateAgencyGroupPatch` /
 * `updateAgencyGroupServerSide` before this pass — only this page's own UI
 * hadn't caught up. Agency Community has no per-member moderator role and
 * no presence tracking yet, so the preview's `adminCount`/`onlineCount`
 * are honestly 0 rather than fabricated.
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
  const [aboutHtml, setAboutHtml] = useState("");
  const [published, setPublished] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [pointsEnabled, setPointsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    if (!isOwner) return;
    void fetch(`/api/agency/community/${groupId}`)
      .then((r) => r.json())
      .then((d: { group?: CommunityGroup }) => {
        if (!d.group) return;
        setGroup(d.group);
        setName(d.group.name);
        setTagline(d.group.tagline ?? "");
        setAboutHtml(d.group.aboutHtml || d.group.about || "");
        setPublished(d.group.status === "published");
        setLogoUrl(d.group.logoUrl ?? null);
        setFaviconUrl(d.group.faviconUrl ?? null);
        setCoverUrl(d.group.coverUrl ?? null);
        // Absent = enabled — same backward-compatible default as tenant.
        setShowBanner(d.group.showBanner ?? true);
        setBrandColor(d.group.brandColor ?? null);
        setPointsEnabled(d.group.pointsEnabled === true);
      });
    void fetch(`/api/agency/community/${groupId}/members`)
      .then((r) => r.json())
      .then((d: { members?: AgencyGroupMemberRoster[] }) => {
        setMemberCount((d.members ?? []).filter((m) => m.status === "active").length);
      })
      .catch(() => {});
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
          aboutHtml,
          status: published ? "published" : "draft",
          logoUrl,
          faviconUrl,
          coverUrl,
          showBanner,
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
  const aboutTextCount = plainTextOf(aboutHtml).length;

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

      <div className="grid gap-6 md:grid-cols-[200px_1fr_340px]">
        <SettingsNav
          brand={brand}
          active="general"
          link={{ saId: "", pretty: false, agencyGroupId: groupId }}
          groupSlug={group.slug}
        />
        <div className="space-y-6">
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
              <AboutRichTextEditor value={aboutHtml} onChange={setAboutHtml} />
              <p className="text-muted-foreground text-right text-xs">
                {aboutTextCount}/{ABOUT_MAX_CHARS}
              </p>
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
            <label className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
              <span>
                <span className="block text-sm font-semibold">Show Community Banner</span>
                <span className="text-muted-foreground block text-xs">
                  Displays the cover image above at the top of Community Home.
                  Turn off to skip the banner entirely.
                </span>
              </span>
              <Switch checked={showBanner} onCheckedChange={setShowBanner} disabled={saving} />
            </label>
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
            Skool Import isn&apos;t offered for Agency communities (explicit
            product decision — it&apos;s architecturally tied to creating
            tenant Member/Contact/GroupMembership records, which have no
            Agency analog). Channels and Sections are managed from the
            community feed itself (the ⋯ menu next to Channels). Branding
            theme presets, Navigation ordering, and Points &amp; Rewards
            administration all have full parity — see the Branding,
            Navigation, and Points &amp; Rewards tabs.
          </div>
        </div>

        <div className="md:sticky md:top-6 md:self-start">
          <LivePreviewPanel
            group={group}
            brand={brand}
            name={name}
            aboutPlainText={plainTextOf(aboutHtml)}
            logoUrl={logoUrl}
            coverUrl={coverUrl}
            showBanner={showBanner}
            memberCount={memberCount}
            onlineCount={0}
            adminCount={0}
          />
        </div>
      </div>
    </div>
  );
}
