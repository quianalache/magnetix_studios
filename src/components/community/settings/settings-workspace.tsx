"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { communityHomeHref } from "@/lib/community/routes";
import { uploadCommunitySettingsImage } from "@/lib/community/upload-image";
import { AboutRichTextEditor } from "@/components/community/about-rich-text-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { SettingsImageRow } from "@/components/community/settings/settings-image-row";
import { LivePreviewPanel } from "@/components/community/settings/live-preview-panel";
import type { CommunityGroup, GroupJoinPolicy } from "@/types/community";

const ABOUT_MAX_CHARS = 1000;
const NAME_MAX_CHARS = 100;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

function plainTextOf(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim();
}

interface EditState {
  name: string;
  aboutHtml: string;
  slug: string;
  joinPolicy: GroupJoinPolicy;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverUrl: string | null;
}

function stateFromGroup(group: CommunityGroup): EditState {
  return {
    name: group.name,
    aboutHtml: group.aboutHtml || group.about || "",
    slug: group.slug,
    joinPolicy: group.joinPolicy,
    logoUrl: group.logoUrl,
    // `?? null` even though the type says non-optional — older community
    // docs written before this field existed genuinely lack it in
    // Firestore (schemaless), same defensive read every sibling image URL
    // here would need if it had been added after the type was first written.
    faviconUrl: group.faviconUrl ?? null,
    coverUrl: group.coverUrl,
  };
}

