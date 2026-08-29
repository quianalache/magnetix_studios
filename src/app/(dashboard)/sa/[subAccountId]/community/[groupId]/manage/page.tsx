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
  GUIDELINES_MAX_CHARS,
  SIDEBAR_CARDS_MAX,
  SIDEBAR_CARD_BODY_MAX,
  SIDEBAR_CARD_BUTTON_LABEL_MAX,
  SIDEBAR_CARD_HEADING_MAX,
} from "@/config/community";
import { AboutRichTextEditor } from "@/components/community/about-rich-text-editor";
import { ImageUpload } from "@/components/community/image-upload";
import { uploadCommunityImage } from "@/lib/community/upload-image";
import { Button } from "@/components/ui/button";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CommunityGroup,
  CommunityReview,
  CommunitySidebarCard,
  CommunityTier,
  GroupAccess,
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

  // Form state — About content (text/media/card image/tagline) and the
  // Settings-duplicate fields (name/cover/logo/join policy/brand color)
  // were removed from this page's editable form (2026-08-29 About-tab
  // cleanup); see the note rendered above the fieldset for where each one
  // actually lives now. Their values are intentionally no longer read into
  // local state here since nothing on this page edits them anymore.
  const [status, setStatus] = useState<GroupStatus>("draft");
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
        setStatus(g.status);
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
            status,
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
  const guidelinesTextCount = clientPlainTextLength(guidelines);
  const activeReviews = reviews.filter((review) => review.status === "active");

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
          {/* Staff Community-in-CRM integration (2026-08-24) — this form used
              to be the ONLY staff-side view of a group at all (hence "Enter
              Community" living here); the real feed/channels/leaderboard/
              members/Settings experience now renders natively inside the
              CRM at the parent route above. About text/media/Join Card
              image moved to the About tab's own "Edit About" panel, and
              name/cover/logo/join policy to Settings → General (2026-08-29
              About-tab cleanup) — this page is no longer a primary
              customer workflow, just the remaining home for Status, Feed
              categories, Home sidebar Links/Guidelines/cards, Access/
              price/Tiers (deferred Access & Membership entitlement
              architecture), and review moderation, none of which have a
              better home yet. No longer linked from Community Home's
              sidebar; still reachable from the Community list page's own
              "Manage" link and directly by URL.
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

      <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          About page content, cover/logo image, and community identity moved.
        </p>
        <p className="mt-1">
          Edit the About text, About media gallery, and Join Card image from{" "}
          <strong>the About tab</strong> itself (an &quot;Edit About&quot;
          button appears there for moderators). Group name, cover image,
          logo, and join policy are edited in{" "}
          <strong>Community Settings → General</strong> — this page no
          longer duplicates them. Public URL: <code>{publicUrl}</code>
        </p>
      </div>

      <fieldset disabled={!isAdmin || saving} className="space-y-5">
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
