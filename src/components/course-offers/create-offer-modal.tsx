"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect, MultiSelectChips } from "@/components/ui/multi-select";
import { subscribeToBookingPages } from "@/lib/firestore/booking-pages";
import {
  projectTemplateAudience,
  type ProjectTemplate,
} from "@/types/projects";
import type { OfferType } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { BookingPage } from "@/types/booking";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-[13px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

/** Quick-create modal — Title, Products, Type, Price Text Override, mirroring
 *  GHL's "Add Offers" modal. Saves as a draft, then routes to the detail page
 *  for everything else (description, pricing detail, access rules, upsells). */
export function CreateOfferModal({
  subAccountId,
  courses,
  projectTemplates,
  open,
  onOpenChange,
  defaultCourseId,
}: {
  subAccountId: string;
  courses: StandaloneCourse[];
  projectTemplates: ProjectTemplate[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Pre-selects this course when opened from a single course's own "Offers"
   *  tab, so creating an offer there doesn't require re-picking the course. */
  defaultCourseId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>(
    defaultCourseId ? [defaultCourseId] : []
  );
  const [projectTemplateIds, setProjectTemplateIds] = useState<string[]>([]);
  const [type, setType] = useState<OfferType>("free");
  const [priceTextOverride, setPriceTextOverride] = useState("");
  const [bookingPageId, setBookingPageId] = useState("");
  const [sessionCount, setSessionCount] = useState("1");
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(
    () => subscribeToBookingPages(subAccountId, setBookingPages),
    [subAccountId]
  );

  function reset() {
    setTitle("");
    setCourseIds(defaultCourseId ? [defaultCourseId] : []);
    setProjectTemplateIds([]);
    setType("free");
    setPriceTextOverride("");
    setBookingPageId("");
    setSessionCount("1");
  }

  async function save() {
    if (!title.trim()) {
      toast.error("Enter an offer title");
      return;
    }
    if (
      courseIds.length === 0 &&
      projectTemplateIds.length === 0 &&
      !bookingPageId
    ) {
      toast.error("Attach at least one entitlement");
      return;
    }
    setSaving(true);
    try {
      const selectedBookingPage = bookingPages.find(
        (p) => p.id === bookingPageId
      );
      const booking = selectedBookingPage
        ? {
            bookingPageId: selectedBookingPage.id,
            bookingPageName: selectedBookingPage.name,
            bookingPageSlug: selectedBookingPage.slug,
            sessionCount: Math.max(1, Number(sessionCount) || 1),
          }
        : null;
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/course-offers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            courseIds,
            projectTemplateIds,
            type,
            priceTextOverride: priceTextOverride.trim() || null,
            booking,
          }),
        }
      );
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        offer?: { id: string };
      };
      if (!res.ok || d.ok === false || !d.offer) {
        throw new Error(d.error ?? "Couldn't create offer");
      }
      toast.success("Offer created.");
      onOpenChange(false);
      reset();
      router.push(`/sa/${subAccountId}/courses/offers/${d.offer.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create offer");
    } finally {
      setSaving(false);
    }
  }

  const options = courses.map((c) => ({ value: c.id, label: c.title }));
  const clientProjectOptions = projectTemplates
    .filter((t) => projectTemplateAudience(t) === "client")
    .map((t) => ({ value: t.id, label: t.title }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Offers</DialogTitle>
          <p className="text-muted-foreground text-[13px]">
            Create and manage special offers for your courses
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="offer-title" className="text-[13px]">
              Title
            </Label>
            <Input
              id="offer-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Offer Title"
              maxLength={255}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Products</Label>
            <MultiSelect
              options={options}
              value={courseIds}
              onChange={setCourseIds}
              placeholder="Select Products"
            />
            <MultiSelectChips
              options={options}
              value={courseIds}
              onChange={setCourseIds}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offer-booking-page" className="text-[13px]">
              Booking Session
            </Label>
            <select
              id="offer-booking-page"
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
            {bookingPageId && (
              <Input
                type="number"
                min="1"
                value={sessionCount}
                onChange={(e) => setSessionCount(e.target.value)}
                placeholder="Sessions included"
                className="mt-1.5"
              />
            )}
            <p className="text-muted-foreground text-[12px]">
              Optional — bundle a booking link buyers get after purchase.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Client Projects</Label>
            <MultiSelect
              options={clientProjectOptions}
              value={projectTemplateIds}
              onChange={setProjectTemplateIds}
              placeholder="Select client project templates"
            />
            <MultiSelectChips
              options={clientProjectOptions}
              value={projectTemplateIds}
              onChange={setProjectTemplateIds}
            />
            <p className="text-muted-foreground text-[12px]">
              Optional — creates assigned client projects when this offer is
              granted.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offer-type" className="text-[13px]">
              Type
            </Label>
            <select
              id="offer-type"
              className={SELECT}
              value={type}
              onChange={(e) => setType(e.target.value as OfferType)}
            >
              <option value="free">Free</option>
              <option value="oneTime">One Time</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offer-price-text" className="text-[13px]">
              Price Text Override
            </Label>
            <Input
              id="offer-price-text"
              value={priceTextOverride}
              onChange={(e) => setPriceTextOverride(e.target.value)}
              placeholder="Free Offer"
              maxLength={255}
            />
            <p className="text-muted-foreground text-[12px]">
              Use a custom phrase to describe the price of this offer (e.g.,
              &apos;Free Trial&apos;, &apos;Limited Time Only&apos;)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
