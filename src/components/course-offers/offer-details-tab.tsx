"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/community/image-upload";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { MultiSelect, MultiSelectChips } from "@/components/ui/multi-select";
import { uploadCourseOfferImage } from "@/lib/community/upload-image";
import { formatCurrency } from "@/lib/format";
import { subscribeToBookingPages } from "@/lib/firestore/booking-pages";
import type {
  CourseOffer,
  OfferType,
  RecurringInterval,
} from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { BookingPage } from "@/types/booking";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-[13px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

const isStripeTestMode = (
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
).startsWith("pk_test_");

function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d =
    typeof (value as { toDate?: () => Date }).toDate === "function"
      ? (value as { toDate: () => Date }).toDate()
      : null;
  return d ? d.toISOString().slice(0, 10) : "";
}

export function OfferDetailsTab({
  subAccountId,
  offer,
  courses,
  onSaved,
}: {
  subAccountId: string;
  offer: CourseOffer;
  courses: StandaloneCourse[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(offer.title);
  const [descriptionHtml, setDescriptionHtml] = useState(offer.descriptionHtml);
  const [courseIds, setCourseIds] = useState(offer.courseIds);
  const [type, setType] = useState<OfferType>(offer.type);
  const [price, setPrice] = useState(
    offer.priceCents != null ? (offer.priceCents / 100).toString() : "",
  );
  const [recurringInterval, setRecurringInterval] = useState<RecurringInterval>(
    offer.recurringInterval ?? "month",
  );
  const [trialDays, setTrialDays] = useState(
    offer.trialDays != null ? offer.trialDays.toString() : "",
  );
  const [priceTextOverride, setPriceTextOverride] = useState(
    offer.priceTextOverride ?? "",
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(offer.thumbnailUrl);
  const [discountCodesEnabled, setDiscountCodesEnabled] = useState(
    offer.discountCodesEnabled,
  );
  const [beginAtSpecificDate, setBeginAtSpecificDate] = useState(
    offer.access.beginAtSpecificDate,
  );
  const [beginDate, setBeginDate] = useState(
    toDateInputValue(offer.access.beginDate),
  );
  const [restrictToDays, setRestrictToDays] = useState(
    offer.access.restrictToDays,
  );
  const [accessDays, setAccessDays] = useState(
    offer.access.accessDays?.toString() ?? "",
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customJs, setCustomJs] = useState(offer.advanced.customJs);
  const [customCss, setCustomCss] = useState(offer.advanced.customCss);
  const [headerTracking, setHeaderTracking] = useState(
    offer.advanced.headerTracking,
  );
  const [footerTracking, setFooterTracking] = useState(
    offer.advanced.footerTracking,
  );
  const [bookingPageId, setBookingPageId] = useState(
    offer.booking?.bookingPageId ?? "",
  );
  const [sessionCount, setSessionCount] = useState(
    offer.booking?.sessionCount?.toString() ?? "1",
  );
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [imgUploading, setImgUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(
    () => subscribeToBookingPages(subAccountId, setBookingPages),
    [subAccountId],
  );

  // Re-sync local state whenever a fresh offer snapshot arrives (e.g. after
  // a save bumps `version`), so the form never fights the live subscription.
  useEffect(() => {
    setTitle(offer.title);
    setDescriptionHtml(offer.descriptionHtml);
    setCourseIds(offer.courseIds);
    setType(offer.type);
    setPrice(offer.priceCents != null ? (offer.priceCents / 100).toString() : "");
    setRecurringInterval(offer.recurringInterval ?? "month");
    setTrialDays(offer.trialDays != null ? offer.trialDays.toString() : "");
    setPriceTextOverride(offer.priceTextOverride ?? "");
    setThumbnailUrl(offer.thumbnailUrl);
    setDiscountCodesEnabled(offer.discountCodesEnabled);
    setBeginAtSpecificDate(offer.access.beginAtSpecificDate);
    setBeginDate(toDateInputValue(offer.access.beginDate));
    setRestrictToDays(offer.access.restrictToDays);
    setAccessDays(offer.access.accessDays?.toString() ?? "");
    setCustomJs(offer.advanced.customJs);
    setCustomCss(offer.advanced.customCss);
    setHeaderTracking(offer.advanced.headerTracking);
    setFooterTracking(offer.advanced.footerTracking);
    setBookingPageId(offer.booking?.bookingPageId ?? "");
    setSessionCount(offer.booking?.sessionCount?.toString() ?? "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id, offer.version]);

  async function save(publish?: boolean) {
    if (!title.trim()) {
      toast.error("Enter an offer title");
      return;
    }
    if (courseIds.length === 0) {
      toast.error("Attach at least one product to the offer");
      return;
    }
    setSaving(true);
    try {
      const selectedBookingPage = bookingPages.find((p) => p.id === bookingPageId);
      const booking = selectedBookingPage
        ? {
            bookingPageId: selectedBookingPage.id,
            bookingPageName: selectedBookingPage.name,
            bookingPageSlug: selectedBookingPage.slug,
            sessionCount: Math.max(1, Number(sessionCount) || 1),
          }
        : null;
      const patch = {
        title: title.trim(),
        descriptionHtml,
        courseIds,
        type,
        priceCents:
          type !== "free" && price.trim()
            ? Math.round(parseFloat(price) * 100)
            : null,
        currency: type !== "free" ? "USD" : null,
        recurringInterval: type === "recurring" ? recurringInterval : null,
        trialDays:
          type === "recurring" && trialDays.trim()
            ? Number(trialDays)
            : null,
        priceTextOverride: priceTextOverride.trim() || null,
        thumbnailUrl,
        discountCodesEnabled,
        access: {
          beginAtSpecificDate,
          beginDate: beginAtSpecificDate && beginDate ? new Date(beginDate) : null,
          restrictToDays,
          accessDays: restrictToDays && accessDays ? Number(accessDays) : null,
        },
        advanced: { customJs, customCss, headerTracking, footerTracking },
        booking,
        ...(publish !== undefined
          ? { visibility: publish ? "published" : "draft" }
          : {}),
      };
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/course-offers/${offer.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || d.ok === false) throw new Error(d.error ?? "Couldn't save");
      toast.success(publish ? "Offer published." : "Offer saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const options = courses.map((c) => ({ value: c.id, label: c.title }));
  const priceCentsPreview =
    type !== "free" && price.trim() ? Math.round(parseFloat(price) * 100) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="offer-d-title" className="text-[13px]">
            Title
          </Label>
          <Input
            id="offer-d-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={255}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px]">Description</Label>
          <RichTextEditor
            value={descriptionHtml}
            onChange={setDescriptionHtml}
            onUploadImage={(file) => uploadCourseOfferImage(file, subAccountId, offer.id)}
          />
          <p className="text-[12px] text-muted-foreground">
            In the absence of a custom checkout description, this will be used
            on the checkout page.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px]">Add Products</Label>
          <MultiSelect
            options={options}
            value={courseIds}
            onChange={setCourseIds}
            placeholder="Select Products"
          />
          <MultiSelectChips options={options} value={courseIds} onChange={setCourseIds} />
          <p className="text-[12px] text-muted-foreground">
            Please attach product to the offer
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="mb-2 text-[13px] font-medium">Booking Session</p>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Bundle a booking link so buyers can schedule sessions with you
            after purchase — e.g. &quot;2 calls with that person&quot;
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="offer-d-booking-page" className="text-[12px] text-muted-foreground">
              Booking Page
            </Label>
            <select
              id="offer-d-booking-page"
              className={SELECT}
              value={bookingPageId}
              onChange={(e) => setBookingPageId(e.target.value)}
            >
              <option value="">None</option>
              {bookingPages
                .filter((p) => p.status === "published")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          {bookingPageId && (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="offer-d-session-count" className="text-[12px] text-muted-foreground">
                Sessions Included
              </Label>
              <Input
                id="offer-d-session-count"
                type="number"
                min="1"
                value={sessionCount}
                onChange={(e) => setSessionCount(e.target.value)}
              />
              <p className="text-[12px] text-muted-foreground">
                Shown to the buyer and sent by email with the booking link.
                Not technically enforced — buyers can still book more via
                the link, same as anyone else.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium"
          >
            {advancedOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Advanced
          </button>
          {advancedOpen && (
            <div className="space-y-4 border-t p-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Custom Javascript</Label>
                <Textarea
                  value={customJs}
                  onChange={(e) => setCustomJs(e.target.value)}
                  className="min-h-24 font-mono text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Custom CSS</Label>
                <Textarea
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  className="min-h-24 font-mono text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Header Tracking</Label>
                <Textarea
                  value={headerTracking}
                  onChange={(e) => setHeaderTracking(e.target.value)}
                  className="min-h-16 font-mono text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Footer Tracking</Label>
                <Textarea
                  value={footerTracking}
                  onChange={(e) => setFooterTracking(e.target.value)}
                  className="min-h-16 font-mono text-[12px]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-[13px] font-medium">Offer Pricing</p>
          <div className="space-y-1.5">
            <Label htmlFor="offer-d-type" className="text-[12px] text-muted-foreground">
              Type
            </Label>
            <select
              id="offer-d-type"
              className={SELECT}
              value={type}
              onChange={(e) => setType(e.target.value as OfferType)}
            >
              <option value="free">Free</option>
              <option value="oneTime">One Time</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
          {type !== "free" && (
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="offer-d-price" className="text-[12px] text-muted-foreground">
                  Price (USD)
                </Label>
                <Input
                  id="offer-d-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              {type === "recurring" && (
                <select
                  className={SELECT}
                  style={{ width: 110 }}
                  value={recurringInterval}
                  onChange={(e) =>
                    setRecurringInterval(e.target.value as RecurringInterval)
                  }
                >
                  <option value="day">/ day</option>
                  <option value="week">/ week</option>
                  <option value="month">/ month</option>
                  <option value="year">/ year</option>
                </select>
              )}
            </div>
          )}
          {priceCentsPreview != null && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {formatCurrency(priceCentsPreview / 100, "USD")}
            </p>
          )}
          {type === "recurring" && (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="offer-d-trial-days" className="text-[12px] text-muted-foreground">
                Trial Days
              </Label>
              <Input
                id="offer-d-trial-days"
                type="number"
                min="0"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                placeholder="0"
              />
              <p className="text-[12px] text-muted-foreground">
                Number of days until first billing
              </p>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="offer-d-price-text" className="text-[12px] text-muted-foreground">
              Price Text Override
            </Label>
            <Input
              id="offer-d-price-text"
              value={priceTextOverride}
              onChange={(e) => setPriceTextOverride(e.target.value)}
              placeholder="Free Offer"
            />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Payment Mode:{" "}
            <span className="font-medium">
              {isStripeTestMode ? "Test" : "Live"}
            </span>
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox
              checked={discountCodesEnabled}
              onCheckedChange={(v) => setDiscountCodesEnabled(v === true)}
            />
            Enable Discount Codes
          </label>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Allow customers to apply discount codes at checkout
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="mb-2 text-[13px] font-medium">Offer Access</p>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Set accessibility for members who purchase this offer
          </p>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox
              checked={beginAtSpecificDate}
              onCheckedChange={(v) => setBeginAtSpecificDate(v === true)}
            />
            Begin access at specific date
          </label>
          {beginAtSpecificDate && (
            <Input
              type="date"
              value={beginDate}
              onChange={(e) => setBeginDate(e.target.value)}
              className="mt-1.5"
            />
          )}
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <Checkbox
              checked={restrictToDays}
              onCheckedChange={(v) => setRestrictToDays(v === true)}
            />
            Restrict access to specific amount of days
          </label>
          {restrictToDays && (
            <Input
              type="number"
              min="1"
              value={accessDays}
              onChange={(e) => setAccessDays(e.target.value)}
              placeholder="Enter number of days"
              className="mt-1.5"
            />
          )}
        </div>

        <ImageUpload
          label="Offer Thumbnail"
          hint="Recommended dimensions of 1280×720."
          value={thumbnailUrl}
          onChange={setThumbnailUrl}
          onUploadingChange={setImgUploading}
          onUpload={(file) => uploadCourseOfferImage(file, subAccountId, offer.id)}
        />
      </div>

      <div className="col-span-full flex items-center justify-between border-t pt-4">
        <span />
        <div className="flex gap-2">
          <Button variant="outline" disabled={saving || imgUploading} onClick={() => save()}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save
          </Button>
          <Button disabled={saving || imgUploading} onClick={() => save(true)}>
            Save &amp; Publish
          </Button>
        </div>
      </div>
    </div>
  );
}
