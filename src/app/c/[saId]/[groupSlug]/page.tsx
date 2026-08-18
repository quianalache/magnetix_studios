import { notFound } from "next/navigation";
import { getCommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityLoginHref } from "@/lib/community/routes";
import {
  getGroupBySlug,
  getMembership,
  listCommunityReviews,
  listCommunityTiers,
} from "@/lib/server/community-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { CommunityAboutView } from "@/components/community/community-about-view";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Canonical group About page. Guests/prospects see the public join surface;
 * active members see the exact same About content inside CommunityShell so the
 * permanent About tab no longer bounces them into a prospect-only flow.
 */
export default async function GroupAboutPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;

  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) notFound();

  const group = await getGroupBySlug(saId, groupSlug);
  if (!group || group.status !== "published") notFound();

  const pretty = await isCommunityPrettyRequest(saId);
  const linkBase = { saId, pretty };
  const member = await getCurrentMember(saId);
  let state: "guest" | "member" | "joined" | "pending" = member
    ? "member"
    : "guest";
  let membership = null;
  if (member) {
    membership = await getMembership(saId, group.id, member.id);
    if (membership?.status === "active") state = "joined";
    else if (membership?.status === "pending") state = "pending";
  }

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const [tiers, reviews] = await Promise.all([
    listCommunityTiers({ subAccountId: saId, groupId: group.id, activeOnly: true }),
    listCommunityReviews({ subAccountId: saId, groupId: group.id, limit: 24 }),
  ]);
  const about = (
    <CommunityAboutView
      saId={saId}
      pretty={pretty}
      group={group}
      brand={brand}
      state={state}
      member={member}
      membership={membership}
      tiers={tiers}
      reviews={reviews}
    />
  );

  if (state === "joined" && member && membership) {
    const viewer: AuthorView = {
      memberId: member.id,
      displayName:
        member.displayName?.trim() || member.email.split("@")[0] || "Member",
      avatarUrl: member.avatarUrl,
      level: membership.level,
    };
    return (
      <CommunityShell
        saId={saId}
        pretty={pretty}
        group={group}
        active="about"
        viewer={viewer}
        viewerIsModerator={membership.role === "moderator"}
      >
        {about}
      </CommunityShell>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            {group.logoUrl || group.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.logoUrl ?? group.coverUrl ?? ""}
                alt=""
                className="h-7 w-7 rounded object-cover"
              />
            ) : (
              <div
                className="flex h-7 w-7 items-center justify-center rounded text-xs font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                {group.name.charAt(0)}
              </div>
            )}
            <span className="text-sm font-semibold text-[#202124]">
              {group.name}
            </span>
          </div>
          {member ? (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: brand }}
              title={member.email}
            >
              {(member.displayName?.charAt(0) || member.email.charAt(0)).toUpperCase()}
            </div>
          ) : (
            <a
              href={communityLoginHref(linkBase)}
              className="rounded-md border border-[#E4E4E4] px-4 py-1.5 text-sm font-medium text-[#202124] hover:bg-[#F8F7F5]"
            >
              Log in
            </a>
          )}
        </div>
      </header>
      <div className="px-4 py-10">
        <div className="mx-auto max-w-7xl">{about}</div>
        </div>
    </div>
  );
}
