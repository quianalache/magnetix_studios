import { Info, Link2 } from "lucide-react";
import { ReviewFormLauncher } from "@/components/community/review-form-launcher";
import type { CommunityGroup, CommunityReviewView, ResourceLink } from "@/types/community";

/**
 * Community Home right-rail "About this Community" card (Part 4). Real data
 * only: `memberCount`/`onlineCount`/`adminCount` are the exact same numbers
 * `community/page.tsx` already computed for the old `GroupRailCard` (same
 * 5-minute online window, same moderator-role admin count) — nothing here is
 * invented. Also folds in the group's existing `links` list (previously only
 * shown via `GroupRailCard`) so that functionality isn't lost by dropping
 * that component from Home.
 *
 * `saId`/`groupId`/`currentReview` (2026-08-30 About-page corrections,
 * Part B) — optional so every OTHER caller of this card is unaffected.
 * When passed, renders the existing `ReviewFormLauncher` (the exact same
 * modal + write logic the About page used) as a small action here instead.
 * Reachable only from pages already gated to an active member (both real
 * callers — member Home and the staff bridge — redirect/404 anyone without
 * one before this card ever renders), so no extra membership check is
 * needed here; a guest/pending prospect never reaches this card at all.
 */
export function AboutCommunityCard({
  group,
  brand,
  accent,
  memberCount,
  onlineCount,
  adminCount,
  saId,
  groupId,
  currentReview,
}: {
  group: CommunityGroup;
  brand: string;
  /** Theme parity (2026-08-29 closeout) — the resource links below are
   *  genuine links, matching the theme's "accent" role wherever the
   *  Branding preview colors a link/highlight. Optional, falls back to
   *  `brand` for any caller not yet updated. */
  accent?: string;
  memberCount: number;
  onlineCount: number;
  adminCount: number;
  saId?: string;
  groupId?: string;
  currentReview?: CommunityReviewView | null;
}) {
  const desc = group.tagline?.trim() || group.about;
  const links: ResourceLink[] = group.links ?? [];

  return (
    <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-[#202124]">About this Community</h2>
        <Info className="h-3.5 w-3.5 text-[#909090]" />
      </div>
      {desc && <p className="mt-2 text-sm text-[#3a3a44]">{desc}</p>}

      <div className="mt-4 grid grid-cols-3 divide-x divide-[#f0f0f0] border-y border-[#f0f0f0] py-2 text-center">
        <Stat n={memberCount} label="Members" />
        <Stat n={onlineCount} label="Online" />
        <Stat n={adminCount} label={adminCount === 1 ? "Admin" : "Admins"} />
      </div>

      {links.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm hover:underline"
              style={{ color: accent || brand }}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{l.label}</span>
            </a>
          ))}
        </div>
      )}

      {saId && groupId && (
        <div className="mt-3 border-t border-[#f0f0f0] pt-3">
          <ReviewFormLauncher
            saId={saId}
            groupId={groupId}
            brand={brand}
            accent={accent}
            currentReview={currentReview ?? null}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#202124]">{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-[#909090]">{label}</div>
    </div>
  );
}
