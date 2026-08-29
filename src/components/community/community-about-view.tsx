import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Check,
  ChevronRight,
  Play,
  Star,
} from "lucide-react";
import { JoinButton } from "@/app/c/[saId]/[groupSlug]/join-button";
import { CommunityReviewForm } from "@/components/community/review-form";
import { communityHomeHref } from "@/lib/community/routes";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type {
  CommunityAboutMediaItem,
  CommunityGroup,
  CommunityReviewView,
  CommunityTier,
  GroupMembership,
  Member,
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

function isVideo(url: string | null | undefined): boolean {
  return !!url && /youtube|youtu\.be|vimeo|loom|descript/i.test(url);
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

function ratingLabel(group: CommunityGroup): string {
  if (!group.reviewCount || !group.averageRating) return "No reviews yet";
  return `${group.averageRating.toFixed(1)} average · ${group.reviewCount} review${
    group.reviewCount === 1 ? "" : "s"
  }`;
}

function galleryForGroup(group: CommunityGroup): CommunityAboutMediaItem[] {
  if (group.aboutMedia?.length) return group.aboutMedia;
  if (!group.coverUrl) return [];
  return [
    {
      id: "cover",
      type: isVideo(group.coverUrl) ? "video" : "image",
      url: group.coverUrl,
      label: "",
      title: group.name,
      linkUrl: null,
      featured: true,
      thumbnailUrl: null,
      provider: null,
      videoId: null,
      order: 0,
    },
  ];
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
.community-about-layout { display: grid; gap: 38px; }
.community-about-main { min-width: 0; display: grid; gap: 42px; max-width: 1120px; width: 100%; margin: 0 auto; }
.community-about-hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); grid-template-areas: "media identity" "media conversion"; gap: 22px 28px; align-items: start; }
.community-about-hero-no-media { grid-template-columns: minmax(0, 680px); grid-template-areas: "identity" "conversion"; }
.community-about-identity { grid-area: identity; min-width: 0; padding-top: 4px; }
.community-about-conversion { grid-area: conversion; min-width: 0; display: grid; gap: 18px; }
.community-about-heading { min-width: 0; display: flex; gap: 14px; align-items: flex-start; }
.community-about-gallery { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, .9fr); gap: 12px; }
.community-about-hero > .community-about-gallery { grid-area: media; }
.community-about-supporting { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.community-about-media { position: relative; min-height: 156px; overflow: hidden; border: 1px solid var(--ca-border); border-radius: 8px; background: var(--ca-text); box-shadow: 0 10px 34px rgba(32,33,36,.08); }
.community-about-media-featured { min-height: 460px; }
.community-about-media-image { position: absolute; inset: 0; background-size: cover; background-position: center; transition: transform .45s ease; }
.community-about-media:hover .community-about-media-image { transform: scale(1.03); }
.community-about-media-shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.16), rgba(0,0,0,.06)); }
.community-about-media-empty { background: linear-gradient(135deg, color-mix(in srgb, var(--ca-primary) 22%, var(--ca-card)), var(--ca-soft)); }
.community-about-media-empty .community-about-media-image { display: none; }
.community-about-play { position: absolute; top: 12px; left: 12px; width: 36px; height: 36px; border-radius: 999px; display: grid; place-items: center; background: rgba(255,255,255,.94); color: #202124; z-index: 2; }
.community-about-media-copy { position: absolute; left: 0; right: 0; bottom: 0; padding: 16px; color: #fff; z-index: 2; }
.community-about-media-copy p { margin: 0 0 4px; color: rgba(255,255,255,.78); font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.community-about-media-copy h3 { margin: 0; font-size: 16px; line-height: 1.2; font-weight: 750; letter-spacing: 0; }
.community-about-media-featured .community-about-media-copy h3 { font-size: 28px; }
.community-about-copy-section { max-width: 820px; }
.community-about-copy { max-width: 780px; }
.community-about-pill { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; background: color-mix(in srgb, var(--ca-accent) 12%, var(--ca-card)); color: var(--ca-accent); padding: 6px 12px; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.community-about-title { margin: 8px 0 0; color: var(--ca-text); font-size: clamp(32px, 5vw, 52px); line-height: 1.04; font-weight: 760; letter-spacing: 0; max-width: 820px; }
.community-about-description { margin: 16px 0 0; max-width: 700px; color: var(--ca-muted); font-size: 16px; line-height: 1.75; }
.community-about-rich { max-width: 760px; }
.community-about-rich :where(h1,h2,h3) { color: var(--ca-text); }
.community-about-rich :where(p,li) { color: var(--ca-muted); line-height: 1.7; }
.community-about-logo { width: 48px; height: 48px; flex: 0 0 auto; border-radius: 8px; object-fit: cover; background: var(--ca-primary); color: var(--ca-primary-text); display: grid; place-items: center; font-size: 18px; font-weight: 750; }
.community-about-meta { display: grid; gap: 10px; padding: 4px 0; }
.community-about-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid color-mix(in srgb, var(--ca-border) 72%, transparent); padding: 10px 0; color: var(--ca-text); font-size: 14px; font-weight: 700; }
.community-about-meta-row span { color: var(--ca-muted); font-weight: 560; }
.community-about-action { display: grid; gap: 10px; }
.community-about-copy h2, .community-about-reviews h2 { margin: 0; color: var(--ca-text); font-size: 26px; line-height: 1.2; }
.community-about-powered { margin: 2px 0 0; color: var(--ca-muted); font-size: 12px; font-weight: 650; letter-spacing: .02em; text-align: center; }
.community-about-cta { display: grid; gap: 9px; }
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
.community-about-reviews { display: grid; gap: 16px; }
.community-about-section-head { display: flex; justify-content: space-between; align-items: end; gap: 14px; }
.community-about-section-head h2 { margin: 0; color: var(--ca-text); font-size: 26px; line-height: 1.2; }
.community-about-review-summary { margin-top: 7px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ca-muted); font-size: 14px; font-weight: 650; }
.community-about-review-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
.community-about-review { border: 1px solid var(--ca-border); border-radius: 8px; background: var(--ca-card); padding: 16px; box-shadow: 0 1px 2px rgba(32,33,36,.04); }
.community-about-review-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.community-about-review-person { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.community-about-review-avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; background: var(--ca-primary); color: var(--ca-primary-text); display: grid; place-items: center; font-size: 13px; font-weight: 750; flex: 0 0 auto; }
.community-about-review h3 { margin: 0; color: var(--ca-text); font-size: 14px; }
.community-about-review-date { margin: 2px 0 0; color: var(--ca-muted); font-size: 12px; }
.community-about-review-body { margin: 14px 0 0; white-space: pre-wrap; color: var(--ca-muted); font-size: 14px; line-height: 1.65; }
.community-about-stars { display: inline-flex; align-items: center; gap: 2px; color: var(--ca-accent); flex: 0 0 auto; }
.community-about-stars svg { width: 16px; height: 16px; fill: currentColor; }
.community-about-see-more { justify-self: start; cursor: pointer; }
.community-about-details { display: grid; gap: 12px; }
.community-about-details summary { list-style: none; }
.community-about-details summary::-webkit-details-marker { display: none; }
.community-about-empty { border-top: 1px solid var(--ca-border); padding: 18px 0 0; color: var(--ca-muted); font-size: 14px; }
@media (max-width: 1080px) {
  .community-about-hero { grid-template-columns: 1fr; grid-template-areas: "identity" "media" "conversion"; }
  .community-about-hero-no-media { grid-template-areas: "identity" "conversion"; }
}
@media (max-width: 840px) {
  .community-about-layout { gap: 18px; }
  .community-about-main { gap: 18px; }
  .community-about-gallery { grid-template-columns: 1fr; }
  .community-about-supporting { display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); overflow-x: auto; padding-bottom: 4px; scroll-snap-type: x proximity; }
  .community-about-supporting .community-about-media { min-height: 180px; scroll-snap-align: start; }
  .community-about-media-featured { min-height: 340px; }
  .community-about-meta-row { align-items: flex-start; }
  .community-about-review-grid { grid-template-columns: 1fr; }
  .community-about-section-head { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 520px) {
  .community-about-supporting { grid-template-columns: repeat(4, minmax(72vw, 1fr)); }
  .community-about-media-featured { min-height: 300px; }
  .community-about-title { font-size: 31px; }
  .community-about-heading { gap: 10px; }
  .community-about-logo { width: 42px; height: 42px; }
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

function MediaCard({
  item,
  featured = false,
  fallbackTitle,
}: {
  item: CommunityAboutMediaItem;
  featured?: boolean;
  fallbackTitle: string;
}) {
  const title = item.title?.trim() || fallbackTitle;
  const label = item.label?.trim();
  const mediaImage =
    item.type === "image" ? item.url : item.thumbnailUrl || null;
  const isEmpty = !mediaImage;
  const card = (
    <article
      className={`community-about-media ${
        featured ? "community-about-media-featured" : ""
      } ${isEmpty ? "community-about-media-empty" : ""}`}
    >
      {mediaImage && (
        <div
          className="community-about-media-image"
          style={{ backgroundImage: `url(${mediaImage})` }}
        />
      )}
      <div className="community-about-media-shade" />
      {item.type === "video" && (
        <div className="community-about-play">
          <Play size={16} fill="currentColor" />
        </div>
      )}
      <div className="community-about-media-copy">
        {label && <p>{label}</p>}
        <h3>{title}</h3>
      </div>
    </article>
  );

  return item.linkUrl ? (
    <a href={item.linkUrl} target="_blank" rel="noreferrer">
      {card}
    </a>
  ) : (
    card
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
  member,
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
  member: Member | null;
  membership: GroupMembership | null;
  tiers: CommunityTier[];
  reviews: CommunityReviewView[];
}) {
  const gallery = galleryForGroup(group);
  const featured = gallery.find((item) => item.featured) ?? gallery[0] ?? null;
  const supporting = featured
    ? gallery.filter((item) => item.id !== featured.id).slice(0, 4)
    : [];
  const activeTiers = tiers.filter((tier) => tier.active);
  const upgradeEligible = canUpgrade(membership, activeTiers);
  const currentTier = activeTiers.find((tier) => tier.id === membership?.tierId);
  const priceLabel =
    group.access === "paid"
      ? formatPrice(group.priceCents, group.currency)
      : "Free";
  const accessLabel =
    group.joinPolicy === "approval" ? "Approval required" : "Open access";
  const membershipLabel =
    state === "joined"
      ? currentTier?.name
        ? `Active member · ${currentTier.name}`
        : "Active member"
      : state === "pending"
        ? "Pending approval"
        : group.access === "paid"
          ? priceLabel
          : "Free to join";
  const currentReview =
    member && reviews.find((review) => review.memberId === member.id)
      ? reviews.find((review) => review.memberId === member.id)!
      : null;
  const visibleReviews = reviews.slice(0, 6);
  const remainingReviews = reviews.slice(6);
  const logoUrl = group.logoUrl ?? group.cardImageUrl ?? group.coverUrl;
  // Theme parity (2026-08-29 closeout) — `brand` (== primary) stays the
  // caller-supplied value everywhere it was already used (identity marks:
  // logo, review avatars, current-tier indicator); primaryAction/accent are
  // resolved here from the same shared source so the CTA button and the
  // pill/stars roles split out from primary, matching the Branding preview.
  const theme = resolveCommunityTheme(group);

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
      <div className="community-about-layout">
        <div className="community-about-main">
          <section
            className={`community-about-hero ${
              featured ? "" : "community-about-hero-no-media"
            }`}
          >
            {featured && (
              <div className="community-about-gallery" aria-label="Community media">
                <MediaCard item={featured} featured fallbackTitle={group.name} />
                {supporting.length > 0 && (
                  <div className="community-about-supporting">
                    {supporting.map((item) => (
                      <MediaCard key={item.id} item={item} fallbackTitle="Community media" />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="community-about-identity">
              <div className="community-about-heading">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="community-about-logo" />
                ) : (
                  <div className="community-about-logo">{group.name.charAt(0)}</div>
                )}
                <div className="community-about-copy">
                  {group.tagline?.trim() && (
                    <p className="community-about-pill">{group.tagline}</p>
                  )}
                  <h1 className="community-about-title">{group.name}</h1>
                  {group.reviewCount > 0 && (
                    <div className="community-about-review-summary">
                      <RatingStars rating={Math.round(group.averageRating ?? 0)} />
                      <span>{ratingLabel(group)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="community-about-conversion">
              <div className="community-about-meta">
                <div className="community-about-meta-row">
                  <span>Access</span>
                  {accessLabel}
                </div>
                <div className="community-about-meta-row">
                  <span>Members</span>
                  {group.memberCount}
                </div>
                <div className="community-about-meta-row">
                  <span>Membership</span>
                  {membershipLabel}
                </div>
              </div>

              <div id="membership-options" className="community-about-action">
                <div className="community-about-cta">
                  <SummaryAction
                    saId={saId}
                    pretty={pretty}
                    staffGroupId={staffGroupId}
                    group={group}
                    state={state}
                    priceLabel={priceLabel}
                    canShowUpgrade={upgradeEligible}
                  />
                </div>
                <p className="community-about-powered">
                  Powered by Magnetix Studios
                </p>
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
            </div>
          </section>

          <section className="community-about-copy-section">
            <div className="community-about-copy">
              <h2>About this community</h2>
            </div>
            {(group.aboutHtml || group.about) && (
              <div
                className="community-about-rich prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: renderLessonBodyHtml(group.aboutHtml || group.about),
                }}
              />
            )}
            {!group.aboutHtml && !group.about && (
              <p className="community-about-description">
                More details about this community are coming soon.
              </p>
            )}
          </section>

          <section className="community-about-reviews">
            <div className="community-about-section-head">
              <div>
                <h2>Member Reviews</h2>
                <div className="community-about-review-summary">
                  {group.reviewCount > 0 ? (
                    <>
                      <RatingStars rating={Math.round(group.averageRating ?? 0)} />
                      <span>{ratingLabel(group)}</span>
                    </>
                  ) : (
                    <>
                      <RatingStars rating={0} muted />
                      <span>No reviews yet</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {state === "joined" && (
              <CommunityReviewForm
                saId={saId}
                groupId={group.id}
                brand={brand}
                accent={theme.accent}
                currentReview={currentReview}
              />
            )}

            {reviews.length === 0 ? (
              <div className="community-about-empty">
                Reviews from members will appear here.
              </div>
            ) : (
              <>
                <div className="community-about-review-grid">
                  {visibleReviews.map((review) => (
                    <ReviewCard key={review.id} review={review} brand={brand} />
                  ))}
                </div>
                {remainingReviews.length > 0 && (
                  <details className="community-about-details">
                    <summary className="community-about-button community-about-see-more">
                      See more reviews
                    </summary>
                    <div className="community-about-review-grid">
                      {remainingReviews.map((review) => (
                        <ReviewCard key={review.id} review={review} brand={brand} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </section>
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
            <h3>{review.reviewerName}</h3>
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
