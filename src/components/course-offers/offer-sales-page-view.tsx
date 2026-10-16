import { BookOpen, CalendarDays, FolderKanban, Package } from "lucide-react";
import {
  CourseBlockView,
  themeBtnStyle,
  type CrossSellTargetInfo,
} from "@/components/standalone-courses/theme-blocks";
import { isCoreSidebarBlock, isCoreBodyBlock } from "@/types/course-theme";
import { EnrollOfferModal } from "@/app/offer/[saId]/[offerId]/enroll-modal";
import { RecentPurchasePopup } from "@/components/course-offers/recent-purchase-popup";
import type { CourseTheme } from "@/types/course-theme";
import type { CourseOffer } from "@/types/course-offers";
import type { Member } from "@/types/community";
import { startLearningHref } from "@/lib/standalone-courses/course-navigation";
import { BuyCard, CheckoutFrame, CheckoutHeader, SalesChip, SalesMedia, SalesSection, StickyBuyBar } from "@/components/public/public-checkout-shell";

type CheckoutMember = Pick<Member, "email" | "displayName" | "phone">;
type OfferSalesOffer = Pick<
  CourseOffer,
  | "title"
  | "type"
  | "showRecentPurchasePopup"
  | "thumbnailUrl"
  | "booking"
  | "projectTemplates"
  | "checkoutSettings"
>;

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
 *
 * Public-surfaces v2 (2026-10-16): rendered on PublicCheckoutShell — the
 * offer's own theme stays the only brand source (button color = accent,
 * fonts, header colors, hero, background). Real media replaces letter
 * placeholders; phones get a sticky price + purchase bar. No "Powered by"
 * on paid pages (owner decision).
 */
