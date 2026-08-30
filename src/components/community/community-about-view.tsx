import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Check,
  ChevronRight,
  Pencil,
  Star,
  Users,
} from "lucide-react";
import { JoinButton } from "@/app/c/[saId]/[groupSlug]/join-button";
import { AboutMediaGallery } from "@/components/community/about-media-gallery";
import { communityAboutEditHref, communityHomeHref } from "@/lib/community/routes";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type {
  CommunityAboutMediaItem,
  CommunityGroup,
  CommunityReviewView,
  CommunityTier,
  GroupMembership,
} from "@/types/community";

type ViewerState = "guest" | "member" | "joined" | "pending";

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

function tierPrice(tier: CommunityTier): string {
  const price = formatPrice(tier.priceCents, tier.currency);
  if (!price) return "";
  if (tier.billingInterval === "month") return `${price}/mo`;
  if (tier.billingInterval === "year") return `${price}/yr`;
  return price;
}

function formatDate(ms: number | null): string {
  return ms ? new Date(ms).toLocaleDateString() : "";
}

function canUpgrade(membership: GroupMembership | null, tiers: CommunityTier[]) {
  if (!membership || membership.status !== "active") return false;
  const active = tiers.filter((tier) => tier.active);
  if (active.length === 0) return false;
  const currentIndex = active.findIndex((tier) => tier.id === membership.tierId);
  if (currentIndex >= 0) return currentIndex < active.length - 1;
  return active.some((tier) => tier.priceCents != null || tier.checkoutUrl);
}

/**
 * Whether a rich-text field actually has visible content. Saved About HTML
 * can be a non-empty but visually-blank string like `"<p></p>"` (an editor
 * that was opened and cleared, or never really filled in) — a plain
 * truthiness check on the string treats that as real content and renders
 * an empty gap under the "About this community" heading instead of the
 * clean "coming soon" fallback. Server-side safe (no DOM), same
 * strip-tags approach as `plainTextLength` in the About editor.
 */
function hasRealText(html: string): boolean {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim().length > 0;
}

function ratingLabel(group: CommunityGroup): string {
  if (!group.reviewCount || !group.averageRating) return "No reviews yet";
  return `${group.averageRating.toFixed(1)} average · ${group.reviewCount} review${
    group.reviewCount === 1 ? "" : "s"
  }`;
}

/**
 * Sales-card CTA subtext (2026-08-29 conversion-layout redesign). Replaces
 * the old standalone "Membership: Active member" status row — that was
 * VIEWER-personal status (redundant with the CTA itself, "Enter community"
 * vs "Join community"), and is gone entirely, never repeated here. This is
 * different: a COMMUNITY-level fact (its price + join policy), true
 * regardless of who's looking, which is why it still shows even to an
 * already-joined member — same as a storefront still listing "Free
 * shipping" on a product you already own. Derived only from real
 * `access`/`joinPolicy` fields, never invented copy.
 */
function joinSubtext(
  group: CommunityGroup,
  state: ViewerState,
  priceLabel: string,
): string | null {
  if (state === "pending") return "Pending approval — you'll be notified once approved.";
  const price = group.access === "paid" ? priceLabel : "Free";
  const access =
    group.joinPolicy === "approval" ? "Approval required" : "Anyone can join";
  return `${price} · ${access}`;
}

/**
 * About-page media gallery — About Media ONLY (2026-08-29 cleanup). This
 * used to synthesize a fake gallery item from `group.coverUrl` (the
 * Community Home banner) whenever no real About media was configured —
 * rendering a wide banner image forced into the gallery's tall
 * featured-card aspect ratio, cropped/smushed. Community Banner belongs to
 * Home/feed only; About Media is its own separate, purpose-built gallery.
 * No About media configured now correctly means no gallery at all (the
 * `.community-about-hero-no-media` clean layout below already existed for
 * exactly this case — it just could never actually be reached before).
 */
function galleryForGroup(group: CommunityGroup): CommunityAboutMediaItem[] {
  return group.aboutMedia?.length ? group.aboutMedia : [];
}

function CommunityAboutStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.community-about, .community-about * { box-sizing: border-box; }
.community-about {
  --ca-bg: var(--background, #f8f7f5);
  --ca-card: var(--card, #fff);
  --ca-text: var(--foreground, #202124);
  --ca-muted: var(--muted-foreground, #686872);
  --ca-border: var(--border, #e4e4e4);
  --ca-soft: var(--muted, #f8f7f5);
  --ca-primary-text: #fff;
  color: var(--ca-text);
}
.community-about a { color: inherit; }
.community-about-edit-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; max-width: 1120px; margin: 0 auto 18px; padding: 10px 14px; border-radius: 8px; background: var(--ca-soft); color: var(--ca-muted); font-size: 12.5px; }
.community-about-edit-link { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ca-border); border-radius: 7px; background: var(--ca-card); color: var(--ca-text); padding: 5px 10px; font-size: 12.5px; font-weight: 650; text-decoration: none; }
.community-about-layout { display: grid; gap: 38px; }

/* Conversion-layout redesign (2026-08-29): a persistent sales card in a
   sticky right column beside the long-scroll content, instead of the old
   "hero row" that only paired identity/conversion next to the media. */
.community-about-grid { display: grid; grid-template-columns: minmax(0, 1fr) 356px; gap: 32px; align-items: start; max-width: 1180px; width: 100%; margin: 0 auto; }
.community-about-content { min-width: 0; display: grid; gap: 40px; }
.community-about-sidebar { min-width: 0; position: sticky; top: 20px; }

/* Sales / join card — nudged back up slightly (328px -> 356px, 2026-08-30
   corrections, Part D) after the prior pass's reduction read as a touch
   too small against the main column; stays well short of the original
   oversized card and inside the approved ~350-370px target. Padding/gaps
   unchanged from that pass. */
.community-about-card { display: grid; gap: 14px; border: 1px solid var(--ca-border); border-radius: 14px; background: var(--ca-card); padding: 20px 18px; box-shadow: 0 10px 30px rgba(32,33,36,.06); }
/* Join Card Image — its own dedicated shape, deliberately NOT the wide
   Home-banner ratio. Kept at 16:9 (matches the media aspect used
   throughout the page); still reads as a compact photo at this card
   width, not a long banner strip. */
.community-about-card-image { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; border: 1px solid var(--ca-border); }
.community-about-card-identity { display: grid; justify-items: center; gap: 8px; text-align: center; }
.community-about-logo { width: 56px; height: 56px; flex: 0 0 auto; border-radius: 12px; object-fit: cover; background: var(--ca-primary); color: var(--ca-primary-text); display: grid; place-items: center; font-size: 20px; font-weight: 750; }
.community-about-card-name { margin: 2px 0 0; color: var(--ca-text); font-size: 21px; line-height: 1.2; font-weight: 760; }
.community-about-card-tagline { margin: 0; color: var(--ca-accent); font-size: 13.5px; font-weight: 700; }
.community-about-card-stats { display: flex; align-items: center; justify-content: center; gap: 22px; padding: 4px 0 2px; border-top: 1px solid color-mix(in srgb, var(--ca-border) 80%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--ca-border) 80%, transparent); }
.community-about-card-stat { display: grid; justify-items: center; gap: 3px; color: var(--ca-muted); }
.community-about-card-stat svg { width: 15px; height: 15px; color: var(--ca-muted); }
.community-about-card-stat strong { color: var(--ca-text); font-size: 13.5px; font-weight: 750; }
.community-about-card-stat span { font-size: 11px; }
.community-about-cta { display: grid; gap: 8px; }
.community-about-cta-subtext { margin: 0; text-align: center; color: var(--ca-muted); font-size: 12.5px; }
.community-about-button { min-height: 44px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; border: 1px solid var(--ca-border); background: var(--ca-card); color: var(--ca-text); font-size: 14px; font-weight: 760; text-decoration: none; }
.community-about-button-primary { border-color: var(--ca-primary-action); background: var(--ca-primary-action); color: var(--ca-primary-text); box-shadow: 0 10px 22px rgba(32,33,36,.16); }
.community-about-tier-list { border-top: 1px solid var(--ca-border); padding-top: 12px; display: grid; gap: 10px; }
.community-about-tier { border-left: 3px solid var(--ca-border); padding: 2px 0 2px 12px; }
.community-about-tier-current { border-color: var(--ca-primary); }
.community-about-tier-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.community-about-tier strong { color: var(--ca-text); font-size: 14px; }
.community-about-tier-price { color: var(--ca-muted); font-size: 12px; font-weight: 760; }
.community-about-tier p { margin: 6px 0 0; color: var(--ca-muted); font-size: 12px; line-height: 1.55; }
.community-about-current { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; color: var(--ca-primary); font-size: 12px; font-weight: 760; }
.community-about-powered { margin: 2px 0 0; color: var(--ca-muted); font-size: 11.5px; font-weight: 650; letter-spacing: .02em; text-align: center; }

/* Media gallery (2026-08-30 mockup pass) — one 16:9 featured viewer with a
   compact 16:9 thumbnail strip UNDERNEATH (not beside — Part 2 explicitly
   rules out a tall supporting-media column next to the featured item).
   Capped max-width so the block reads as meaningfully smaller than the
   prior full-width-of-column implementation (Part 3: ~15-25% less
   dominant) without shrinking the rest of the page. */
.community-about-media-block { display: grid; gap: 10px; max-width: 620px; }
.community-about-media-featured-wrap, .community-about-media-thumb-inner {
  position: relative; overflow: hidden; border: 1px solid var(--ca-border);
  background: var(--ca-text); display: block; width: 100%; aspect-ratio: 16 / 9;
}
.community-about-media-featured-wrap { border-radius: 10px; box-shadow: 0 10px 34px rgba(32,33,36,.08); }
.community-about-media-image { position: absolute; inset: 0; background-size: cover; background-position: center; }
.community-about-media-empty { background: linear-gradient(135deg, color-mix(in srgb, var(--ca-primary) 22%, var(--ca-card)), var(--ca-soft)); }
.community-about-media-empty .community-about-media-image { display: none; }
.community-about-play { position: absolute; z-index: 2; border-radius: 999px; display: grid; place-items: center; background: rgba(255,255,255,.94); color: #202124; top: 50%; left: 50%; transform: translate(-50%, -50%); }
.community-about-play-lg { width: 56px; height: 56px; }
.community-about-play-sm { width: 22px; height: 22px; }
.community-about-media-shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.7), rgba(0,0,0,.1) 55%, transparent); }
.community-about-media-copy { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px; color: #fff; z-index: 2; }
.community-about-media-copy p { margin: 0 0 4px; color: rgba(255,255,255,.78); font-size: 10.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.community-about-media-copy h3 { margin: 0; font-size: 20px; line-height: 1.2; font-weight: 750; letter-spacing: 0; }
/* Thumbnail strip — compact 16:9 tiles, no forced title text (Part 2/5),
   scrolls horizontally instead of growing the page (Part 5/7). */
.community-about-media-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scroll-snap-type: x proximity; }
.community-about-media-thumb { flex: 0 0 108px; padding: 0; border: none; background: none; cursor: pointer; scroll-snap-align: start; border-radius: 7px; }
.community-about-media-thumb-inner { border-radius: 7px; transition: opacity .15s ease, transform .15s ease; }
.community-about-media-thumb:hover .community-about-media-thumb-inner { opacity: .85; }

/* About content */
.community-about-copy-section { max-width: 780px; }
.community-about-copy-section h2 { margin: 0 0 14px; color: var(--ca-text); font-size: 24px; line-height: 1.2; }
.community-about-description { margin: 0; max-width: 700px; color: var(--ca-muted); font-size: 15.5px; line-height: 1.75; }
.community-about-rich { max-width: 760px; }
.community-about-rich :where(h1,h2,h3) { color: var(--ca-text); }
/* 2026-08-30: was var(--ca-muted), which resolves to the app's global
   --muted-foreground — under the Magnetix theme (and several other
   presets) that's a theme-tinted gray, not a true neutral, so the About
   body copy read as colored/theme-accented instead of normal readable
   page text. Product decision: About body text should always be plain
   dark neutral, matching the heading rule immediately above and every
   other real body-copy usage on this page — var(--ca-text) is that
   existing token (--foreground), not a new/hardcoded color. */
.community-about-rich :where(p,li) { color: var(--ca-text); line-height: 1.7; }

/* "What You'll Get Inside" — Part 8, real structured data, up to
   ABOUT_BENEFITS_MAX (4) cards. Absent/hidden entirely when there's
   nothing configured or the section is toggled off (Part 11) — no
   reserved empty space, same convention as the media gallery. */
.community-about-benefits h2 { margin: 0 0 14px; color: var(--ca-text); font-size: 24px; line-height: 1.2; }
.community-about-benefits-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-width: 780px; }
.community-about-benefit { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--ca-border); border-radius: 10px; background: var(--ca-card); padding: 16px; }
.community-about-benefit-icon { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 10px; background: var(--ca-soft); display: grid; place-items: center; font-size: 19px; }
.community-about-benefit h3 { margin: 0 0 3px; color: var(--ca-text); font-size: 14.5px; font-weight: 750; }
.community-about-benefit p { margin: 0; color: var(--ca-muted); font-size: 13px; line-height: 1.55; }

