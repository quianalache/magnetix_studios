"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { communityHomeHref } from "@/lib/community/routes";

/**
 * Community Home left nav (Part 2 / Part 7). Renders the group's real,
 * flat `categories` list as channel links via a `?c=` URL param that
 * `FeedView` reads — no separate "quick access" tier and no grouped/
 * gated sections (e.g. a locked "Premium Space"), because the data model
 * only supports one flat category list today (see Part 14.E). "New Post"
 * opens the existing composer already rendered by `FeedView` further down
 * the page — a plain DOM click rather than lifting composer state up,
 * since that's the smallest change that doesn't touch `FeedView`'s
 * internals. There is intentionally no "Community Chat" entry: no such
 * feature exists yet (see Part 14.A / Part 1) and adding a nav item for it
 * would be a dead link.
 */
export function CommunityLeftNav({
  saId,
  pretty = false,
  groupSlug,
  brand,
  categories,
}: {
  saId: string;
  pretty?: boolean;
  groupSlug: string;
  brand: string;
  categories: string[];
}) {
  const searchParams = useSearchParams();
  const active = searchParams.get("c") ?? "All";
  const base = communityHomeHref({ saId, pretty }, groupSlug);

  function openComposer() {
    const el = document.getElementById("community-composer-trigger");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.click();
  }

  return (
    <nav className="space-y-4">
      <button
        onClick={openComposer}
        className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: brand }}
      >
        <Plus className="h-4 w-4" /> New Post
      </button>

      <div className="space-y-0.5">
        <NavLink href={base} label="All Posts" isActive={active === "All"} brand={brand} />
        {categories.map((c) => (
          <NavLink
            key={c}
            href={`${base}?c=${encodeURIComponent(c)}`}
            label={c}
            isActive={active === c}
            brand={brand}
          />
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  isActive,
  brand,
}: {
  href: string;
  label: string;
  isActive: boolean;
  brand: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block truncate rounded-md px-3 py-1.5 text-sm font-medium",
        isActive ? "text-white" : "text-[#3a3a44] hover:bg-[#F0F0F0]",
      )}
      style={isActive ? { backgroundColor: brand } : undefined}
    >
      {label}
    </Link>
  );
}
