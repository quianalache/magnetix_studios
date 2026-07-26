"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Plus, Trash2 } from "lucide-react";
import { subscribeToCourseOfferUpsells } from "@/lib/firestore/course-offers";
import { Button } from "@/components/ui/button";
import { AddUpsellModal } from "./add-upsell-modal";
import type { CourseOffer, CourseOfferUpsell } from "@/types/course-offers";

export function OfferUpsellTab({
  subAccountId,
  offer,
  allOffers,
}: {
  subAccountId: string;
  offer: CourseOffer;
  allOffers: CourseOffer[];
}) {
  const [upsells, setUpsells] = useState<CourseOfferUpsell[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(
    () => subscribeToCourseOfferUpsells(subAccountId, offer.id, setUpsells),
    [subAccountId, offer.id],
  );

  const otherOffers = useMemo(
    () => allOffers.filter((o) => o.id !== offer.id),
    [allOffers, offer.id],
  );
  const targetTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of allOffers) map.set(o.id, o.title);
    return map;
  }, [allOffers]);
  const hasOneClick = upsells.some((u) => u.type === "oneClick");

  async function remove(upsellId: string) {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/course-offers/${offer.id}/upsells/${upsellId}`,
      { method: "DELETE" },
    );
    if (res.ok) toast.success("Upsell removed.");
    else toast.error("Couldn't remove upsell");
  }

  async function toggleVisibility(u: CourseOfferUpsell) {
    const next = u.visibility === "published" ? "draft" : "published";
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/course-offers/${offer.id}/upsells/${u.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      },
    );
    if (!res.ok) toast.error("Couldn't update visibility");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Upsell
        </Button>
      </div>

      {upsells.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <Info className="h-6 w-6 text-muted-foreground" />
          <p className="text-[13px] font-medium">No upsells found</p>
          <p className="max-w-xs text-[12px] text-muted-foreground">
            Create upsells to increase your revenue and offer additional
            products to your customers
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 font-medium">Offer</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Visibility</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {upsells.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2.5">
                    {targetTitle.get(u.targetOfferId) ?? "Untitled offer"}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.type === "oneClick" ? "One Click" : "In App"}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => toggleVisibility(u)}
                      className={
                        u.visibility === "published"
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                          : "rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                      }
                      title="Click to toggle"
                    >
                      {u.visibility}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => remove(u.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddUpsellModal
        subAccountId={subAccountId}
        offerId={offer.id}
        otherOffers={otherOffers}
        hasOneClick={hasOneClick}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {}}
      />
    </div>
  );
}
