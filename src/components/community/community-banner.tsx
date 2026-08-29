import type { CommunityGroup } from "@/types/community";

/**
 * Community Home hero banner. Purely presentational — the uploaded cover
 * image only, with no text or gradient overlay (Parts 1–2, 2026-08-29): the
 * community name already lives in the top nav/header (`CommunityShell`) and
 * the tagline already lives in `AboutCommunityCard`'s About sidebar, so
 * repeating either as large white text on top of the banner was pure
 * duplication — and actively destructive for branded artwork that already
 * contains its own text or design. The dark gradient existed only to keep
 * that now-removed title legible; with the title gone, so is its reason to
 * exist. The banner now shows the uploaded artwork as faithfully as
 * possible: no dimming, no tint.
 *
 * Renders nothing when there's no cover image — not even the old
 * brand-color placeholder box, which only ever existed as a backdrop for
 * the text this component no longer renders. Callers gate the OFF case of
 * the separate "Show Community Banner" setting (`group.showBanner`)
 * themselves before rendering this at all (see the two Community Home
 * pages and the Settings → General live preview) — this component only
 * ever decides "is there actually an image to show."
 */
export function CommunityBanner({ group }: { group: CommunityGroup }) {
  const image = group.coverUrl;
  if (!image) return null;

  return (
    <div
      className="min-h-40 w-full overflow-hidden rounded-xl border border-[#E4E4E4] sm:min-h-48"
      style={{ backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }}
    />
  );
}
