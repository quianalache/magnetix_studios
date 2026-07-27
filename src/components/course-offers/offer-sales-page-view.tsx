import type { CSSProperties } from "react";
import {
  CourseBlockView,
  type CrossSellTargetInfo,
} from "@/components/standalone-courses/theme-blocks";
import { isCoreSidebarBlock } from "@/types/course-theme";
import { EnrollOfferModal } from "@/app/offer/[saId]/[offerId]/enroll-modal";
import type { CourseTheme } from "@/types/course-theme";
import type { CourseOffer } from "@/types/course-offers";
import type { Member } from "@/types/community";

export interface OfferIncludedCourse {
  id: string;
  title: string;
  coverUrl: string | null;
}

/**
 * The entire visual body of a Course Offer's public checkout page — forked
 * from `CourseSalesPageView` (Standalone Courses) so Offers get the same
 * rich theme system (colors/fonts/header/hero/body/sidebar blocks, live
 * preview, templates) instead of the old bare-bones offer page. Differences
 * from the course version: no curriculum outline (an Offer isn't one
 * course's lessons — it's a bundle, shown as an included-products list
 * instead); no Progress/Instructor core sidebar blocks (see
 * `DEFAULT_OFFER_THEME`'s doc comment — those are course-lesson/course-
 * instructor concepts that don't map onto a multi-course bundle); checkout
 * uses `EnrollOfferModal` (the Offer's own signup+Stripe flow) instead of
 * the course `EnrollModal`.
 */
