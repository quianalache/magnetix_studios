"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Link2, Loader2, Palette, Trash2 } from "lucide-react";
import {
  subscribeToCourseOffer,
  subscribeToCourseOffers,
} from "@/lib/firestore/course-offers";
import { subscribeToStandaloneCourses } from "@/lib/firestore/standalone-courses";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OfferDetailsTab } from "@/components/course-offers/offer-details-tab";
import { OfferUpsellTab } from "@/components/course-offers/offer-upsell-tab";
import type { CourseOffer } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";

export default function CourseOfferDetailPage({
  params,
}: {
  params: Promise<{ subAccountId: string; offerId: string }>;
}) {
  const { subAccountId, offerId } = use(params);
  const [offer, setOffer] = useState<CourseOffer | null>(null);
  const [allOffers, setAllOffers] = useState<CourseOffer[]>([]);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("details");

  useEffect(
    () =>
      subscribeToCourseOffer(subAccountId, offerId, (o) => {
        setOffer(o);
        setLoaded(true);
      }),
    [subAccountId, offerId],
  );
  useEffect(
    () => subscribeToCourseOffers(subAccountId, setAllOffers),
    [subAccountId],
  );
  useEffect(
    () => subscribeToStandaloneCourses(subAccountId, setCourses),
    [subAccountId],
  );

  function copyLink() {
    if (!offer) return;
    const url = `${window.location.origin}/offer/${subAccountId}/${offer.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  async function togglePublish() {
    if (!offer) return;
    const next = offer.visibility === "published" ? "draft" : "published";
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/course-offers/${offer.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      },
    );
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) toast.success(next === "published" ? "Published." : "Unpublished.");
    else toast.error(d.error ?? "Couldn't update");
  }

  async function deleteOffer() {
    if (!offer) return;
    if (!confirm(`Delete "${offer.title}"? This can't be undone.`)) return;
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/course-offers/${offer.id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      toast.success("Offer deleted.");
      window.location.href = `/sa/${subAccountId}/courses`;
    } else {
      toast.error("Couldn't delete offer");
    }
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
      <div className="mx-auto w-full max-w-5xl p-6">
        <p className="text-[13px] text-muted-foreground">Offer not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/sa/${subAccountId}/courses`}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">{offer.title}</h1>
          {offer.version > 1 && (
            <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Version {offer.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/sa/${subAccountId}/courses/offers/${offer.id}/theme`}>
            <Button variant="outline" size="sm">
              <Palette className="h-3.5 w-3.5" /> Edit Checkout
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Link2 className="h-3.5 w-3.5" /> Get Link
          </Button>
          {offer.visibility === "published" && (
            <a
              href={`/offer/${subAccountId}/${offer.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </Button>
            </a>
          )}
          <Button variant="outline" size="sm" onClick={togglePublish}>
            {offer.visibility === "published" ? "Published" : "Draft"}
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={deleteOffer}
            title="Delete offer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="upsell">Upsell</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <OfferDetailsTab
            subAccountId={subAccountId}
            offer={offer}
            courses={courses}
            onSaved={() => {}}
          />
        </TabsContent>
        <TabsContent value="upsell">
          <OfferUpsellTab
            subAccountId={subAccountId}
            offer={offer}
            allOffers={allOffers}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
