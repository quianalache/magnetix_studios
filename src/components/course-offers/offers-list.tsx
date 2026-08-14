"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, Link2, Loader2, Palette, Pencil, Plus } from "lucide-react";
import { subscribeToCourseOffers } from "@/lib/firestore/course-offers";
import { subscribeToStandaloneCourses } from "@/lib/firestore/standalone-courses";
import { subscribeToProjectTemplates } from "@/lib/firestore/projects";
import { useSubAccount } from "@/context/sub-account-context";
import { buildOfferUrl } from "@/lib/domains/public-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreateOfferModal } from "./create-offer-modal";
import type { CourseOffer, OfferVisibility } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";
import type { ProjectTemplate } from "@/types/projects";

type VisibilityFilter = "published" | "draft" | "all";

function priceLabel(offer: CourseOffer): string {
  if (offer.priceTextOverride) return offer.priceTextOverride;
  if (offer.type === "free") return "Free";
  const amount = formatCurrency(
    (offer.priceCents ?? 0) / 100,
    offer.currency ?? "USD"
  );
  return offer.type === "recurring"
    ? `${amount} / ${offer.recurringInterval ?? "month"}`
    : amount;
}

function typeLabel(offer: CourseOffer): string {
  if (offer.type === "free") return "Free";
  if (offer.type === "recurring") return "Recurring";
  return "One Time";
}

function entitlementLabels(
  offer: CourseOffer,
  courseTitle: ReadonlyMap<string, string>
): string[] {
  return [
    ...offer.courseIds.map((id) => courseTitle.get(id) ?? "Untitled course"),
    ...offer.projectTemplates.map((template) => template.templateTitle),
    ...(offer.booking ? [`${offer.booking.bookingPageName} sessions`] : []),
  ];
}

export function OffersList({
  subAccountId,
  courseId,
}: {
  subAccountId: string;
  /** When set, scopes the list to offers that bundle this course — powers a
   *  single course's own "Offers" tab (which offers include this course). */
  courseId?: string;
}) {
  const { subAccount, agencyId } = useSubAccount();
  const [offers, setOffers] = useState<CourseOffer[]>([]);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>(
    []
  );
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VisibilityFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(
    () =>
      subscribeToCourseOffers(
        subAccountId,
        (list) => {
          setOffers(list);
          setLoaded(true);
        },
        () => setLoaded(true)
      ),
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

  const courseTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of courses) map.set(c.id, c.title);
    return map;
  }, [courses]);

  const filtered = useMemo(() => {
    return offers
      .filter((o) => !courseId || o.courseIds.includes(courseId))
      .filter((o) => filter === "all" || o.visibility === filter)
      .filter((o) => o.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [offers, courseId, filter, search]);

  function copyLink(offer: CourseOffer) {
    const url = buildOfferUrl({
      subAccount,
      subAccountId,
      offerId: offer.id,
      slug: offer.slug,
    });
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  async function updateVisibility(
    offer: CourseOffer,
    visibility: OfferVisibility
  ) {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/course-offers/${offer.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      }
    );
    if (res.ok) {
      toast.success(visibility === "published" ? "Published." : "Unpublished.");
    } else {
      toast.error("Couldn't update visibility");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-8 max-w-xs text-[13px]"
          />
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Create Offer
        </Button>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-[13px]">
            {offers.length === 0
              ? "No offers yet. Create one to start bundling and pricing your products."
              : "No offers match this filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground border-b">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Entitlements</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Visibility</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((offer) => {
                const labels = entitlementLabels(offer, courseTitle);
                return (
                  <tr key={offer.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/sa/${subAccountId}/courses/offers/${offer.id}`}
                        className="font-medium hover:underline"
                      >
                        {offer.title}
                      </Link>
                      {offer.version > 1 && (
                        <span className="text-muted-foreground ml-2 rounded-full border px-1.5 py-0.5 text-[10px]">
                          Version {offer.version}
                        </span>
                      )}
                      <p className="text-muted-foreground text-[12px]">
                        {labels.slice(0, 3).join(", ")}
                        {labels.length > 3 && ` +${labels.length - 3} more`}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {labels.length}
                    </td>
                    <td className="px-3 py-2.5">{typeLabel(offer)}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {priceLabel(offer)}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={offer.visibility}
                        onChange={(e) =>
                          updateVisibility(
                            offer,
                            e.target.value as OfferVisibility
                          )
                        }
                        className={cn(
                          "focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground rounded-full border-0 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase focus-visible:ring-1 focus-visible:outline-none [&>option]:normal-case",
                          offer.visibility === "published"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                        )}
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-muted-foreground flex items-center gap-1">
                        <Link
                          href={`/sa/${subAccountId}/courses/offers/${offer.id}/theme`}
                          title="Edit Checkout"
                          className="hover:bg-muted hover:text-foreground rounded p-1"
                        >
                          <Palette className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          href={`/sa/${subAccountId}/courses/offers/${offer.id}`}
                          title="Edit"
                          className="hover:bg-muted hover:text-foreground rounded p-1"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        {offer.visibility === "published" && (
                          <a
                            href={`/offer/${subAccountId}/${offer.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Preview"
                            className="hover:bg-muted hover:text-foreground rounded p-1"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => copyLink(offer)}
                          title="Get link"
                          className="hover:bg-muted hover:text-foreground rounded p-1"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateOfferModal
        subAccountId={subAccountId}
        courses={courses}
        projectTemplates={projectTemplates}
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultCourseId={courseId}
      />
    </div>
  );
}
