"use client";

import { useState } from "react";
import { Gift, MessageCircle, ThumbsUp, Trophy, UserPlus } from "lucide-react";
import { MemberAvatar } from "@/components/community/member-avatar";
import { CircularProgress } from "@/components/community/leaderboard/circular-progress";
import { HowPointsWorkModal } from "@/components/community/leaderboard/how-points-work-modal";
import { cn } from "@/lib/utils";
import type { LeaderboardRow, LeaderboardWindow } from "@/lib/server/community-leaderboard-service";
import type { MemberPointStats } from "@/lib/server/community-points-service";
import type { RewardWithEffectiveStatus } from "@/lib/server/community-rewards-service";
import type { CommunityLevel, PointRuleMap } from "@/types/points-rewards";

const WINDOWS: { key: LeaderboardWindow; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function endDateLabel(reward: RewardWithEffectiveStatus): string | null {
  const endAt = reward.endAt as unknown as { toMillis?: () => number } | null;
  if (!endAt?.toMillis) return null;
  return new Date(endAt.toMillis()).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export interface ViewerLevelInfo {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  levelName: string;
  points: number;
  /** Null when already at the top level — no "next" to progress toward. */
  nextLevelThreshold: number | null;
  /** 0–1, null at the top level. */
  progress: number | null;
}

/**
 * Member-facing Leaderboard — the approved mockup's full page: personal
 * level progress + circular avatar ring, 7d/30d/all-time rankings, active
 * rewards surfaced directly (never requiring a trip to Settings/Portal),
 * and an easily-accessible "How points work" using the Community's real
 * configured rules/levels. Rows for all 3 windows are fetched once,
 * server-side, so switching tabs is instant with no extra request.
 */
export function LeaderboardView({
  brand,
  viewer,
  rowsByWindow,
  activeRewards,
  levels,
  rules,
  stats,
}: {
  brand: string;
  viewer: ViewerLevelInfo;
  rowsByWindow: Record<LeaderboardWindow, LeaderboardRow[]>;
  activeRewards: RewardWithEffectiveStatus[];
  levels: CommunityLevel[];
  rules: PointRuleMap;
  stats: MemberPointStats;
}) {
  const [win, setWin] = useState<LeaderboardWindow>("7d");
  const [expanded, setExpanded] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const rows = rowsByWindow[win];
  const visibleRows = expanded ? rows : rows.slice(0, 10);
  const pointsToNext = viewer.nextLevelThreshold !== null ? Math.max(0, viewer.nextLevelThreshold - viewer.points) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr_300px]">
      {/* Left: personal level progress */}
      <div className="rounded-xl border border-[#E4E4E4] bg-white p-5 text-center">
        <div className="mx-auto flex justify-center">
          <CircularProgress size={140} strokeWidth={6} progress={viewer.progress ?? 1} color={brand}>
            <div className="relative">
              <MemberAvatar author={{ memberId: viewer.memberId, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl, level: viewer.level }} size={112} brand={brand} />
            </div>
          </CircularProgress>
        </div>
        <p className="mt-3 text-base font-semibold text-[#202124]">{viewer.displayName}</p>
        <p className="text-sm font-medium" style={{ color: brand }}>
          Level {viewer.level} - {viewer.levelName}
        </p>
        {pointsToNext !== null ? (
          <>
            <p className="mt-2 text-xs text-[#909090]">
              {viewer.points.toLocaleString()} / {viewer.nextLevelThreshold?.toLocaleString()} pts to Level {viewer.level + 1}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round((viewer.progress ?? 0) * 100)}%`, backgroundColor: brand }}
              />
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-[#909090]">You&apos;ve reached the top level.</p>
        )}
        <button
          onClick={() => setHowOpen(true)}
          className="mt-4 w-full rounded-md border border-[#E4E4E4] px-3 py-2 text-sm font-medium text-[#3a3a44] hover:bg-[#F8F7F5]"
        >
          How points work
        </button>
      </div>

      {/* Middle: rankings. min-w-0: same CSS Grid min-width:auto fix as the
          Points & Rewards Settings workspace — without it, a long member
          display name in the ranked list can force this 1fr column wider
          than the viewport. */}
      <div className="min-w-0">
        <div className="mb-3 flex gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWin(w.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                win === w.key ? "border-transparent text-white" : "border-[#E4E4E4] bg-white text-[#909090] hover:text-[#202124]",
              )}
              style={win === w.key ? { backgroundColor: brand } : undefined}
            >
              {w.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
            No points earned in this window yet.
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0f0] rounded-xl border border-[#E4E4E4] bg-white">
            {visibleRows.map((r) => (
              <div
                key={r.memberId}
                className={cn("flex items-center gap-3 px-4 py-3", r.memberId === viewer.memberId && "bg-[#F8F7F5]")}
              >
                <span className={cn("w-6 text-center text-sm font-semibold", r.rank <= 3 ? "text-[#202124]" : "text-[#909090]")}>
                  {MEDAL[r.rank] ?? r.rank}
                </span>
                <MemberAvatar author={{ memberId: r.memberId, displayName: r.displayName, avatarUrl: r.avatarUrl, level: r.level }} size={36} brand={brand} />
                <span className="flex-1 truncate text-sm font-medium text-[#202124]">{r.displayName}</span>
                <span className="text-sm font-semibold text-[#202124]">{r.points.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {rows.length > 10 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 w-full rounded-md border border-[#E4E4E4] bg-white px-3 py-2 text-sm font-medium text-[#3a3a44] hover:bg-[#F8F7F5]"
          >
            {expanded ? "Show less" : "View all leaderboards"}
          </button>
        )}
      </div>

      {/* Right: active rewards, levels, stats */}
      <div className="space-y-4">
        <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-[#202124]">Active Rewards</h3>
          {activeRewards.length === 0 ? (
            <p className="text-xs text-[#909090]">No active rewards right now — check back soon.</p>
          ) : (
            <div className="space-y-2.5">
              {activeRewards.map((r) => (
                <div key={r.id} className="rounded-lg border border-[#E4E4E4] p-3">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 shrink-0" style={{ color: brand }} />
                    <p className="truncate text-sm font-semibold text-[#202124]">{r.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-[#909090]">{r.description}</p>
                  {endDateLabel(r) && (
                    <span className="mt-2 inline-block rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      Ends {endDateLabel(r)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-[#202124]">Your Level</h3>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: brand }}>
              {viewer.level}
            </div>
            <div>
              <p className="text-sm font-medium text-[#202124]">
                Level {viewer.level} - {viewer.levelName}
              </p>
              <p className="text-xs text-[#909090]">You have {viewer.points.toLocaleString()} points</p>
            </div>
          </div>
          <button onClick={() => setHowOpen(true)} className="mt-2 text-xs font-medium" style={{ color: brand }}>
            View all levels
          </button>
        </div>

        <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#202124]">Your Stats (All Time)</h3>
          <div className="space-y-2 text-sm">
            <StatRow icon={Trophy} label="Total Points" value={stats.totalPoints.toLocaleString()} brand={brand} />
            <StatRow icon={MessageCircle} label="Posts" value={stats.posts.toLocaleString()} brand={brand} />
            <StatRow icon={MessageCircle} label="Comments" value={stats.comments.toLocaleString()} brand={brand} />
            <StatRow icon={ThumbsUp} label="Likes Given" value={stats.likesGiven.toLocaleString()} brand={brand} />
            <StatRow icon={UserPlus} label="Members Invited" value={stats.membersInvited.toLocaleString()} brand={brand} />
          </div>
        </div>
      </div>

      <HowPointsWorkModal open={howOpen} onOpenChange={setHowOpen} rules={rules} levels={levels} brand={brand} />
    </div>
  );
}

function StatRow({ icon: Icon, label, value, brand }: { icon: typeof Trophy; label: string; value: string; brand: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[#3a3a44]">
        <Icon className="h-3.5 w-3.5" style={{ color: brand }} />
        {label}
      </span>
      <span className="font-semibold text-[#202124]">{value}</span>
    </div>
  );
}
