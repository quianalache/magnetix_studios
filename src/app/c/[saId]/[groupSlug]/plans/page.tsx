import { notFound } from "next/navigation";
import { getCommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { getGroupBySlug } from "@/lib/server/community-service";
import { ensureBaseMembershipLevel } from "@/lib/server/community-membership-service";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { CommunityPlansView } from "@/components/community/community-plans-view";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { resolveCommunityThemeColors, communityThemeStyle } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

export default async function CommunityPlansPage({ params }: { params: Promise<{ saId: string; groupSlug: string }> }) {
  const { saId, groupSlug } = await params;
  const gate = await getCommunityGate(saId);
  if (!gate?.enabled) notFound();
  const group = await getGroupBySlug(saId, groupSlug);
  if (!group || group.status !== "published") notFound();
  const levels = await ensureBaseMembershipLevel(saId, group.id, null);
  const plans = levels.filter((level) => level.status === "active" && level.publicVisibility === "public").sort((a, b) => a.order - b.order);
  if (plans.length === 0) notFound();
  const member = await getCurrentMember(saId);
  const planRows = await Promise.all(plans.map(async (plan) => ({
    ...plan,
    offers: {
      monthly: plan.billingOfferIds.monthly ? await getCourseOffer(saId, plan.billingOfferIds.monthly).then((offer) => offer && ({ id: offer.id, type: offer.type, checkoutSettings: offer.checkoutSettings })) : null,
      annual: plan.billingOfferIds.annual ? await getCourseOffer(saId, plan.billingOfferIds.annual).then((offer) => offer && ({ id: offer.id, type: offer.type, checkoutSettings: offer.checkoutSettings })) : null,
      oneTime: plan.billingOfferIds.oneTime ? await getCourseOffer(saId, plan.billingOfferIds.oneTime).then((offer) => offer && ({ id: offer.id, type: offer.type, checkoutSettings: offer.checkoutSettings })) : null,
    },
  })));
  const themeColors = resolveCommunityThemeColors(group.theme);
  const brand = themeColors.primary || group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  return <div className="community-theme" style={communityThemeStyle(group.theme)}><CommunityPlansView saId={saId} group={{ id: group.id, slug: group.slug, name: group.name, about: group.about || group.tagline || "", logoUrl: group.logoUrl, coverUrl: group.coverUrl, theme: group.theme }} brand={brand} plans={planRows} member={member ? { email: member.email, displayName: member.displayName, phone: member.phone } : null} pretty={await isCommunityPrettyRequest(saId)} /></div>;
}
