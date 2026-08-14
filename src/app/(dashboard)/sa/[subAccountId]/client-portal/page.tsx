"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  FileSignature,
  FolderKanban,
  Link2,
  LogIn,
  MessagesSquare,
  Orbit,
  Trash2,
  Upload,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { subscribeToBookingPages } from "@/lib/firestore/booking-pages";
import { subscribeToCourseOffers } from "@/lib/firestore/course-offers";
import { subscribeToStandaloneCourses } from "@/lib/firestore/standalone-courses";
import {
  buildPortalHomeUrl,
  buildPortalLoginPageUrl,
  buildPortalLoginUrl,
} from "@/lib/domains/public-url";
import { cn } from "@/lib/utils";
import {
  resolvePortalBranding,
  type PortalBranding,
  type PortalPromotionConfig,
  type PortalPromotionType,
} from "@/types/portal-branding";
import type { BookingPage } from "@/types/booking";
import type { CourseOffer } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";

const SWATCHES = [
  "#5E2574",
  "#C6699A",
  "#9EDBDD",
  "#3D1652",
  "#2B7A78",
  "#B4485E",
];

type SettingsTab = "branding" | "modules" | "promotions";

export default function ClientPortalSettingsPage() {
  const { subAccountId, subAccount } = useSubAccount();
  const [tab, setTab] = useState<SettingsTab>("branding");
  const [branding, setBranding] = useState<PortalBranding>(
    resolvePortalBranding(null)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [offers, setOffers] = useState<CourseOffer[]>([]);
  const [promoType, setPromoType] = useState<PortalPromotionType>("course");
  const [promoTargetId, setPromoTargetId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/portal-branding`)
      .then((r) => r.json())
      .then((d: { branding: PortalBranding }) =>
        setBranding(resolvePortalBranding(d.branding))
      )
      .finally(() => setLoading(false));
  }, [subAccountId]);

  useEffect(
    () => subscribeToStandaloneCourses(subAccountId, setCourses),
    [subAccountId]
  );
  useEffect(
    () => subscribeToBookingPages(subAccountId, setBookingPages),
    [subAccountId]
  );
  useEffect(
    () => subscribeToCourseOffers(subAccountId, setOffers),
    [subAccountId]
  );

  async function save(patch: Partial<PortalBranding>) {
    const next = { ...branding, ...patch };
    setBranding(next);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/portal-branding`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't save that change. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/portal-branding/logo`,
        {
          method: "POST",
          body: form,
        }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) throw new Error(data.error);
      setBranding((prev) => ({ ...prev, logoUrl: data.url! }));
      toast.success("Logo updated");
    } catch {
      toast.error("Couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-muted/30 mx-auto h-64 w-full max-w-3xl animate-pulse rounded-xl border" />
    );
  }

  const portalDisplayName =
    branding.portalName || subAccount?.name || "Your Portal";
  const portalHomeUrl = buildPortalHomeUrl({ subAccount, subAccountId });
  const portalEntryUrl = buildPortalLoginUrl({ subAccount, subAccountId });
  const portalLoginPageUrl = buildPortalLoginPageUrl({
    subAccount,
    subAccountId,
  });
  const hasVerifiedPortalDomain =
    subAccount?.customDomain?.status === "verified";

  async function copyPortalLink() {
    await navigator.clipboard.writeText(portalEntryUrl);
    setCopied(true);
    toast.success("Portal link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  function promotionOptions(
    type: PortalPromotionType
  ): { id: string; label: string }[] {
    if (type === "course")
      return courses.map((course) => ({ id: course.id, label: course.title }));
    if (type === "booking") {
      return bookingPages
        .filter((page) => page.status === "published")
        .map((page) => ({ id: page.slug, label: page.name }));
    }
    if (type === "offer")
      return offers.map((offer) => ({ id: offer.id, label: offer.title }));
    return [];
  }

  function promotionTitle(promo: PortalPromotionConfig): string {
    if (promo.titleOverride) return promo.titleOverride;
    if (promo.type === "course") {
      return (
        courses.find((course) => course.id === promo.targetId)?.title ??
        "Course"
      );
    }
    if (promo.type === "booking") {
      return (
        bookingPages.find((page) => page.slug === promo.targetId)?.name ??
        "Booking service"
      );
    }
    if (promo.type === "offer") {
      return (
        offers.find((offer) => offer.id === promo.targetId)?.title ?? "Offer"
      );
    }
    return "Custom link";
  }

  async function savePromotions(promotions: PortalPromotionConfig[]) {
    await save({
      promotions: promotions.map((promo, index) => ({
        ...promo,
        order: index,
      })),
    });
  }

  async function addPromotion() {
    if (promoType === "custom") {
      if (!customTitle.trim() || !customUrl.trim()) {
        toast.error("Add a title and URL for the custom promotion");
        return;
      }
    } else if (!promoTargetId) {
      toast.error("Choose an item to promote");
      return;
    }
    const next: PortalPromotionConfig = {
      id: `promo-${Date.now()}`,
      type: promoType,
      targetId: promoType === "custom" ? null : promoTargetId,
      titleOverride: promoType === "custom" ? customTitle.trim() : null,
      descriptionOverride: null,
      urlOverride: promoType === "custom" ? customUrl.trim() : null,
      hidden: false,
      order: branding.promotions.length,
    };
    await savePromotions([...branding.promotions, next]);
    setPromoTargetId("");
    setCustomTitle("");
    setCustomUrl("");
  }

  async function updatePromotion(
    id: string,
    patch: Partial<PortalPromotionConfig>
  ) {
    await savePromotions(
      branding.promotions.map((promo) =>
        promo.id === id ? { ...promo, ...patch } : promo
      )
    );
  }

  async function removePromotion(id: string) {
    await savePromotions(
      branding.promotions.filter((promo) => promo.id !== id)
    );
  }

  async function movePromotion(id: string, dir: -1 | 1) {
    const list = [...branding.promotions].sort((a, b) => a.order - b.order);
    const index = list.findIndex((promo) => promo.id === id);
    const nextIndex = index + dir;
    if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
    [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
    await savePromotions(list);
  }

  return (
    <div className="momentum-scope mx-auto w-full max-w-4xl space-y-6 rounded-2xl">
      <div>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Memberships &middot; Client Portal
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          Client Portal settings
        </h1>
        <p className="text-muted-foreground text-sm">
          What clients see when they sign in — separate from your own account
          name.
        </p>
      </div>

      <div className="bg-card rounded-xl border p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Portal access</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Open the member-facing portal or copy the clean customer entry
              link.
            </p>
            <p className="text-muted-foreground mt-2 text-[11px]">
              {hasVerifiedPortalDomain
                ? `Using your verified domain: ${subAccount.customDomain?.domain}/portal`
                : "Using the shared Magnetix portal fallback until a custom domain is verified."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
            <Button
              render={
                <a href={portalHomeUrl} target="_blank" rel="noreferrer" />
              }
              size="sm"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Client Portal
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyPortalLink}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy Portal Link"}
            </Button>
            <Button
              render={
                <a href={portalLoginPageUrl} target="_blank" rel="noreferrer" />
              }
              variant="outline"
              size="sm"
            >
              <LogIn className="h-3.5 w-3.5" />
              Open Login Page
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 flex gap-1 rounded-xl border p-1">
        {(
          [
            ["branding", "Branding"],
            ["modules", "Modules"],
            ["promotions", "Promotions"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              tab === id
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "branding" && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Identity</h2>
            <p className="text-muted-foreground mt-0.5 mb-4 text-xs">
              Shows on the sign-in screen and portal header — decoupled from
              your internal account name.
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="portal-name">Portal name</Label>
                <Input
                  id="portal-name"
                  defaultValue={branding.portalName ?? ""}
                  placeholder={subAccount?.name ?? "Your Portal"}
                  onBlur={(e) =>
                    save({ portalName: e.target.value.trim() || null })
                  }
                />
                <p className="text-muted-foreground text-[11px]">
                  Leave blank to use your account name.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-welcome">Welcome message</Label>
                <Textarea
                  id="portal-welcome"
                  defaultValue={branding.welcomeMessage}
                  rows={2}
                  onBlur={(e) => save({ welcomeMessage: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  <div className="bg-muted/30 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed">
                    {branding.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={branding.logoUrl}
                        alt="Portal logo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs font-bold">
                        {portalDisplayName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoUpload(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    {uploading ? "Uploading…" : "Upload image"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Accent colour</h2>
            <p className="text-muted-foreground mt-0.5 mb-4 text-xs">
              Drives the logo fallback, buttons, and highlights across the
              portal.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={branding.accentColor}
                onChange={(e) => save({ accentColor: e.target.value })}
                className="h-9 w-11 cursor-pointer rounded-lg border"
              />
              <span className="text-muted-foreground font-mono text-xs">
                {branding.accentColor.toUpperCase()}
              </span>
            </div>
            <div className="mt-2.5 flex gap-2">
              {SWATCHES.map((hex) => (
                <button
                  key={hex}
                  onClick={() => save({ accentColor: hex })}
                  style={{ background: hex }}
                  className={cn(
                    "h-6 w-6 rounded-full border-2",
                    branding.accentColor.toLowerCase() === hex.toLowerCase()
                      ? "border-foreground"
                      : "border-transparent"
                  )}
                  aria-label={hex}
                />
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Support</h2>
            <p className="text-muted-foreground mt-0.5 mb-4 text-xs">
              Where a &quot;Need help?&quot; link on the sign-in screen points.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="portal-support">Support email</Label>
              <Input
                id="portal-support"
                type="email"
                defaultValue={branding.supportEmail ?? ""}
                placeholder="you@yourbusiness.com"
                onBlur={(e) =>
                  save({ supportEmail: e.target.value.trim() || null })
                }
              />
            </div>
          </div>
        </div>
      )}

      {tab === "modules" && (
        <div className="bg-card rounded-xl border p-5">
          <h2 className="text-sm font-semibold">
            What shows inside the portal
          </h2>
          <p className="text-muted-foreground mt-0.5 mb-4 text-xs">
            Turn off anything that doesn&apos;t apply to how you work.
          </p>

          <ModuleRow
            icon={<Calendar className="h-4 w-4" />}
            title="Appointments"
            desc="Upcoming booked appointments for the linked contact"
            checked={branding.modules.appointments}
            onChange={(v) =>
              save({ modules: { ...branding.modules, appointments: v } })
            }
          />
          <ModuleRow
            icon={<MessagesSquare className="h-4 w-4" />}
            title="Communities"
            desc="Community groups this member can access"
            checked={branding.modules.community}
            onChange={(v) =>
              save({ modules: { ...branding.modules, community: v } })
            }
          />
          <ModuleRow
            icon={<BookOpen className="h-4 w-4" />}
            title="Courses"
            desc="Enrolled Standalone Courses and progress"
            checked={branding.modules.courses}
            onChange={(v) =>
              save({ modules: { ...branding.modules, courses: v } })
            }
          />
          <ModuleRow
            icon={<FolderKanban className="h-4 w-4" />}
            title="Projects"
            desc="Projects assigned to the member's linked contact"
            checked={branding.modules.projects}
            onChange={(v) =>
              save({ modules: { ...branding.modules, projects: v } })
            }
          />
          <ModuleRow
            icon={<Orbit className="h-4 w-4" />}
            title="Energetic Readings"
            desc="Saved Frequency / Human Design charts"
            checked={branding.modules.readings}
            onChange={(v) =>
              save({ modules: { ...branding.modules, readings: v } })
            }
          />
          <ModuleRow
            icon={<Calendar className="h-4 w-4" />}
            title="Included Sessions"
            desc="Purchased booking-session entitlements and remaining sessions"
            checked={branding.modules.sessions}
            onChange={(v) =>
              save({ modules: { ...branding.modules, sessions: v } })
            }
          />
          <ModuleRow
            icon={<FileSignature className="h-4 w-4" />}
            title="Billing / Invoices"
            desc="Open and paid quotes and invoices"
            checked={branding.modules.invoices}
            onChange={(v) =>
              save({ modules: { ...branding.modules, invoices: v } })
            }
          />

          <div className="bg-muted/20 text-muted-foreground mt-3 rounded-lg border border-dashed p-3 text-xs">
            Resources &amp; Files are deferred until there is a real
            member-facing file/resource entitlement source to display.
          </div>
        </div>
      )}

      {tab === "promotions" && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Promotional right rail</h2>
            <p className="text-muted-foreground mt-0.5 mb-4 text-xs">
              These cards appear on the Client Portal Home right rail. If no
              cards are active, the rail collapses.
            </p>

            <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="promo-type">Type</Label>
                <select
                  id="promo-type"
                  value={promoType}
                  onChange={(e) => {
                    setPromoType(e.target.value as PortalPromotionType);
                    setPromoTargetId("");
                  }}
                  className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
                >
                  <option value="course">Course</option>
                  <option value="booking">Booking service</option>
                  <option value="offer">Offer</option>
                  <option value="custom">Custom link</option>
                </select>
              </div>

              {promoType === "custom" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-title">Title</Label>
                    <Input
                      id="promo-title"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Free training"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-url">URL</Label>
                    <Input
                      id="promo-url"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="promo-target">Item</Label>
                  <select
                    id="promo-target"
                    value={promoTargetId}
                    onChange={(e) => setPromoTargetId(e.target.value)}
                    className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
                  >
                    <option value="">Choose an item</option>
                    {promotionOptions(promoType).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <Button
              type="button"
              size="sm"
              onClick={addPromotion}
              className="mt-4"
            >
              <Link2 className="h-3.5 w-3.5" />
              Add promotion
            </Button>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Active cards</h2>
            {branding.promotions.length === 0 ? (
              <p className="text-muted-foreground mt-3 rounded-lg border border-dashed py-6 text-center text-xs">
                No promotional cards configured. The Portal Home right rail will
                collapse.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {[...branding.promotions]
                  .sort((a, b) => a.order - b.order)
                  .map((promo, index, list) => (
                    <div
                      key={promo.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {promotionTitle(promo)}
                        </p>
                        <p className="text-muted-foreground text-xs capitalize">
                          {promo.hidden ? "Hidden" : "Visible"} · {promo.type}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => movePromotion(promo.id, -1)}
                          disabled={index === 0}
                          title="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => movePromotion(promo.id, 1)}
                          disabled={index === list.length - 1}
                          title="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updatePromotion(promo.id, { hidden: !promo.hidden })
                          }
                        >
                          {promo.hidden ? "Show" : "Hide"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removePromotion(promo.id)}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {saving && <p className="text-muted-foreground text-xs">Saving…</p>}
    </div>
  );
}

function ModuleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3",
        !last && "border-b"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="bg-muted/50 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground text-xs">{desc}</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
