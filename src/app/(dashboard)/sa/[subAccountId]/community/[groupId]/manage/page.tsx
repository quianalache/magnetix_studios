"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  DoorOpen,
  ExternalLink,
  Loader2,
  Plus,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useSubAccount } from "@/context/sub-account-context";
import { buildCommunityGroupUrl } from "@/lib/domains/public-url";
import {
  ABOUT_MAX_CHARS,
  GUIDELINES_MAX_CHARS,
  SIDEBAR_CARDS_MAX,
  SIDEBAR_CARD_BODY_MAX,
  SIDEBAR_CARD_BUTTON_LABEL_MAX,
  SIDEBAR_CARD_HEADING_MAX,
  TAGLINE_MAX_CHARS,
} from "@/config/community";
import { AboutRichTextEditor } from "@/components/community/about-rich-text-editor";
import { ImageUpload } from "@/components/community/image-upload";
import { uploadCommunityImage } from "@/lib/community/upload-image";
import { Button } from "@/components/ui/button";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CommunityAboutMediaItem,
  CommunityGroup,
  CommunityReview,
  CommunitySidebarCard,
  CommunityTier,
  GroupAccess,
  GroupJoinPolicy,
  GroupStatus,
  ResourceLink,
} from "@/types/community";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

function clientPlainTextLength(html: string): number {
  if (typeof window === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

export default function CommunityGroupSettingsPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { groupId } = use(params);
  const { subAccountId, subAccount, isAdmin, loading: subAccountLoading } = useSubAccount();
  const router = useRouter();

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [aboutMedia, setAboutMedia] = useState<CommunityAboutMediaItem[]>([]);
  const [tagline, setTagline] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<GroupStatus>("draft");
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>("open");
  const [access, setAccess] = useState<GroupAccess>("free");
  const [price, setPrice] = useState("");
  const [categories, setCategories] = useState("");
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [guidelines, setGuidelines] = useState("");
  const [sidebarCards, setSidebarCards] = useState<CommunitySidebarCard[]>([]);
  const [tiers, setTiers] = useState<Partial<CommunityTier>[]>([]);
  const [reviews, setReviews] = useState<CommunityReview[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(getFirebaseDb(), `subAccounts/${subAccountId}/communityGroups/${groupId}`),
      (snap) => {
        if (!snap.exists()) {
          setGroup(null);
          setLoaded(true);
          return;
        }
        const g = { id: snap.id, ...(snap.data() as Omit<CommunityGroup, "id">) };
        setGroup(g);
        setName(g.name);
        setAbout(g.aboutHtml || g.about || "");
        setAboutMedia(g.aboutMedia ?? []);
        setTagline(g.tagline ?? "");
        setBrandColor(g.brandColor ?? "");
        setCoverUrl(g.coverUrl ?? null);
        setCardImageUrl(g.cardImageUrl ?? null);
        setLogoUrl(g.logoUrl ?? null);
        setStatus(g.status);
        setJoinPolicy(g.joinPolicy);
        setAccess(g.access);
        setPrice(g.priceCents != null ? (g.priceCents / 100).toString() : "");
        setCategories((g.categories ?? ["General"]).join(", "));
        setLinks(g.links ?? []);
        setGuidelines(g.guidelinesHtml ?? "");
        setSidebarCards(g.sidebarCards ?? []);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [subAccountId, groupId]);

  useEffect(() => {
    const tiersQuery = query(
      collection(getFirebaseDb(), `subAccounts/${subAccountId}/communityGroups/${groupId}/tiers`),
      orderBy("displayOrder", "asc"),
    );
    return onSnapshot(tiersQuery, (snap) => {
      setTiers(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityTier, "id">) })),
      );
    });
  }, [subAccountId, groupId]);

  useEffect(() => {
    const reviewsQuery = query(
      collection(getFirebaseDb(), `subAccounts/${subAccountId}/communityGroups/${groupId}/reviews`),
      orderBy("updatedAt", "desc"),
    );
    return onSnapshot(reviewsQuery, (snap) => {
      setReviews(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommunityReview, "id">) })),
      );
    });
  }, [subAccountId, groupId]);

  async function handleSave() {
    if (clientPlainTextLength(about) > ABOUT_MAX_CHARS) {
      toast.error(`About must be ${ABOUT_MAX_CHARS} characters or less.`);
      return;
    }
    setSaving(true);
    try {
      const priceCents =
        access === "paid" && price.trim()
          ? Math.round(parseFloat(price) * 100)
          : null;
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/community/${groupId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            aboutHtml: about,
            aboutMedia,
            tagline,
            brandColor: brandColor.trim() || null,
            coverUrl,
            cardImageUrl,
            logoUrl,
            status,
            joinPolicy,
            access,
            priceCents,
            categories: categories
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
            links: links.filter((l) => l.url.trim()),
            guidelinesHtml: guidelines,
            sidebarCards,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save");
      const tiersRes = await fetch(
        `/api/sub-accounts/${subAccountId}/community/${groupId}/tiers`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tiers }),
        },
      );
      const tiersData = (await tiersRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!tiersRes.ok || !tiersData.ok) {
        throw new Error(tiersData.error ?? "Group saved, but tiers failed");
      }
      toast.success("Group saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this group? This can't be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/community/${groupId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Group deleted.");
      router.push(`/sa/${subAccountId}/community`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  if (!loaded || subAccountLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-center text-sm text-muted-foreground">
        Group not found.{" "}
        <Link href={`/sa/${subAccountId}/community`} className="underline">
          Back to Community
        </Link>
      </div>
    );
  }

  const publicUrl = buildCommunityGroupUrl({
    subAccount,
    subAccountId,
    groupSlug: group.slug,
  });
  const aboutTextCount = clientPlainTextLength(about);
  const guidelinesTextCount = clientPlainTextLength(guidelines);
  const activeReviews = reviews.filter((review) => review.status === "active");

  function updateMedia(
    index: number,
    patch: Partial<CommunityAboutMediaItem>,
  ) {
    setAboutMedia((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function addMedia(type: "image" | "video") {
    setAboutMedia((prev) => [
      ...prev,
      {
        id: `media-${Date.now()}`,
        type,
        url: "",
        title: "",
        thumbnailUrl: null,
        provider: null,
        videoId: null,
        order: prev.length,
      },
    ]);
  }

  function updateSidebarCard(index: number, patch: Partial<CommunitySidebarCard>) {
    setSidebarCards((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  function addSidebarCard() {
    setSidebarCards((prev) => [
      ...prev,
      {
        id: `card-${Date.now()}`,
        heading: "",
        body: "",
        imageUrl: null,
        buttonLabel: "",
        buttonUrl: "",
        accentColor: null,
        order: prev.length,
      },
    ]);
  }

  function updateTier(index: number, patch: Partial<CommunityTier>) {
    setTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    );
  }

  async function removeReview(reviewId: string) {
    if (!confirm("Remove this review from the About page?")) return;
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/community/${groupId}/reviews/${reviewId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Couldn't remove review");
      toast.success("Review removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove review");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/sa/${subAccountId}/community/${groupId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Community
        </Link>
        <div className="flex items-center gap-4">
          {/* Staff Community-in-CRM integration (2026-08-24) — this "legacy
              fields" form used to be the ONLY staff-side view of a group at
              all (hence "Enter Community" living here); the real feed/
              channels/leaderboard/members/Settings experience now renders
              natively inside the CRM at the parent route above. This page
              stays reachable for the fields not yet folded into the native
              Settings tabs (About media gallery, join policy, price, tiers,
              reviews) — see the Staff Community Integration report.
              "View as Member" (same Staff -> Member Seamless Entry bridge
              as before, unchanged) is still the one intentional door out to
              the real standalone branded experience. */}
          <a
            href={`/api/sub-accounts/${subAccountId}/community/${groupId}/enter`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <DoorOpen className="h-3.5 w-3.5" /> View as Member
          </a>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            View public page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/sa/${subAccountId}/community/${groupId}/members`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Users className="h-4 w-4" /> Members
          </Link>
          <Link
            href={`/sa/${subAccountId}/community/${groupId}/classroom-builder`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <BookOpen className="h-4 w-4" /> Manage classroom
          </Link>
        </div>
      </div>

      {!isAdmin && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          These settings are read-only for you right now — either you&apos;re
          not an admin on this sub-account, or your access couldn&apos;t be
          verified. Try refreshing the page; if this persists, sign out and
          back in.
        </p>
      )}

      <fieldset disabled={!isAdmin || saving} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Group name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Public URL: <code>{publicUrl}</code>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="about">About</Label>
          <AboutRichTextEditor
            value={about}
            onChange={setAbout}
            disabled={!isAdmin || saving}
          />
          <p
            className={`text-right text-xs ${
              aboutTextCount > ABOUT_MAX_CHARS
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {aboutTextCount}/{ABOUT_MAX_CHARS}
          </p>
          <p className="text-xs text-muted-foreground">
            Supports bold, italic, underline, links, lists, line breaks, and
            lightweight headings. The member-facing page renders a sanitized
            preview of this same content.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>About media gallery</Label>
              <p className="text-xs text-muted-foreground">
                First item is featured large; up to 8 items render in the gallery.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => addMedia("image")}>
                <Plus className="h-4 w-4" /> Image
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => addMedia("video")}>
                <Plus className="h-4 w-4" /> Video
              </Button>
            </div>
          </div>
          {aboutMedia.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Add media for the About page, or keep using the cover image fallback.
            </div>
          ) : (
            <div className="space-y-3">
              {aboutMedia.map((item, i) => (
                <div key={item.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[120px_1fr_auto]">
                  <div className="text-xs font-medium text-muted-foreground">
                    {i === 0 ? "Featured" : `Gallery ${i}`}
                  </div>
                  <div className="grid gap-2">
                    <select
                      className={SELECT_CLASS}
                      value={item.type}
                      onChange={(e) => updateMedia(i, { type: e.target.value as "image" | "video" })}
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    {item.type === "image" ? (
                      <ImageUpload
                        label="Image"
                        value={item.url || null}
                        onChange={(url) => updateMedia(i, { url: url ?? "" })}
                        onUploadingChange={setImgUploading}
                        onUpload={(file) => uploadCommunityImage(file, subAccountId, groupId, "about")}
                        aspect="video"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <Input
                        value={item.url}
                        onChange={(e) => updateMedia(i, { url: e.target.value })}
                        placeholder="YouTube, Vimeo, Loom, or Descript URL"
                      />
                    )}
                    <Input
                      value={item.title}
                      onChange={(e) => updateMedia(i, { title: e.target.value })}
                      placeholder="Media title (optional)"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAboutMedia(aboutMedia.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <ImageUpload
            label="Cover image"
            hint="The large hero image on the public About page (16:9 works best)."
            value={coverUrl}
            onChange={setCoverUrl}
            onUploadingChange={setImgUploading}
            onUpload={(file) => uploadCommunityImage(file, subAccountId, groupId, "cover")}
            aspect="video"
            disabled={!isAdmin}
          />
          <ImageUpload
            label="Card image"
            hint="The image at the top of the right-hand join card (16:9). Falls back to the cover if empty."
            value={cardImageUrl}
            onChange={setCardImageUrl}
            onUploadingChange={setImgUploading}
            onUpload={(file) => uploadCommunityImage(file, subAccountId, groupId, "card")}
            aspect="video"
            disabled={!isAdmin}
          />
        </div>

        <ImageUpload
          label="Logo / icon"
          hint="Small brand mark shown in the page header. Square works best."
          value={logoUrl}
          onChange={setLogoUrl}
          onUploadingChange={setImgUploading}
          onUpload={(file) => uploadCommunityImage(file, subAccountId, groupId, "logo")}
          aspect="square"
          disabled={!isAdmin}
        />

        <div className="space-y-1.5">
          <Label htmlFor="tagline">Card tagline</Label>
          <Input
            id="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX_CHARS))}
            maxLength={TAGLINE_MAX_CHARS}
            placeholder="One short line shown under the logo in the join card."
          />
          <p className="text-right text-xs text-muted-foreground">
            {tagline.length}/{TAGLINE_MAX_CHARS}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              className={SELECT_CLASS}
              value={status}
              onChange={(e) => setStatus(e.target.value as GroupStatus)}
            >
              <option value="draft">Draft (hidden)</option>
              <option value="published">Published (live)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brandColor">Brand color (hex)</Label>
            <Input
              id="brandColor"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#2E6EF5"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="categories">Feed categories</Label>
          <Input
            id="categories"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="General, Wins, Questions, Introductions"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated. &quot;General&quot; is always kept; up to 10 total.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Links</Label>
          <p className="text-xs text-muted-foreground">
            Shown in the community sidebar (e.g. your website, a resource). Up to
            10.
          </p>
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={l.label}
                placeholder="Label"
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], label: e.target.value };
                  setLinks(next);
                }}
                className="w-1/3"
              />
              <Input
                value={l.url}
                placeholder="https://…"
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], url: e.target.value };
                  setLinks(next);
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLinks([...links, { label: "", url: "" }])}
          >
            <Plus className="h-4 w-4" /> Add link
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="guidelines">Community Guidelines</Label>
          <AboutRichTextEditor
            value={guidelines}
            onChange={setGuidelines}
            disabled={!isAdmin || saving}
          />
          <p
            className={`text-right text-xs ${
              guidelinesTextCount > GUIDELINES_MAX_CHARS
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {guidelinesTextCount}/{GUIDELINES_MAX_CHARS}
          </p>
          <p className="text-xs text-muted-foreground">
            Shown as a compact card in the Community Home right rail. Leave
            empty to hide that card.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Home sidebar cards</Label>
              <p className="text-xs text-muted-foreground">
                Up to {SIDEBAR_CARDS_MAX} owner-configurable cards shown near
                the bottom of the Community Home right rail — promote an
                offer, a resource, a start-here guide, anything with an
                image, a short blurb, and one button.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSidebarCard}
              disabled={sidebarCards.length >= SIDEBAR_CARDS_MAX}
            >
              <Plus className="h-4 w-4" /> Add card
            </Button>
          </div>
          {sidebarCards.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No sidebar cards yet. The Home right rail simply won&apos;t show this section.
            </div>
          ) : (
            <div className="space-y-3">
              {sidebarCards.map((card, i) => (
                <div key={card.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[140px_1fr_auto]">
                  <ImageUpload
                    label="Image"
                    value={card.imageUrl}
                    onChange={(url) => updateSidebarCard(i, { imageUrl: url })}
                    onUploadingChange={setImgUploading}
                    onUpload={(file) =>
                      uploadCommunityImage(file, subAccountId, groupId, "sidebar-card")
                    }
                    aspect="video"
                    disabled={!isAdmin}
                  />
                  <div className="grid gap-2">
                    <Input
                      value={card.heading}
                      onChange={(e) =>
                        updateSidebarCard(i, {
                          heading: e.target.value.slice(0, SIDEBAR_CARD_HEADING_MAX),
                        })
                      }
                      placeholder="Heading"
                      maxLength={SIDEBAR_CARD_HEADING_MAX}
                    />
                    <textarea
                      value={card.body}
                      onChange={(e) =>
                        updateSidebarCard(i, {
                          body: e.target.value.slice(0, SIDEBAR_CARD_BODY_MAX),
                        })
                      }
                      placeholder="Short description"
                      rows={2}
                      maxLength={SIDEBAR_CARD_BODY_MAX}
                      className={SELECT_CLASS.replace("h-9", "min-h-16 py-2")}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={card.buttonLabel}
                        onChange={(e) =>
                          updateSidebarCard(i, {
                            buttonLabel: e.target.value.slice(0, SIDEBAR_CARD_BUTTON_LABEL_MAX),
                          })
                        }
                        placeholder="Button label"
                        maxLength={SIDEBAR_CARD_BUTTON_LABEL_MAX}
                      />
                      <Input
                        value={card.buttonUrl}
                        onChange={(e) => updateSidebarCard(i, { buttonUrl: e.target.value })}
                        placeholder="https://…"
                      />
                    </div>
                    <ColorInput
                      label="Button color (optional — falls back to brand color)"
                      value={card.accentColor ?? ""}
                      onChange={(hex) => updateSidebarCard(i, { accentColor: hex || null })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarCards(sidebarCards.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="joinPolicy">Join policy</Label>
            <select
              id="joinPolicy"
              className={SELECT_CLASS}
              value={joinPolicy}
              onChange={(e) => setJoinPolicy(e.target.value as GroupJoinPolicy)}
            >
              <option value="open">Open — anyone can join instantly</option>
              <option value="approval">Approval — admin approves joins</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="access">Access</Label>
            <select
              id="access"
              className={SELECT_CLASS}
              value={access}
              onChange={(e) => setAccess(e.target.value as GroupAccess)}
            >
              <option value="free">Free</option>
              <option value="paid">Paid (one-time)</option>
            </select>
          </div>
        </div>

        {access === "paid" && (
          <div className="space-y-1.5">
            <Label htmlFor="price">One-time price</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="49.00"
            />
            <p className="text-xs text-muted-foreground">
              Paid joins (one-time PayPal, admin marks paid) go live with the
              access-controls slice. Until then a paid group can&apos;t be joined.
            </p>
          </div>
        )}

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Tiers / plans</Label>
              <p className="text-xs text-muted-foreground">
                Used for About-page Upgrade CTAs and future entitlements.
                Checkout URLs are optional until billing is fully connected.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setTiers([
                  ...tiers,
                  {
                    name: "",
                    description: "",
                    priceCents: null,
                    currency: "USD",
                    billingInterval: "month",
                    displayOrder: tiers.length,
                    active: true,
                    entitlementMetadata: {},
                    checkoutUrl: null,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Add tier
            </Button>
          </div>
          {tiers.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No tiers configured. Members will not see Upgrade CTAs.
            </div>
          ) : (
            <div className="space-y-3">
              {tiers.map((tier, i) => (
                <div key={tier.id ?? i} className="grid gap-3 rounded-md border p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={tier.name ?? ""}
                      onChange={(e) => updateTier(i, { name: e.target.value })}
                      placeholder="Tier name"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.priceCents != null ? tier.priceCents / 100 : ""}
                      onChange={(e) =>
                        updateTier(i, {
                          priceCents: e.target.value
                            ? Math.round(parseFloat(e.target.value) * 100)
                            : null,
                        })
                      }
                      placeholder="Price"
                    />
                  </div>
                  <Input
                    value={tier.description ?? ""}
                    onChange={(e) => updateTier(i, { description: e.target.value })}
                    placeholder="Short tier description"
                  />
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select
                      className={SELECT_CLASS}
                      value={tier.billingInterval ?? "month"}
                      onChange={(e) =>
                        updateTier(i, {
                          billingInterval: e.target.value as CommunityTier["billingInterval"],
                        })
                      }
                    >
                      <option value="one_time">One-time</option>
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                    </select>
                    <Input
                      value={tier.checkoutUrl ?? ""}
                      onChange={(e) =>
                        updateTier(i, { checkoutUrl: e.target.value || null })
                      }
                      placeholder="Checkout URL (optional)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <Label>Reviews</Label>
            <p className="text-xs text-muted-foreground">
              Active member reviews appear on the About page. Removed reviews
              stay hidden.
            </p>
          </div>
          {activeReviews.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No active reviews yet.
            </div>
          ) : (
            <div className="space-y-2">
              {activeReviews.map((review) => (
                <div key={review.id} className="flex items-start gap-3 rounded-md border p-3">
                  <div className="flex min-w-20 items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-3.5 w-3.5 ${n <= review.rating ? "fill-current" : ""}`}
                      />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {review.memberId}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{review.body || "No written review."}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReview(review.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      {isAdmin && (
        <div className="flex items-center justify-between border-t pt-5">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            <Trash2 className="h-4 w-4" /> Delete group
          </Button>
          <Button onClick={handleSave} disabled={saving || imgUploading}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : imgUploading ? (
              "Uploading image…"
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