export function OfferSalesPageView({
  saId,
  offerId,
  offer,
  theme,
  priceLabel,
  descriptionHtml,
  includedCourses,
  member,
  alreadyPurchased,
  firstCourseId,
  crossSellTargets,
  interactive,
}: {
  saId: string;
  offerId: string;
  offer: CourseOffer;
  theme: CourseTheme;
  priceLabel: string;
  descriptionHtml: string;
  includedCourses: OfferIncludedCourse[];
  member: Member | null;
  alreadyPurchased: boolean;
  firstCourseId: string | null;
  crossSellTargets: ReadonlyMap<string, CrossSellTargetInfo>;
  interactive: boolean;
}) {
  const bodyBlocks = [...theme.body].sort((a, b) => a.order - b.order);
  const sidebarBlocks = [...theme.sidebar]
    .filter((b) => !isCoreSidebarBlock(b))
    .sort((a, b) => a.order - b.order);

  const pageStyle = {
    fontFamily: `"${theme.fonts.primary.family}", sans-serif`,
    "--font-secondary": `"${theme.fonts.secondary.family}", sans-serif`,
  } as CSSProperties;

  const typeLabel =
    offer.type === "free" ? "Free" : offer.type === "recurring" ? "Recurring" : "One-time";

  return (
    <div className="min-h-screen bg-[#F8F7F5]" style={pageStyle}>
      <header
        className="border-b border-[#E4E4E4]"
        style={{ backgroundColor: theme.header.background }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-secondary)", color: theme.header.iconColor }}
          >
            {offer.title}
          </span>
          {member ? (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: theme.hero.buttonColor }}
              title={member.email}
            >
              {(member.displayName?.charAt(0) || member.email.charAt(0)).toUpperCase()}
            </div>
          ) : null}
        </div>
      </header>

      {theme.hero.visible && (
        <div
          className="relative flex items-center justify-center overflow-hidden px-4 py-16 text-center"
          style={{
            backgroundColor:
              theme.hero.backgroundType === "color" ? theme.hero.backgroundColor : undefined,
            backgroundImage:
              theme.hero.backgroundType === "image" && theme.hero.backgroundImageUrl
                ? `url(${theme.hero.backgroundImageUrl})`
                : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            paddingBlock:
              theme.hero.verticalSpacing === "small"
                ? "2.5rem"
                : theme.hero.verticalSpacing === "large"
                  ? "6rem"
                  : "4rem",
          }}
        >
          {theme.hero.overlayVisible && (
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: theme.hero.overlayColor,
                opacity: theme.hero.overlayOpacity / 100,
              }}
            />
          )}
          <div className="relative space-y-4">
            {theme.hero.tagline && (
              <p className="text-lg font-medium text-white">{theme.hero.tagline}</p>
            )}
            <a
              href="#enroll"
              className="inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold"
              style={{
                backgroundColor: theme.hero.buttonColor,
                color: theme.hero.buttonTextColor,
              }}
            >
              {theme.hero.buttonText}
            </a>
          </div>
        </div>
      )}

      <div className="px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_340px]">
          {/* Left — the sales column */}
          <div className="space-y-5">
            <div className="space-y-1">
              <h1
                className="text-3xl font-semibold tracking-tight text-[#202124]"
                style={{ fontFamily: "var(--font-secondary)" }}
              >
                {offer.title}
              </h1>
              <div className="flex items-center gap-3 text-sm text-[#909090]">
                <span>{priceLabel}</span>
              </div>
            </div>

            {descriptionHtml && (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-[#202124]">About this offer</h2>
                <div
                  className="prose prose-sm max-w-none leading-relaxed prose-headings:text-[#202124] prose-p:text-[#3a3a44] prose-li:text-[#3a3a44] prose-strong:text-[#202124]"
                  dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                />
              </div>
            )}

            {includedCourses.length > 0 && (
              <div>
                <h2 className="mb-2 text-lg font-semibold text-[#202124]">What&apos;s included</h2>
                <div className="space-y-2">
                  {includedCourses.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-lg border border-[#E4E4E4] bg-white p-3"
                    >
                      {c.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.coverUrl}
                          alt=""
                          className="h-12 w-20 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-black/[0.05] text-sm font-semibold text-[#909090]">
                          {c.title.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium text-[#202124]">{c.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bodyBlocks.map((block) => (
              <CourseBlockView
                key={block.id}
                block={block}
                saId={saId}
                crossSellTargets={crossSellTargets}
              />
            ))}
          </div>

          {/* Right — the buy card */}
          <aside className="h-fit space-y-4 rounded-xl border border-[#E4E4E4] bg-white p-5 shadow-sm md:sticky md:top-10">
            {offer.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={offer.thumbnailUrl}
                alt=""
                className="aspect-video w-full rounded-lg object-cover"
              />
            ) : (
              <div
                className="flex aspect-video w-full items-center justify-center rounded-lg text-lg font-semibold text-white"
                style={{ backgroundColor: theme.hero.buttonColor }}
              >
                {offer.title.charAt(0)}
              </div>
            )}
            <h2 className="text-lg font-semibold text-[#202124]">{offer.title}</h2>

            <div className="grid grid-cols-1 gap-2 text-center">
              <div className="rounded-lg bg-[#F8F7F5] py-2">
                <div className="text-base font-semibold text-[#202124]">{priceLabel}</div>
                <div className="text-[11px] uppercase tracking-wide text-[#909090]">
                  {typeLabel}
                </div>
              </div>
            </div>

            {sidebarBlocks.map((block) => (
              <CourseBlockView
                key={block.id}
                block={block}
                saId={saId}
                crossSellTargets={crossSellTargets}
              />
            ))}

            <div id="enroll">
              {alreadyPurchased ? (
                <a
                  href={firstCourseId ? `/course/${saId}/${firstCourseId}/classroom` : "#"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: theme.hero.buttonColor }}
                >
                  Continue learning
                </a>
              ) : interactive ? (
                <EnrollOfferModal
                  saId={saId}
                  offerId={offerId}
                  type={offer.type}
                  priceLabel={priceLabel}
                  brand={theme.hero.buttonColor}
                  member={member}
                  checkoutSettings={offer.checkoutSettings}
                />
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: theme.hero.buttonColor }}
                >
                  {offer.type === "free" ? "Enroll Now" : `Enroll Now — ${priceLabel}`}
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
