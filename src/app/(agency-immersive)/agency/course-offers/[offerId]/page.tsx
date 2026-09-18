"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { ExtraContactInfoPanel, ServiceAgreementPanel } from "@/components/course-offers/theme-editor/checkout-settings-panels";
import { uploadAgencyCourseOfferImage } from "@/lib/community/upload-image";
import { DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS, type CourseOffer, type CourseOfferCheckoutSettings, type CourseOfferUpsell, type OfferType, type RecurringInterval } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";

/**
 * Agency Course Offer editor — title/description, bundled courses,
 * pricing, visibility, thumbnail, checkout settings, and its (at most
 * one) One-Click Upsell. Simpler than the tenant offer editor
 * (`offer-details-tab.tsx`) on purpose: that component is deeply coupled
 * to Booking Pages/Project Templates and a generic multi-upsell CRUD UI
 * (In-App upsells included), neither of which exist/are ported at agency
 * scope (see agency-course-offer-service.ts / agency-course-offer-
 * upsell-service.ts).
 */
export default function AgencyCourseOfferEditorPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();
  const apiBase = `/api/agency/course-offers/${offerId}`;

  const [offer, setOffer] = useState<CourseOffer | null>(null);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
  const [otherOffers, setOtherOffers] = useState<CourseOffer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [type, setType] = useState<OfferType>("free");
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [recurringInterval, setRecurringInterval] = useState<RecurringInterval>("month");
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [priceTextOverride, setPriceTextOverride] = useState("");
  const [published, setPublished] = useState(false);
  const [discountCodesEnabled, setDiscountCodesEnabled] = useState(false);
  const [showRecentPurchasePopup, setShowRecentPurchasePopup] = useState(false);
  const [checkoutSettings, setCheckoutSettings] = useState<CourseOfferCheckoutSettings>(DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    fetch(apiBase)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { offer?: CourseOffer } | null) => {
        const o = d?.offer ?? null;
        setOffer(o);
        if (o) {
          setTitle(o.title);
          setDescription(o.descriptionHtml);
          setCourseIds(o.courseIds);
          setType(o.type);
          setPriceCents(o.priceCents);
          setCurrency(o.currency ?? "USD");
          setRecurringInterval(o.recurringInterval ?? "month");
          setTrialDays(o.trialDays);
          setPriceTextOverride(o.priceTextOverride ?? "");
          setPublished(o.visibility === "published");
          setDiscountCodesEnabled(o.discountCodesEnabled);
          setShowRecentPurchasePopup(o.showRecentPurchasePopup);
          setCheckoutSettings(o.checkoutSettings);
          setThumbnailUrl(o.thumbnailUrl);
        }
      })
      .catch(() => setOffer(null))
      .finally(() => setLoaded(true));
    fetch("/api/agency/standalone-courses")
      .then((r) => r.json())
      .then((d: { courses?: StandaloneCourse[] }) => setCourses(d.courses ?? []))
      .catch(() => {});
    fetch("/api/agency/course-offers")
      .then((r) => r.json())
      .then((d: { offers?: CourseOffer[] }) => setOtherOffers((d.offers ?? []).filter((o) => o.id !== offerId)))
      .catch(() => {});
  }, [isOwner, apiBase, offerId]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Course Offers is managed by the agency owner.
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Offer not found.{" "}
        <Link href="/agency/course-offers" className="underline">
          Back to Course Offers
        </Link>
      </div>
    );
  }

  function toggleCourse(id: string) {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleUploadThumbnail(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingThumbnail(true);
    try {
      const url = await uploadAgencyCourseOfferImage(file, offerId);
      setThumbnailUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingThumbnail(false);
    }
  }

  async function save() {
    if (!title.trim()) {
      toast.error("A title is required");
      return;
    }
    if (courseIds.length === 0) {
      toast.error("Select at least one course");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          descriptionHtml: description,
          courseIds,
          type,
          priceCents: type === "free" ? null : priceCents,
          currency: type === "free" ? null : currency,
          recurringInterval: type === "recurring" ? recurringInterval : null,
          trialDays: type === "recurring" ? trialDays : null,
          priceTextOverride: priceTextOverride.trim() || null,
          visibility: published ? "published" : "draft",
          discountCodesEnabled,
          showRecentPurchasePopup,
          checkoutSettings,
          thumbnailUrl,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Couldn't save");
      }
      toast.success("Offer saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this offer? Existing purchases and access are unaffected.")) return;
    const res = await fetch(apiBase, { method: "DELETE" });
    if (res.ok) {
      toast.success("Offer deleted");
      router.push("/agency/course-offers");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/agency/course-offers" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Course Offers
        </Link>
        <div className="flex items-center gap-2">
          <a href={`/offer/agency/${offerId}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" /> View checkout page
            </Button>
          </a>
          <Link href={`/agency/course-offers/${offerId}/theme`}>
            <Button variant="outline" size="sm">Theme</Button>
          </Link>
          <Link href={`/agency/course-offers/${offerId}/purchases`}>
            <Button variant="outline" size="sm">Purchases</Button>
          </Link>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={remove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{offer.title}</h1>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Thumbnail</Label>
          {thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="aspect-video w-full max-w-xs rounded-lg border object-cover" />
          )}
          <input type="file" accept="image/*" onChange={handleUploadThumbnail} disabled={uploadingThumbnail} className="text-sm" />
          {uploadingThumbnail && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <RichTextEditor value={description} onChange={setDescription} onUploadImage={(file) => uploadAgencyCourseOfferImage(file, offerId)} />
        </div>

        <div className="space-y-1.5">
          <Label>Courses in this bundle</Label>
          {courses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Standalone Courses yet.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={courseIds.includes(c.id)} onChange={() => toggleCourse(c.id)} className="h-4 w-4" />
                  {c.title}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Pricing</Label>
            <select value={type} onChange={(e) => setType(e.target.value as OfferType)} className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm">
              <option value="free">Free</option>
              <option value="oneTime">One-time</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
          {type !== "free" && (
            <div className="space-y-1.5">
              <Label>Price ({currency})</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={priceCents != null ? (priceCents / 100).toString() : ""}
                onChange={(e) => setPriceCents(e.target.value ? Math.round(Number(e.target.value) * 100) : null)}
              />
            </div>
          )}
          {type === "recurring" && (
            <>
              <div className="space-y-1.5">
                <Label>Billing interval</Label>
                <select value={recurringInterval} onChange={(e) => setRecurringInterval(e.target.value as RecurringInterval)} className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm">
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Trial days</Label>
                <Input type="number" min={0} value={trialDays ?? ""} onChange={(e) => setTrialDays(e.target.value ? Number(e.target.value) : null)} />
              </div>
            </>
          )}
        </div>

        {type !== "free" && (
          <div className="space-y-1.5">
            <Label>Price display override (optional)</Label>
            <Input value={priceTextOverride} onChange={(e) => setPriceTextOverride(e.target.value)} placeholder="e.g. Limited Time Only" />
          </div>
        )}

        {type !== "free" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={discountCodesEnabled} onChange={(e) => setDiscountCodesEnabled(e.target.checked)} className="h-4 w-4" />
            Allow discount codes at checkout
          </label>
        )}

        {type !== "free" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showRecentPurchasePopup} onChange={(e) => setShowRecentPurchasePopup(e.target.checked)} className="h-4 w-4" />
            Show &quot;recent purchases&quot; popup on the checkout page
          </label>
        )}

        <div className="space-y-4 border-t pt-4">
          <ExtraContactInfoPanel value={checkoutSettings} onChange={setCheckoutSettings} />
          <ServiceAgreementPanel value={checkoutSettings} onChange={setCheckoutSettings} />
        </div>

        {type !== "free" && (
          <div className="border-t pt-4">
            <OneClickUpsellSection offerId={offerId} otherOffers={otherOffers} />
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-4 w-4" />
            Published
          </label>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * At most one One-Click Upsell per offer — its own save action (a separate
 * endpoint from the offer's general PATCH, mirroring the tenant upsell
 * CRUD's own independence from the offer-details save button).
 */
function OneClickUpsellSection({ offerId, otherOffers }: { offerId: string; otherOffers: CourseOffer[] }) {
  const apiBase = `/api/agency/course-offers/${offerId}/upsell`;
  const [upsell, setUpsell] = useState<CourseOfferUpsell | null>(null);
  const [targetOfferId, setTargetOfferId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(apiBase)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { upsell?: CourseOfferUpsell | null } | null) => {
        setUpsell(d?.upsell ?? null);
        if (d?.upsell) setTargetOfferId(d.upsell.targetOfferId);
      })
      .finally(() => setLoaded(true));
  }, [apiBase]);

  const selectable = otherOffers.filter((o) => o.type !== "free" && o.visibility === "published");

  async function saveUpsell() {
    if (!targetOfferId) {
      toast.error("Pick a target offer first");
      return;
    }
    setBusy(true);
    try {
      const res = upsell
        ? await fetch(apiBase, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetOfferId }) })
        : await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetOfferId }) });
      const d = (await res.json().catch(() => ({}))) as { upsell?: CourseOfferUpsell; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Couldn't save upsell");
      if (d.upsell) setUpsell(d.upsell);
      toast.success("Upsell saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save upsell");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished() {
    if (!upsell) return;
    const next = upsell.visibility === "published" ? "draft" : "published";
    setBusy(true);
    try {
      const res = await fetch(apiBase, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility: next }) });
      if (!res.ok) throw new Error();
      setUpsell({ ...upsell, visibility: next });
    } catch {
      toast.error("Couldn't update upsell");
    } finally {
      setBusy(false);
    }
  }

  async function removeUpsell() {
    if (!confirm("Remove this one-click upsell?")) return;
    setBusy(true);
    try {
      await fetch(apiBase, { method: "DELETE" });
      setUpsell(null);
      setTargetOfferId("");
      toast.success("Upsell removed.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="space-y-2">
      <Label>One-Click Upsell</Label>
      <p className="text-xs text-muted-foreground">
        After a buyer pays for this offer, offer them one more paid offer with a single click — no second checkout form.
      </p>
      {selectable.length === 0 ? (
        <p className="text-xs text-muted-foreground">Publish another paid offer first to use it as an upsell target.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={targetOfferId} onChange={(e) => setTargetOfferId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2.5 text-sm">
            <option value="">Select an offer…</option>
            {selectable.map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={saveUpsell} disabled={busy}>
            {upsell ? "Update" : "Add upsell"}
          </Button>
          {upsell && (
            <>
              <Button size="sm" variant="outline" onClick={togglePublished} disabled={busy}>
                {upsell.visibility === "published" ? "Unpublish" : "Publish"}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={removeUpsell} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {upsell.visibility === "published" ? "Live — buyers will see this after checkout." : "Draft — not shown to buyers yet."}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
