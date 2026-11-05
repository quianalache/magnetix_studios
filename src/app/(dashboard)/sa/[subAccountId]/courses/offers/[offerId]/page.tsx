"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Loader2,
  Palette,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import {
  subscribeToCourseOffer,
  subscribeToCourseOffers,
} from "@/lib/firestore/course-offers";
import { subscribeToProjectTemplates } from "@/lib/firestore/projects";
import { subscribeToStandaloneCourses } from "@/lib/firestore/standalone-courses";
import { useSubAccount } from "@/context/sub-account-context";
import { buildOfferUrl } from "@/lib/domains/public-url";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OfferDetailsTab } from "@/components/course-offers/offer-details-tab";
import { OfferUpsellTab } from "@/components/course-offers/offer-upsell-tab";
import type { CourseOffer } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { ProjectTemplate } from "@/types/projects";

export default function CourseOfferDetailPage({
  params,
}: {
  params: Promise<{ subAccountId: string; offerId: string }>;
}) {
  const { subAccountId, offerId } = use(params);
  const { subAccount, agencyId } = useSubAccount();
  const [offer, setOffer] = useState<CourseOffer | null>(null);
  const [allOffers, setAllOffers] = useState<CourseOffer[]>([]);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>(
    []
  );
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("details");
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(
    () =>
      subscribeToCourseOffer(subAccountId, offerId, (o) => {
        setOffer(o);
        setLoaded(true);
      }),
    [subAccountId, offerId]
  );
  useEffect(
    () => subscribeToCourseOffers(subAccountId, setAllOffers),
    [subAccountId]
  );
  useEffect(
    () => subscribeToStandaloneCourses(subAccountId, setCourses),
    [subAccountId]
  );
  useEffect(
    () =>
      subscribeToProjectTemplates(
        { agencyId: agencyId ?? "", subAccountId },
        setProjectTemplates
      ),
    [agencyId, subAccountId]
  );

  function copyLink() {
    if (!offer) return;
    const url = buildOfferUrl({
      subAccount,
      subAccountId,
      offerId: offer.id,
      slug: offer.slug,
    });
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
      }
    );
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok)
      toast.success(next === "published" ? "Published." : "Unpublished.");
    else toast.error(d.error ?? "Couldn't update");
  }

  // Archive replaces delete (pre-Funnel safety): purchases, subscriptions,
  // upsells and history are kept; the Offer just stops being purchasable.
  async function archiveOffer() {
    if (!offer) return;
    const ok = await confirm({
      title: `Archive "${offer.title}"?`,
      description: "It stops being available to buy and disappears from Offer pickers. Its purchases, subscriptions, upsells and history are kept, and you can restore it any time.",
      confirmLabel: "Archive offer",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/sub-accounts/${subAccountId}/course-offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    if (res.ok) toast.success("Offer archived.");
    else toast.error("Couldn't archive offer");
  }

  async function restoreOffer() {
    if (!offer) return;
    const res = await fetch(`/api/sub-accounts/${subAccountId}/course-offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) toast.success("Offer restored as a draft. Publish it when it's ready to sell.");
    else toast.error(d.error ?? "Couldn't restore offer");
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <p className="text-muted-foreground text-[13px]">Offer not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/sa/${subAccountId}/courses`}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">{offer.title}</h1>
          {offer.version > 1 && (
            <span className="text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px]">
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
          {offer.visibility === "archived" ? (
            <Button variant="outline" size="sm" onClick={restoreOffer}>
              <ArchiveRestore className="h-3.5 w-3.5" /> Restore
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={togglePublish}>
                {offer.visibility === "published" ? "Published" : "Draft"}
              </Button>
              <Button variant="outline" size="sm" onClick={archiveOffer} title="Archive offer">
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            </>
          )}
        </div>
      </div>
      {offer.visibility === "archived" && (
        <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-[13px]" data-offer-archived="">
          This offer is archived. It can&apos;t be bought and isn&apos;t offered in pickers, but its purchases, subscriptions and history are kept. Restore it to sell it again.
        </p>
      )}
      {confirmDialog}

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
            projectTemplates={projectTemplates}
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
