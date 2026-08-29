import type { CommunitySidebarCard } from "@/types/community";

/**
 * Renders one owner-configurable Home sidebar card (Part 6). Deliberately a
 * small, self-contained renderer — NOT the Course system's `CourseBlockView`/
 * `BlockForm` machinery. It reuses that system's *visual* button convention
 * (solid color button, image + heading + body above it) so it reads as the
 * same design language, without importing Course's block-type union, region
 * allowlists, or editor atoms. See the 2026-08-17 content-block investigation
 * report for why: this is a fixed image+text+button shape, not a general
 * block system, so pulling in the full shared machinery would be over-scope
 * for a 2-card-max feature. A true shared block core remains a future,
 * separately-scoped migration (Recommendation E in that report).
 */
export function SidebarContentCard({
  card,
  brand,
  primaryAction,
}: {
  card: CommunitySidebarCard;
  brand: string;
  /** Theme parity (2026-08-29 closeout): the card's button renders a CTA,
   *  so its un-customized fallback color should be the theme's primary-
   *  action role, not the bare identity color — matches every other real
   *  CTA button in Community. Optional, falls back to `brand` so a caller
   *  that hasn't been updated yet keeps its exact prior behavior. */
  primaryAction?: string;
}) {
  const color = card.accentColor?.trim() || primaryAction || brand;
  const hasButton = card.buttonLabel.trim() && card.buttonUrl.trim();

  return (
    <div className="overflow-hidden rounded-xl border border-[#E4E4E4] bg-white">
      {card.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" className="aspect-video w-full object-cover" />
      )}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-[#202124]">{card.heading}</h3>
        {card.body && <p className="mt-1 text-xs text-[#3a3a44]">{card.body}</p>}
        {hasButton && (
          <a
            href={card.buttonUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center rounded-md px-3 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {card.buttonLabel}
          </a>
        )}
      </div>
    </div>
  );
}