/* Reviews */
.community-about-reviews { display: grid; gap: 16px; }
.community-about-section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
.community-about-section-head h2 { margin: 0; color: var(--ca-text); font-size: 24px; line-height: 1.2; }
.community-about-review-summary { margin-top: 7px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ca-muted); font-size: 14px; font-weight: 650; }
.community-about-review-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
.community-about-review { border: 1px solid var(--ca-border); border-radius: 10px; background: var(--ca-card); padding: 16px; box-shadow: 0 1px 2px rgba(32,33,36,.04); }
.community-about-review-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.community-about-review-person { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.community-about-review-avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; background: var(--ca-primary); color: var(--ca-primary-text); display: grid; place-items: center; font-size: 13px; font-weight: 750; flex: 0 0 auto; }
.community-about-review h3 { margin: 0; color: var(--ca-text); font-size: 14px; display: flex; align-items: center; gap: 6px; }
.community-about-verified { display: inline-flex; align-items: center; gap: 3px; color: var(--ca-accent); font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
.community-about-review-date { margin: 2px 0 0; color: var(--ca-muted); font-size: 12px; }
.community-about-review-body { margin: 14px 0 0; white-space: pre-wrap; color: var(--ca-muted); font-size: 14px; line-height: 1.65; }
.community-about-stars { display: inline-flex; align-items: center; gap: 2px; color: var(--ca-accent); flex: 0 0 auto; }
.community-about-stars svg { width: 16px; height: 16px; fill: currentColor; }
.community-about-see-more { justify-self: start; cursor: pointer; }
.community-about-details { display: grid; gap: 12px; }
.community-about-details summary { list-style: none; }
.community-about-details summary::-webkit-details-marker { display: none; }

@media (max-width: 1080px) {
  .community-about-grid { grid-template-columns: 1fr; }
  .community-about-sidebar { position: static; order: -1; max-width: 460px; }
}
@media (max-width: 840px) {
  .community-about-layout { gap: 18px; }
  .community-about-content { gap: 26px; }
  .community-about-media-block { max-width: 100%; }
  .community-about-benefits-grid { grid-template-columns: 1fr; }
  .community-about-review-grid { grid-template-columns: 1fr; }
  .community-about-section-head { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 520px) {
  .community-about-sidebar { max-width: 100%; }
  .community-about-card { padding: 20px 16px; }
  .community-about-card-stats { gap: 16px; }
  .community-about-media-thumb { flex-basis: 92px; }
}
        `,
      }}
    />
  );
}

function RatingStars({ rating, muted = false }: { rating: number; muted?: boolean }) {
  return (
    <span className="community-about-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} style={{ opacity: star <= rating && !muted ? 1 : 0.28 }} />
      ))}
    </span>
  );
}

function SummaryAction({
  saId,
  pretty,
  staffGroupId,
  group,
  state,
  priceLabel,
  canShowUpgrade,
}: {
  saId: string;
  pretty: boolean;
  /** Staff Community-in-CRM integration — see CommunityLinkBase in routes.ts. */
  staffGroupId?: string;
  group: CommunityGroup;
  state: ViewerState;
  priceLabel: string;
  canShowUpgrade: boolean;
}) {
  if (state === "joined" && canShowUpgrade) {
    return (
      <a
        href="#membership-options"
        className="community-about-button community-about-button-primary"
      >
        Upgrade
        <ChevronRight size={16} />
      </a>
    );
  }

  if (state === "joined") {
    return (
      <Link
        href={communityHomeHref({ saId, pretty, staffGroupId }, group.slug)}
        className="community-about-button community-about-button-primary"
      >
        Enter community
        <ChevronRight size={16} />
      </Link>
    );
  }

  return (
    <JoinButton
      saId={saId}
      pretty={pretty}
      groupSlug={group.slug}
      groupId={group.id}
      state={state}
      access={group.access}
      priceLabel={priceLabel}
      brandColor={resolveCommunityTheme(group).primaryAction}
    />
  );
}

export function CommunityAboutView({
  saId,
  pretty,
  staffGroupId,
  group,
  brand,
  state,
  membership,
  tiers,
  reviews,
}: {
  saId: string;
  pretty: boolean;
  /** Staff Community-in-CRM integration — see CommunityLinkBase in routes.ts. */
  staffGroupId?: string;
  group: CommunityGroup;
  brand: string;
  state: ViewerState;
  membership: GroupMembership | null;
  tiers: CommunityTier[];
  /** Only used to decide whether the Reviews section renders at all
   *  (2026-08-30 corrections, Part A) — writing a review moved to the
   *  member-only "About this Community" Home card (Part B), so this
   *  component no longer needs the viewer's own `member` identity. */
  reviews: CommunityReviewView[];
}) {
  const gallery = galleryForGroup(group);
  // "What You'll Get Inside" (Part 8/11) — hidden entirely, not a reserved
  // empty section, when there's nothing configured OR the admin toggled it
  // off. `showAboutBenefits` absent/undefined = shown (backward-compatible
  // default, same convention as `showBanner`), but real content is always
  // required too — this flag alone can never produce an empty section.
  const benefits =
    group.showAboutBenefits === false ? [] : (group.aboutBenefits ?? []);
  const activeTiers = tiers.filter((tier) => tier.active);
  const upgradeEligible = canUpgrade(membership, activeTiers);
  const priceLabel =
    group.access === "paid"
      ? formatPrice(group.priceCents, group.currency)
      : "Free";
  const ctaSubtext = joinSubtext(group, state, priceLabel);
  const visibleReviews = reviews.slice(0, 6);
  const remainingReviews = reviews.slice(6);
  // About-page cleanup (2026-08-29) — no fallback chain into `cardImageUrl`
  // or `coverUrl` here anymore: `cardImageUrl` now has its own dedicated
  // slot (the About/Join card's own image, below), and `coverUrl` is the
  // Community Home banner, which never belongs on the About page. No logo
  // set correctly falls straight to the existing plain-letter avatar.
  const logoUrl = group.logoUrl;
  // Theme parity (2026-08-29 closeout) — `brand` (== primary) stays the
  // caller-supplied value everywhere it was already used (identity marks:
  // logo, review avatars, current-tier indicator); primaryAction/accent are
  // resolved here from the same shared source so the CTA button and the
  // pill/stars roles split out from primary, matching the Branding preview.
  const theme = resolveCommunityTheme(group);
  // About-tab cleanup (2026-08-29) — "Edit About" only for an active
  // moderator (never a guest/pending prospect, who take an entirely
  // different, unauthenticated render branch upstream — see the two real
  // About page.tsx callers). Members with no edit rights see the exact
  // same saved content, no editing controls.
  const isModerator = state === "joined" && membership?.role === "moderator";

  return (
    <div
      className="community-about"
      style={
        {
          "--ca-primary": brand,
          "--ca-primary-action": theme.primaryAction,
          "--ca-accent": theme.accent,
        } as CSSProperties
      }
    >
      <CommunityAboutStyles />
      {isModerator && (
        <div className="community-about-edit-bar">
          <span>You&apos;re viewing the live About page.</span>
          {/* Edit About (2026-08-30 mockup pass) — a real page now, not a
              modal, per the approved single-page mockup's own header/back
              chrome. See communityAboutEditHref/AboutEditPage. */}
          <Link
            href={communityAboutEditHref({ saId, pretty, staffGroupId }, group.slug)}
            className="community-about-edit-link"
          >
            <Pencil size={13} /> Edit About
          </Link>
        </div>
      )}
      <div className="community-about-layout">
        <div className="community-about-grid">
          <div className="community-about-content">
            {gallery.length > 0 && <AboutMediaGallery items={gallery} />}

            <section className="community-about-copy-section">
              <h2>About this community</h2>
              {hasRealText(group.aboutHtml) || hasRealText(group.about) ? (
                <div
                  className="community-about-rich prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: renderLessonBodyHtml(group.aboutHtml || group.about),
                  }}
                />
              ) : (
                <p className="community-about-description">
                  More details about this community are coming soon.
                </p>
              )}
            </section>

            {benefits.length > 0 && (
              <section className="community-about-benefits">
                <h2>What You&apos;ll Get Inside</h2>
                <div className="community-about-benefits-grid">
                  {benefits.map((benefit) => (
                    <div key={benefit.id} className="community-about-benefit">
                      <span className="community-about-benefit-icon">{benefit.icon}</span>
                      <div>
                        <h3>{benefit.title}</h3>
                        {benefit.description && <p>{benefit.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Zero-review state (2026-08-30 corrections, Part A): the
                entire section — heading, empty stars, "No reviews yet",
                the empty-state box — is absent, not just quietly empty.
                A sales page with a visible "no social proof yet" block
                works against itself; the section appears automatically,
                unmodified below, the moment a first real review exists. */}
            {reviews.length > 0 && (
              <section className="community-about-reviews">
                <div className="community-about-section-head">
                  <div>
                    <h2>Member Reviews</h2>
                    <div className="community-about-review-summary">
                      <RatingStars rating={Math.round(group.averageRating ?? 0)} />
                      <span>{ratingLabel(group)}</span>
                    </div>
                  </div>
                </div>

                <div className="community-about-review-grid">
                  {visibleReviews.map((review) => (
                    <ReviewCard key={review.id} review={review} brand={brand} />
                  ))}
                </div>
                {remainingReviews.length > 0 && (
                  <details className="community-about-details">
                    <summary className="community-about-button community-about-see-more">
                      See all reviews
                    </summary>
                    <div className="community-about-review-grid">
                      {remainingReviews.map((review) => (
                        <ReviewCard key={review.id} review={review} brand={brand} />
                      ))}
                    </div>
                  </details>
                )}
              </section>
            )}
          </div>

          <aside className="community-about-sidebar">
            <div className="community-about-card">
              {group.cardImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.cardImageUrl}
                  alt=""
                  className="community-about-card-image"
                />
              )}

              <div className="community-about-card-identity">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="community-about-logo" />
                ) : (
                  <div className="community-about-logo">{group.name.charAt(0)}</div>
                )}
                <h1 className="community-about-card-name">{group.name}</h1>
                {group.tagline?.trim() && (
                  <p className="community-about-card-tagline">{group.tagline}</p>
                )}
                {group.reviewCount > 0 && (
                  <div className="community-about-review-summary">
                    <RatingStars rating={Math.round(group.averageRating ?? 0)} />
                    <span>{ratingLabel(group)}</span>
                  </div>
                )}
              </div>

              {/* "Open access" stat removed (2026-08-30 corrections, Part
                  C) — redundant with the real access/price line under the
                  CTA below ("Free · Anyone can join" or the paid
                  equivalent). Members count is real, useful social proof
                  on its own; access logic itself is unchanged. */}
              <div className="community-about-card-stats">
                <div className="community-about-card-stat">
                  <Users />
                  <strong>{group.memberCount}</strong>
                  <span>Members</span>
                </div>
              </div>

              <div id="membership-options" className="community-about-cta">
                <SummaryAction
                  saId={saId}
                  pretty={pretty}
                  staffGroupId={staffGroupId}
                  group={group}
                  state={state}
                  priceLabel={priceLabel}
                  canShowUpgrade={upgradeEligible}
                />
                {ctaSubtext && (
                  <p className="community-about-cta-subtext">{ctaSubtext}</p>
                )}
              </div>

              {activeTiers.length > 0 && (
                <div className="community-about-tier-list">
                  {activeTiers.map((tier) => {
                    const isCurrent = membership?.tierId === tier.id;
                    return (
                      <div
                        key={tier.id}
                        className={`community-about-tier ${
                          isCurrent ? "community-about-tier-current" : ""
                        }`}
                      >
                        <div className="community-about-tier-top">
                          <strong>{tier.name}</strong>
                          {tierPrice(tier) && (
                            <span className="community-about-tier-price">
                              {tierPrice(tier)}
                            </span>
                          )}
                        </div>
                        {tier.description && <p>{tier.description}</p>}
                        {isCurrent && (
                          <span className="community-about-current">
                            <Check size={14} />
                            Current tier
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="community-about-powered">Powered by Magnetix Studios</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  brand,
}: {
  review: CommunityReviewView;
  brand: string;
}) {
  return (
    <article className="community-about-review">
      <div className="community-about-review-top">
        <div className="community-about-review-person">
          {review.reviewerAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={review.reviewerAvatarUrl}
              alt=""
              className="community-about-review-avatar"
            />
          ) : (
            <div
              className="community-about-review-avatar"
              style={{ backgroundColor: brand }}
            >
              {review.reviewerName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3>
              {review.reviewerName}
              {/* Server-enforced invariant, not a display guess — see
                  upsertCommunityReviewServerSide: only an active member of
                  THIS group can ever write a review here. */}
              <span className="community-about-verified">
                <Check size={11} /> Verified member
              </span>
            </h3>
            <p className="community-about-review-date">
              {formatDate(review.updatedAtMs ?? review.createdAtMs)}
            </p>
          </div>
        </div>
        <RatingStars rating={review.rating} />
      </div>
      {review.body && <p className="community-about-review-body">{review.body}</p>}
    </article>
  );
}