export function SettingsWorkspace({
  saId,
  pretty = false,
  staffGroupId,
  groupId,
  group: initialGroup,
  brand,
  memberCount,
  onlineCount,
  adminCount,
  domainPrefix,
}: {
  saId: string;
  pretty?: boolean;
  /** Staff Community-in-CRM integration — see CommunityLinkBase in routes.ts. */
  staffGroupId?: string;
  groupId: string;
  group: CommunityGroup;
  brand: string;
  memberCount: number;
  onlineCount: number;
  adminCount: number;
  /** Real host prefix shown before the slug (e.g. the sub-account's verified custom domain, or the platform's opaque URL) — never hardcoded. */
  domainPrefix: string;
}) {
  const [savedGroup, setSavedGroup] = useState(initialGroup);
  const [form, setForm] = useState<EditState>(() => stateFromGroup(initialGroup));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const savedState = stateFromGroup(savedGroup);
  const dirty = JSON.stringify(form) !== JSON.stringify(savedState);

  function set<K extends keyof EditState>(key: K, value: EditState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function discard() {
    setForm(savedState);
    toast.success("Reverted to the last saved values.");
  }

  async function save() {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error("Community name can't be empty.");
      return;
    }
    const trimmedSlug = form.slug.trim().toLowerCase();
    if (!trimmedSlug || !SLUG_PATTERN.test(trimmedSlug)) {
      toast.error("Slug can only contain lowercase letters, numbers, and hyphens.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          aboutHtml: form.aboutHtml,
          slug: trimmedSlug,
          joinPolicy: form.joinPolicy,
          logoUrl: form.logoUrl,
          faviconUrl: form.faviconUrl,
          coverUrl: form.coverUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        group?: CommunityGroup;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.group) {
        throw new Error(data.error ?? "Couldn't save changes");
      }
      setSavedGroup(data.group);
      setForm(stateFromGroup(data.group));
      if (data.group.slug !== trimmedSlug) {
        toast.success(
          `Saved. "${trimmedSlug}" was already taken, so your slug is now "${data.group.slug}".`,
        );
      } else {
        toast.success("Settings saved.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  }

  const aboutTextCount = plainTextOf(form.aboutHtml).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#202124]">Community Settings</h1>
          <Link
            href={communityHomeHref({ saId, pretty, staffGroupId }, savedGroup.slug)}
            className="mt-1 flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={discard}
            disabled={!dirty || saving}
            className="rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44] disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving || uploading}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {uploading ? "Uploading image…" : saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr_340px]">
        <SettingsNav
          brand={brand}
          active="general"
          link={{ saId, pretty, staffGroupId }}
          groupSlug={savedGroup.slug}
        />

        <div className="space-y-6">
          <section className="rounded-xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-base font-semibold text-[#202124]">Community Details</h2>
            <p className="mt-0.5 text-sm text-[#909090]">
              Manage the basic details and visibility of your community.
            </p>

            <div className="mt-5 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="cs-name">Community Name</Label>
                <Input
                  id="cs-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value.slice(0, NAME_MAX_CHARS))}
                  maxLength={NAME_MAX_CHARS}
                />
                <p className="text-xs text-muted-foreground">
                  This is the name of your community.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-about">Community Description</Label>
                <AboutRichTextEditor value={form.aboutHtml} onChange={(v) => set("aboutHtml", v)} />
                <p className="text-right text-xs text-muted-foreground">
                  {aboutTextCount}/{ABOUT_MAX_CHARS}
                </p>
                <p className="text-xs text-muted-foreground">
                  Describe your community in a few sentences.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-slug">Community Slug</Label>
                <div className="flex items-stretch">
                  <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                    {domainPrefix}/
                  </span>
                  <Input
                    id="cs-slug"
                    value={form.slug}
                    onChange={(e) =>
                      set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    className="rounded-l-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your community&apos;s unique URL. Changing it changes existing links to your
                  community — saved on Save Changes, and re-checked for uniqueness at that point.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Join Policy</Label>
                <p className="text-xs text-muted-foreground">
                  Magnetix doesn&apos;t currently support hiding a community from being found
                  (true &quot;private/invite-only&quot;) — this controls whether joining is
                  instant or requires your approval.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <VisibilityOption
                    active={form.joinPolicy === "open"}
                    brand={brand}
                    icon={<Check className="h-4 w-4" />}
                    title="Open"
                    description="Anyone can find your community and join instantly."
                    onClick={() => set("joinPolicy", "open")}
                  />
                  <VisibilityOption
                    active={form.joinPolicy === "approval"}
                    brand={brand}
                    icon={<Clock className="h-4 w-4" />}
                    title="Approval required"
                    description="Anyone can find your community; you approve each join request."
                    onClick={() => set("joinPolicy", "approval")}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-base font-semibold text-[#202124]">Community Image & Logo</h2>
            <p className="mt-0.5 text-sm text-[#909090]">
              These images represent your community across the platform.
            </p>
            <div className="mt-5 divide-y divide-[#f0f0f0]">
              <SettingsImageRow
                label="Community Logo"
                description="Square image recommended."
                guidance={["Recommended: 512x512px", "PNG or JPG up to 2MB"]}
                value={form.logoUrl}
                onChange={(url) => set("logoUrl", url)}
                onUploadingChange={setUploading}
                onUpload={(file) => uploadCommunitySettingsImage(file, saId, groupId, "logo")}
                shape="square"
              />
              <SettingsImageRow
                label="Community Favicon"
                description="Displayed in browser tabs."
                guidance={["Recommended: 32x32px", "PNG or ICO up to 200KB"]}
                value={form.faviconUrl}
                onChange={(url) => set("faviconUrl", url)}
                onUploadingChange={setUploading}
                onUpload={(file) => uploadCommunitySettingsImage(file, saId, groupId, "favicon")}
                shape="tiny"
              />
              <SettingsImageRow
                label="Community Cover Image"
                description="Wide image for your community banner."
                guidance={["Recommended: 2400x600px", "PNG or JPG up to 2MB"]}
                value={form.coverUrl}
                onChange={(url) => set("coverUrl", url)}
                onUploadingChange={setUploading}
                onUpload={(file) => uploadCommunitySettingsImage(file, saId, groupId, "cover")}
                shape="wide"
              />
            </div>
          </section>
        </div>

        <div className="md:sticky md:top-6 md:self-start">
          <LivePreviewPanel
            group={savedGroup}
            brand={brand}
            name={form.name}
            aboutPlainText={plainTextOf(form.aboutHtml)}
            logoUrl={form.logoUrl}
            coverUrl={form.coverUrl}
            memberCount={memberCount}
            onlineCount={onlineCount}
            adminCount={adminCount}
          />
        </div>
      </div>
    </div>
  );
}

function VisibilityOption({
  active,
  brand,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  brand: string;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        active ? "border-2" : "border-[#E4E4E4] hover:border-[#d4d4d4]",
      )}
      style={active ? { borderColor: brand, backgroundColor: `${brand}0d` } : undefined}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-[#202124]">
        <span style={active ? { color: brand } : undefined}>{icon}</span>
        {title}
      </span>
      <span className="text-xs text-[#909090]">{description}</span>
    </button>
  );
}