export function OfferSalesPageView({
  saId,
  offerId,
  agencyScope,
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
  businessName,
}: {
  saId: string;
  offerId: string;
  /** Agency Course Offer — see EnrollOfferModal's own doc comment. */
  agencyScope?: boolean;
  offer: OfferSalesOffer;
  theme: CourseTheme;
  priceLabel: string;
  descriptionHtml: string;
  includedCourses: OfferIncludedCourse[];
  member: CheckoutMember | null;
  alreadyPurchased: boolean;
  firstCourseId: string | null;
  crossSellTargets: ReadonlyMap<string, CrossSellTargetInfo>;
  interactive: boolean;
  /** The selling business (sub-account or agency name). Falls back to the offer title (theme-editor preview). */
  businessName?: string | null;
}) {
  // No Category Block for an Offer (no curriculum — see DEFAULT_OFFER_THEME);
  // filtered defensively same as sidebar below, in case a template that had
  // one slipped through before apply-time stripping.
  const bodyBlocks = [...theme.body]
    .filter((b) => !isCoreBodyBlock(b))
    .sort((a, b) => a.order - b.order);
  const sidebarBlocks = [...theme.sidebar]
    .filter((b) => !isCoreSidebarBlock(b))
    .sort((a, b) => a.order - b.order);

  const typeLabel =
    offer.type === "free"
      ? "Free"
      : offer.type === "recurring"
        ? "Recurring"
        : "One-time";
  const seller = businessName?.trim() || offer.title;
  // The offer's own image, else the first included course's cover — real media before any placeholder.
  const heroImage = offer.thumbnailUrl || includedCourses.find((c) => c.coverUrl)?.coverUrl || null;
  const includedCount = includedCourses.length + (offer.booking ? 1 : 0) + offer.projectTemplates.length;

  /** The purchase action — rendered in the buy card and again in the phone sticky bar. */
  const purchaseAction = alreadyPurchased ? (
    <a
      href={firstCourseId ? startLearningHref(`/course/${saId}/${firstCourseId}/classroom`) : `/portal/${saId}`}
      className="tenant-button inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold"
    >
      {firstCourseId ? "Continue learning" : "Open portal"}
    </a>
  ) : interactive ? (
    <EnrollOfferModal
      saId={saId}
      offerId={offerId}
      agencyScope={agencyScope}
      type={offer.type}
      priceLabel={priceLabel}
      brand={theme.hero.buttonColor}
      member={member}
      checkoutSettings={offer.checkoutSettings}
    />
  ) : (
    <button type="button" disabled className="tenant-button inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold">
      {offer.type === "free" ? "Enroll Now" : `Enroll Now — ${priceLabel}`}
    </button>
  );

  return (
    <CheckoutFrame theme={theme} businessName={seller}>
      {offer.showRecentPurchasePopup === true && (
        <RecentPurchasePopup saId={saId} offerId={offerId} productName={offer.title} />
      )}
      <CheckoutHeader
        theme={theme}
        businessName={seller}
        right={
          member ? (
            <div
              className="tenant-mark flex size-8 items-center justify-center rounded-full text-xs font-semibold"
              title={member.email}
            >
              {(member.displayName?.charAt(0) || member.email.charAt(0)).toUpperCase()}
            </div>
          ) : null
        }
      />

        {theme.hero.visible && (
          <div
            className="relative flex items-center justify-center overflow-hidden px-4 py-16 text-center"
            style={{
              backgroundColor:
                theme.hero.backgroundType === "color"
                  ? theme.hero.backgroundColor
                  : undefined,
              backgroundImage:
                theme.hero.backgroundType === "image" &&
                theme.hero.backgroundImageUrl
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
              <h1
                className="text-3xl font-semibold tracking-tight"
                style={{
                  fontFamily: "var(--font-secondary)",
                  color: theme.hero.titleColor ?? "#ffffff",
                }}
              >
                {offer.title}
              </h1>
              {theme.hero.tagline && (
                <p className="text-lg font-medium text-white">
                  {theme.hero.tagline}
                </p>
              )}
              <a
                href="#enroll"
                className="theme-btn inline-flex items-center gap-2 rounded-md border px-6 py-3 text-sm font-semibold"
                style={themeBtnStyle({
                  fill: theme.hero.buttonColor,
                  fillHover:
                    theme.hero.buttonColorHover ?? theme.hero.buttonColor,
                  border:
                    theme.hero.buttonBorderColor ?? theme.hero.buttonColor,
                  borderHover:
                    theme.hero.buttonBorderColorHover ?? theme.hero.buttonColor,
                  text: theme.hero.buttonTextColor,
                  textHover:
                    theme.hero.buttonTextColorHover ??
                    theme.hero.buttonTextColor,
                })}
              >
                {theme.hero.buttonText}
              </a>
            </div>
          </div>
        )}

        <div className="px-4 py-8 sm:py-12">
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[minmax(0,1fr)_360px] md:gap-10">
            {/* Left — the sales column */}
            <div className="min-w-0 space-y-6">
              <div className="space-y-3">
                <SalesChip icon={Package}>{offer.type === "free" ? "Free offer" : "Offer"}</SalesChip>
                {/* When Hero is visible it already shows the title — avoid rendering it twice. */}
                {!theme.hero.visible && (
                  <h1 className="public-ink text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl" style={{ fontFamily: "var(--font-secondary)" }}>
                    {offer.title}
                  </h1>
                )}
                <p className="public-body text-sm">
                  {priceLabel}
                  {priceLabel ? " · " : ""}
                  {typeLabel}
                </p>
              </div>

              {/* Phones: real media right away (only when there is some); the full buy card follows the content. */}
              {heroImage && (
                <div className="tenant-card overflow-hidden md:hidden">
                  <SalesMedia src={heroImage} icon={Package} className="aspect-video" />
                </div>
              )}

              {descriptionHtml && (
                <SalesSection title="About this offer">
                  <div
                    className="prose prose-sm max-w-none px-5 py-4 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                  />
                </SalesSection>
              )}

              {includedCount > 0 && (
                <SalesSection title="What's included" aside={`${includedCount} ${includedCount === 1 ? "item" : "items"}`}>
                  <ul className="public-line divide-y">
                    {includedCourses.map((c) => (
                      <li key={c.id} className="flex items-center gap-3.5 px-5 py-3.5">
                        <SalesMedia src={c.coverUrl} icon={BookOpen} className="h-12 w-20 shrink-0 rounded-md" />
                        <span className="public-ink text-sm font-medium">{c.title}</span>
                      </li>
                    ))}
                    {offer.booking && (
                      <li className="flex items-center gap-3.5 px-5 py-3.5">
                        <SalesMedia src={null} icon={CalendarDays} className="h-12 w-20 shrink-0 rounded-md" />
                        <span className="public-ink text-sm font-medium">
                          {offer.booking.sessionCount} {offer.booking.sessionCount === 1 ? "session" : "sessions"} with {offer.booking.bookingPageName}
                        </span>
                      </li>
                    )}
                    {offer.projectTemplates.map((projectTemplate) => (
                      <li key={projectTemplate.templateId} className="flex items-center gap-3.5 px-5 py-3.5">
                        <SalesMedia src={null} icon={FolderKanban} className="h-12 w-20 shrink-0 rounded-md" />
                        <span className="public-ink text-sm font-medium">{projectTemplate.templateTitle}</span>
                      </li>
                    ))}
                  </ul>
                </SalesSection>
              )}

              {bodyBlocks.map((block) => (
                <CourseBlockView key={block.id} block={block} saId={saId} crossSellTargets={crossSellTargets} />
              ))}
            </div>

            {/* Right — the buy card */}
            <BuyCard
              media={<SalesMedia src={heroImage} icon={Package} className="aspect-video max-md:hidden" />}
              title={offer.title}
              price={priceLabel}
              priceNote={typeLabel}
              secure={offer.type !== "free" && !alreadyPurchased}
            >
              {sidebarBlocks.map((block) => (
                <CourseBlockView key={block.id} block={block} saId={saId} crossSellTargets={crossSellTargets} />
              ))}
              <div id="enroll" className="space-y-2">
                {purchaseAction}
                {alreadyPurchased && offer.booking && (
                  <a
                    href={`/b/${saId}/${offer.booking.bookingPageSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="public-button-secondary inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold"
                  >
                    Book your session
                    {offer.booking.sessionCount > 1 ? `s (${offer.booking.sessionCount} included)` : ""}
                  </a>
                )}
              </div>
            </BuyCard>
          </div>
        </div>
      <StickyBuyBar price={priceLabel} priceNote={typeLabel}>
        {purchaseAction}
      </StickyBuyBar>
    </CheckoutFrame>
  );
}
