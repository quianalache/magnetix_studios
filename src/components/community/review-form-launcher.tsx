"use client";

import { useState } from "react";
import { Dialog as ModalPrimitive } from "@base-ui/react/dialog";
import { Star, XIcon } from "lucide-react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CommunityReviewForm } from "@/components/community/review-form";
import { cn } from "@/lib/utils";
import type { CommunityReviewView } from "@/types/community";

/**
 * About-page conversion-layout redesign (2026-08-29) — the review form used
 * to render inline and full-width at the top of the reviews section,
 * dominating the page like an admin form. This wraps the exact same
 * `CommunityReviewForm` (unchanged write/delete logic, unchanged storage)
 * behind a small "Leave a review" / "Edit your review" trigger, matching the
 * `AboutEditButton` client-island pattern already used elsewhere on this
 * page. `CommunityReviewForm` itself still does its own
 * `window.location.reload()` on save/delete — left untouched — which closes
 * this modal implicitly by reloading the whole page with fresh data.
 */
export function ReviewFormLauncher({
  saId,
  groupId,
  brand,
  accent,
  currentReview,
}: {
  saId: string;
  groupId: string;
  brand: string;
  accent?: string;
  currentReview: CommunityReviewView | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Star className="h-3.5 w-3.5" />
        {currentReview ? "Edit your review" : "Leave a review"}
      </Button>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogPortal>
            <DialogOverlay />
            <ModalPrimitive.Popup
              data-slot="review-form-modal-content"
              className={cn(
                "fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] w-full flex-col gap-0 rounded-t-2xl border-t bg-white text-sm text-[#202124] shadow-lg outline-none transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0",
                "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:right-auto sm:w-full sm:max-w-md sm:max-h-[88vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
              )}
            >
              <DialogClose
                data-slot="dialog-close"
                render={<Button variant="ghost" className="absolute top-3 right-3 z-10" size="icon-sm" />}
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </DialogClose>
              {/* CommunityReviewForm already renders its own visible heading
                  ("Leave a review" / "Update your review"); this title only
                  satisfies the dialog's accessibility contract. */}
              <DialogTitle className="sr-only">
                {currentReview ? "Update your review" : "Leave a review"}
              </DialogTitle>
              <div className="flex-1 overflow-y-auto p-5">
                <CommunityReviewForm
                  saId={saId}
                  groupId={groupId}
                  brand={brand}
                  accent={accent}
                  currentReview={currentReview}
                />
              </div>
            </ModalPrimitive.Popup>
          </DialogPortal>
        </Dialog>
      )}
    </>
  );
}
