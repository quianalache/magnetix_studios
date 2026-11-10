"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PAGE_TYPE_ICONS } from "@/components/pages-funnels/home/page-type-icons";
import type { PageDoc } from "@/types/pages-funnels";

/**
 * A page card's preview: the automatic screenshot of the top of the real
 * page (16:10, cropped from the top so the header and hero are what show),
 * or a quiet Magnetix fallback with the page-type icon while there isn't
 * one yet, for Reading Result Pages, or when the image fails to load.
 */
export function PageThumbnail({ page, className }: { page: Pick<PageDoc, "name" | "pageType" | "thumbnail" | "puckPublishedData" | "puckDraftData">; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = page.thumbnail?.url;
  const Icon = PAGE_TYPE_ICONS[page.pageType] ?? PAGE_TYPE_ICONS.generic;

  if (url && !failed) {
    return (
      <div className={cn("relative aspect-[16/10] w-full overflow-hidden bg-muted", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tokenized Storage URL; no optimizer needed for a 640px thumbnail */}
        <img
          src={url}
          alt={`Preview of ${page.name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover object-top"
        />
      </div>
    );
  }

  const note =
    page.pageType === "reading_result"
      ? "Shows each person's Reading"
      : page.puckPublishedData || page.puckDraftData
        ? "Preview is being prepared"
        : "Preview appears once the page is saved";
  return (
    <div className={cn("flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 bg-tint-violet px-4 text-center", className)} data-thumbnail="fallback">
      <span className="flex size-10 items-center justify-center rounded-xl bg-card text-primary shadow-card">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="text-caption text-muted-foreground">{note}</span>
    </div>
  );
}
