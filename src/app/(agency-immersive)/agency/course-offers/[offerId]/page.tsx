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
import { uploadAgencyCourseOfferImage } from "@/lib/community/upload-image";
import type { CourseOffer, OfferType, RecurringInterval } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";

/**
 * Agency Course Offer editor — title/description, bundled courses,
 * pricing, visibility, thumbnail. Simpler than the tenant offer editor
 * (`offer-details-tab.tsx`) on purpose: that component is deeply coupled
 * to Booking Pages/Project Templates/One-Click Upsells, none of which
 * exist at agency scope (see agency-course-offer-service.ts).
 */
export default function AgencyCourseOfferEditorPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();
  const apiBase = `/api/agency/course-offers/${offerId}`;

  const [offer, setOffer] = useState<CourseOffer | null>(null);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
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
          setThumbnailUrl(o.thumbnailUrl);
        }
      })
      .catch(() => setOffer(null))
      .finally(() => setLoaded(true));
    fetch("/api/agency/standalone-courses")
      .then((r) => r.json())
      .then((d: { courses?: StandaloneCourse[] }) => setCourses(d.courses ?? []))
      .catch(() => {});
  }, [isOwner, apiBase]);

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
