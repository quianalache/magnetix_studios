import Link from "next/link";
import { Lock, Star, Users } from "lucide-react";
import { JoinButton } from "@/app/c/[saId]/[groupSlug]/join-button";
import { CommunityReviewForm } from "@/components/community/review-form";
import { communityHomeHref } from "@/lib/community/routes";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import { cn } from "@/lib/utils";
import type {
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

function mediaUrl(group: CommunityGroup): string | null {
  return group.aboutMedia?.[0]?.url ?? group.coverUrl ?? null;
}

function isVideo(url: string | null | undefined): boolean {
  return !!url && /youtube|youtu\.be|vimeo|loom|descript/i.test(url);
}

function formatDate(ms: number | null): string {
  return ms ? new Date(ms).toLocaleDateString() : "";
}

function canUpgrade(membership: GroupMembership | null, tiers: CommunityTier[]) {
  if (!membership || membership.status !== "active") return null;
  const active = tiers.filter((tier) => tier.active);
  if (active.length === 0) return null;
  const currentIndex = active.findIndex((tier) => tier.id === membership.tierId);
  const next =
    currentIndex >= 0
      ? active[currentIndex + 1]
      : active.find((tier) => tier.priceCents != null || tier.checkoutUrl);
  return next ?? null;
}

export function CommunityAboutView({
  saId,
  pretty,
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
  group: CommunityGroup;
  brand: string;
  state: ViewerState;
  member: Member | null;
  membership: GroupMembership | null;
  tiers: CommunityTier[];
  reviews: CommunityReviewView[];
}) {
  const featuredUrl = mediaUrl(group);
  const gallery = group.aboutMedia?.length
    ? group.aboutMedia
    : group.coverUrl
      ? [
          {
            id: "cover",
            type: "image" as const,
            url: group.coverUrl,
            title: group.name,
            thumbnailUrl: null,
            provider: null,
            videoId: null,
            order: 0,
          },
        ]
      : [];
  const priceLabel =
    group.access === "paid"
      ? formatPrice(group.priceCents, group.currency)
      : "Free";
  const activeTiers = tiers.filter((tier) => tier.active);
  const upgradeTier = canUpgrade(membership, activeTiers);
  const currentReview =
    member && reviews.find((review) => review.memberId === member.id)
      ? reviews.find((review) => review.memberId === member.id)!
      : null;

  return (
    <div className="space-y-7">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-lg border border-[#E4E4E4] bg-white">
            {featuredUrl ? (
              isVideo(featuredUrl) ? (
                <div className="flex aspect-video items-center justify-center bg-[#202124] px-6 text-center text-sm font-medium text-white">
                  Video media configured: {gallery[0]?.title || featuredUrl}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featuredUrl}
                  alt={gallery[0]?.title || group.name}
                  className="aspect-video w-full object-cover"
                />
              )
            ) : (
              <div
                className="flex aspect-video items-center justify-center px-6 text-center text-2xl font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                {group.name}
              </div>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {gallery.slice(1, 8).map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-lg border border-[#E4E4E4] bg-white"
                >
                  {item.type === "video" ? (
                    <div className="flex aspect-video items-center justify-center bg-[#202124] px-2 text-center text-[11px] font-medium text-white">
                      Video
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl ?? item.url}
                      alt={item.title || ""}
                      className="aspect-video w-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#202124]">
              {group.name}
            </h1>
            {group.tagline?.trim() && (
              <p className="mt-2 text-base leading-relaxed text-[#3a3a44]">
                {group.tagline}
              </p>
            )}
          </div>

          {(group.aboutHtml || group.about) && (
            <div
              className="prose prose-sm max-w-none text-[#3a3a44] prose-a:font-medium prose-a:text-[#202124]"
              dangerouslySetInnerHTML={{
                __html: renderLessonBodyHtml(group.aboutHtml || group.about),
              }}
            />
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[#E4E4E4] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {group.logoUrl || group.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.logoUrl ?? group.coverUrl ?? ""}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg text-lg font-semibold text-white"
                  style={{ backgroundColor: brand }}
                >
                  {group.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[#202124]">
                  {group.name}
                </h2>
                <p className="text-xs text-[#909090]">
                  {group.joinPolicy === "approval" ? "Approval required" : "Open access"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-[#F8F7F5] py-2">
                <div className="text-base font-semibold text-[#202124]">
                  {group.memberCount}
                </div>
                <div className="text-[11px] uppercase text-[#909090]">Members</div>
              </div>
              <div className="rounded-md bg-[#F8F7F5] py-2">
                <div className="text-base font-semibold text-[#202124]">
                  {group.averageRating ? group.averageRating.toFixed(1) : "New"}
                </div>
                <div className="text-[11px] uppercase text-[#909090]">Rating</div>
              </div>
            </div>

            <div className="mt-4">
              {upgradeTier && state === "joined" ? (
                upgradeTier.checkoutUrl ? (
                  <a
                    href={upgradeTier.checkoutUrl}
                    className="inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: brand }}
                  >
                    Upgrade to {upgradeTier.name}
                  </a>
                ) : (
                  <div className="rounded-md border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2 text-sm text-[#3a3a44]">
                    Upgrade available: {upgradeTier.name}. Checkout is not connected yet.
                  </div>
                )
              ) : (
                <JoinButton
                  saId={saId}
                  pretty={pretty}
                  groupSlug={group.slug}
                  groupId={group.id}
                  state={state}
                  access={group.access}
                  priceLabel={priceLabel}
                  brandColor={brand}
                />
              )}
            </div>
          </div>

          {activeTiers.length > 0 && (
            <div className="rounded-lg border border-[#E4E4E4] bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-[#202124]">
                Membership options
              </h2>
              <div className="space-y-2">
                {activeTiers.map((tier) => {
                  const isCurrent = membership?.tierId === tier.id;
                  return (
                    <div
                      key={tier.id}
                      className={cn(
                        "rounded-md border p-3",
                        isCurrent ? "border-[#202124]" : "border-[#E4E4E4]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#202124]">
                          {tier.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] font-medium text-[#909090]">
                            Current
                          </span>
                        )}
                      </div>
                      {tier.description && (
                        <p className="mt-1 text-xs leading-relaxed text-[#686872]">
                          {tier.description}
                        </p>
                      )}
                      {tierPrice(tier) && (
                        <p className="mt-2 text-xs font-semibold text-[#202124]">
                          {tierPrice(tier)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#E4E4E4] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#202124]">
              Community info
            </h2>
            <div className="space-y-2 text-sm text-[#3a3a44]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#686872]">
                  <Users className="h-4 w-4" /> Members
                </span>
                <span>{group.memberCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#686872]">
                  <Lock className="h-4 w-4" /> Access
                </span>
                <span>{group.access === "paid" ? priceLabel : "Free"}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[#202124]">
              Reviews
            </h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-[#909090]">
              <Star className="h-4 w-4 fill-current" style={{ color: brand }} />
              {group.reviewCount > 0
                ? `${group.averageRating?.toFixed(1)} average from ${group.reviewCount} review${group.reviewCount === 1 ? "" : "s"}`
                : "No reviews yet"}
            </div>
          </div>
          {state === "joined" && (
            <Link
              href={communityHomeHref({ saId, pretty }, group.slug)}
              className="hidden text-sm font-medium text-[#686872] hover:text-[#202124] sm:block"
            >
              Enter community
            </Link>
          )}
        </div>

        {state === "joined" && (
          <CommunityReviewForm
            saId={saId}
            groupId={group.id}
            brand={brand}
            currentReview={currentReview}
          />
        )}

        {reviews.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#E4E4E4] bg-white p-8 text-center text-sm text-[#909090]">
            Reviews from members will appear here.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="rounded-lg border border-[#E4E4E4] bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  {review.reviewerAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={review.reviewerAvatarUrl}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: brand }}
                    >
                      {review.reviewerName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#202124]">
                        {review.reviewerName}
                      </h3>
                      <span className="text-xs text-[#909090]">
                        {formatDate(review.updatedAtMs ?? review.createdAtMs)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn("h-3.5 w-3.5", n <= review.rating && "fill-current")}
                          style={{ color: n <= review.rating ? brand : "#c7c7c7" }}
                        />
                      ))}
                    </div>
                    {review.body && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#3a3a44]">
                        {review.body}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
