import Link from "next/link";
import { MemberAvatar } from "@/components/community/member-avatar";
import { communityLeaderboardHref } from "@/lib/community/routes";

interface TopMember {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  rank: number;
  points: number;
}

/**
 * Community Home right-rail "Top Contributors" preview (Part 9). Same real
 * `getLeaderboard()` data the old inline "Leaderboard" block in
 * `community/page.tsx` already used — just componentized and restyled to
 * match the approved mockup's card treatment. No points/ranks are invented.
 */
export function TopContributorsCard({
  saId,
  pretty = false,
  staffGroupId,
  groupSlug,
  brand,
  members,
}: {
  saId: string;
  pretty?: boolean;
  /** Staff Community-in-CRM integration — see CommunityLinkBase in routes.ts. */
  staffGroupId?: string;
  groupSlug: string;
  brand: string;
  members: TopMember[];
}) {
  if (members.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#202124]">Top Contributors</h2>
        <Link
          href={communityLeaderboardHref({ saId, pretty, staffGroupId }, groupSlug)}
          className="text-xs text-[#909090] hover:text-[#202124]"
        >
          View leaderboard
        </Link>
      </div>
      <div className="space-y-2">
        {members.map((r) => (
          <div key={r.memberId} className="flex items-center gap-2">
            <span className="w-4 text-xs font-semibold text-[#909090]">{r.rank}</span>
            <MemberAvatar
              author={{
                memberId: r.memberId,
                displayName: r.displayName,
                avatarUrl: r.avatarUrl,
                level: r.level,
              }}
              size={28}
              brand={brand}
            />
            <span className="flex-1 truncate text-xs text-[#202124]">{r.displayName}</span>
            <span className="text-xs font-semibold text-[#909090]">+{r.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
