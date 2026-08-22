"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileEdit,
  Gift,
  Heart,
  MessageCircle,
  MessageSquareReply,
  Plus,
  Trophy,
  UserPlus,
  Video,
} from "lucide-react";
import { communityHomeHref } from "@/lib/community/routes";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { EditPointRuleModal } from "@/components/community/settings/points-rewards/edit-point-rule-modal";
import { EditLevelModal } from "@/components/community/settings/points-rewards/edit-level-modal";
import { RewardModal } from "@/components/community/settings/points-rewards/reward-modal";
import { AwardWinnerModal } from "@/components/community/settings/points-rewards/award-winner-modal";
import type {
  CommunityLevel,
  PointActionKey,
  PointRule,
  PointsRewardsConfig,
  WinnerFulfillmentStatus,
} from "@/types/points-rewards";
import type {
  EligibleWinner,
  RewardInput,
  RewardWithEffectiveStatus,
} from "@/lib/server/community-rewards-service";
import type { PointsOverview } from "@/lib/server/community-points-service";
import type { CommunityRewardWinner } from "@/types/points-rewards";

type Tab = "overview" | "points-system" | "levels" | "rewards" | "winners";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "points-system", label: "Points System" },
  { key: "levels", label: "Levels" },
  { key: "rewards", label: "Rewards" },
  { key: "winners", label: "Winners" },
];

const ACTION_ORDER: PointActionKey[] = [
  "create_post",
  "share_video",
  "comment_post",
  "reply_comment",
  "like_post",
  "invite_member",
];

const ACTION_ICON: Record<PointActionKey, typeof FileEdit> = {
  create_post: FileEdit,
  share_video: Video,
  comment_post: MessageCircle,
  reply_comment: MessageSquareReply,
  like_post: Heart,
  invite_member: UserPlus,
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F0F0F0", text: "#5f5f5f" },
  scheduled: { bg: "#FFF4E0", text: "#9a6a00" },
  active: { bg: "#E6F7EC", text: "#1a7f3c" },
  completed: { bg: "#EAEAFB", text: "#4740c9" },
  expired: { bg: "#F0F0F0", text: "#909090" },
  archived: { bg: "#F0F0F0", text: "#909090" },
};

function limitLabel(rule: PointRule): string {
  if (rule.limit.type === "none") return "No limit";
  if (rule.limit.type === "per_day") return `Up to ${rule.limit.maxPerDay ?? 0} / day`;
  return "Once per invitee";
}

function rangeLabel(levels: CommunityLevel[], i: number): string {
  const lower = levels[i].threshold;
  const upper = levels[i + 1] ? levels[i + 1].threshold - 1 : null;
  return `${lower.toLocaleString()}${upper !== null ? `–${upper.toLocaleString()}` : "+"} pts`;
}

interface WinnerEnriched extends CommunityRewardWinner {
  memberDisplayName: string;
  memberAvatarUrl: string | null;
  rewardTitle: string;
}

export function PointsRewardsWorkspace({
  saId,
  pretty = false,
  groupId,
  groupSlug,
  brand,
  viewerDisplayName,
  initialConfig,
  initialRewards,
  initialWinners,
  overview,
}: {
  saId: string;
  pretty?: boolean;
  groupId: string;
  groupSlug: string;
  brand: string;
  viewerDisplayName: string;
  initialConfig: PointsRewardsConfig;
  initialRewards: RewardWithEffectiveStatus[];
  initialWinners: WinnerEnriched[];
  overview: PointsOverview;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [config, setConfig] = useState(initialConfig);
  const [rewards, setRewards] = useState(initialRewards);
  const [winners, setWinners] = useState(initialWinners);

  const apiBase = `/api/community/${saId}/${groupId}/points-rewards`;

  // ---- Points System ------------------------------------------------
  const [editingRule, setEditingRule] = useState<PointRule | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  async function saveRule(next: PointRule) {
    setSavingRule(true);
    try {
      const nextRules = { ...config.rules, [next.action]: next };
      const res = await fetch(`${apiBase}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: nextRules }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save rule");
      setConfig(data.config);
      setEditingRule(null);
      toast.success("Point rule saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save rule");
    } finally {
      setSavingRule(false);
    }
  }

  // ---- Levels ---------------------------------------------------------
  const [editingLevel, setEditingLevel] = useState<CommunityLevel | null>(null);
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);

  async function saveLevel(next: CommunityLevel) {
    setSavingLevel(true);
    setLevelError(null);
    try {
      const nextLevels = config.levels.map((l) => (l.level === next.level ? next : l));
      const res = await fetch(`${apiBase}/levels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levels: nextLevels }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save level");
      setConfig(data.config);
      setEditingLevel(null);
      toast.success("Level saved.");
    } catch (err) {
      setLevelError(err instanceof Error ? err.message : "Couldn't save level");
    } finally {
      setSavingLevel(false);
    }
  }

  // ---- Rewards ----------------------------------------------------------
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<RewardWithEffectiveStatus | null>(null);
  const [savingReward, setSavingReward] = useState(false);
  const [rewardError, setRewardError] = useState<string | null>(null);

  function openCreateReward() {
    setEditingReward(null);
    setRewardError(null);
    setRewardModalOpen(true);
  }
  function openEditReward(r: RewardWithEffectiveStatus) {
    setEditingReward(r);
    setRewardError(null);
    setRewardModalOpen(true);
  }

  async function saveReward(input: RewardInput) {
    setSavingReward(true);
    setRewardError(null);
    try {
      const url = editingReward ? `${apiBase}/rewards/${editingReward.id}` : `${apiBase}/rewards`;
      const res = await fetch(url, {
        method: editingReward ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save reward");
      const refreshed = await fetch(`${apiBase}/rewards`).then((r) => r.json());
      if (refreshed.ok) setRewards(refreshed.rewards);
      setRewardModalOpen(false);
      toast.success(editingReward ? "Reward updated." : "Reward created.");
    } catch (err) {
      setRewardError(err instanceof Error ? err.message : "Couldn't save reward");
    } finally {
      setSavingReward(false);
    }
  }

  async function archiveReward(id: string) {
    try {
      const res = await fetch(`${apiBase}/rewards/${id}/archive`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't archive reward");
      setRewards((rs) => rs.map((r) => (r.id === id ? { ...r, status: "archived", effectiveStatus: "archived" } : r)));
      toast.success("Reward archived.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't archive reward");
    }
  }

  // ---- Award Winner -------------------------------------------------
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [awardReward, setAwardReward] = useState<RewardWithEffectiveStatus | null>(null);
  const [candidates, setCandidates] = useState<EligibleWinner[]>([]);
  const [memberSearchResults, setMemberSearchResults] = useState<{ memberId: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [awarding, setAwarding] = useState(false);
  const [awarded, setAwarded] = useState<{ memberId: string; displayName: string } | null>(null);
  const [awardError, setAwardError] = useState<string | null>(null);

  async function openAwardWinner(r: RewardWithEffectiveStatus) {
    setAwardReward(r);
    setCandidates([]);
    setMemberSearchResults([]);
    setAwarded(null);
    setAwardError(null);
    setAwardModalOpen(true);
    if (r.criterion.type !== "manual") {
      const res = await fetch(`${apiBase}/rewards/${r.id}/eligible-winners`);
      const data = await res.json().catch(() => ({}));
      if (data.ok) setCandidates(data.candidates);
    }
  }

  async function searchMembers(query: string) {
    if (!query.trim()) {
      setMemberSearchResults([]);
      return;
    }
    const res = await fetch(`/api/community/${saId}/${groupId}/mention-members?q=${encodeURIComponent(query)}`);
    const data = await res.json().catch(() => ({ members: [] }));
    setMemberSearchResults((data.members ?? []).map((m: { id: string; label: string; avatarUrl: string | null }) => ({ memberId: m.id, displayName: m.label, avatarUrl: m.avatarUrl })));
  }

  async function awardWinner(memberId: string, notes: string) {
    if (!awardReward) return;
    setAwarding(true);
    setAwardError(null);
    try {
      const res = await fetch(`${apiBase}/winners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId: awardReward.id, memberId, notes: notes || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't award winner");
      const displayName =
        candidates.find((c) => c.memberId === memberId)?.displayName ??
        memberSearchResults.find((m) => m.memberId === memberId)?.displayName ??
        "Member";
      setAwarded({ memberId, displayName });
      setWinners((w) => [
        {
          ...data.winner,
          memberDisplayName: displayName,
          memberAvatarUrl:
            candidates.find((c) => c.memberId === memberId)?.avatarUrl ??
            memberSearchResults.find((m) => m.memberId === memberId)?.avatarUrl ??
            null,
          rewardTitle: awardReward.title,
        },
        ...w,
      ]);
    } catch (err) {
      setAwardError(err instanceof Error ? err.message : "Couldn't award winner");
    } finally {
      setAwarding(false);
    }
  }

  async function setWinnerFulfillment(winnerId: string, status: WinnerFulfillmentStatus) {
    try {
      const res = await fetch(`${apiBase}/winners/${winnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillmentStatus: status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't update fulfillment");
      setWinners((w) => w.map((x) => (x.id === winnerId ? { ...x, fulfillmentStatus: status } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update fulfillment");
    }
  }

  const activeRewards = rewards.filter((r) => r.effectiveStatus === "active");
  const liveRewards = rewards.filter((r) => r.effectiveStatus === "active" || r.effectiveStatus === "scheduled");
  const pastRewards = rewards.filter((r) => !liveRewards.includes(r));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#202124]">Community Settings</h1>
          <Link
            href={communityHomeHref({ saId, pretty }, groupSlug)}
            className="mt-1 flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <SettingsNav brand={brand} active="points-rewards" link={{ saId, pretty }} groupSlug={groupSlug} />

        <div className="space-y-5">
          <section className="rounded-xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-base font-semibold text-[#202124]">Points & Rewards</h2>
            <p className="mt-0.5 text-sm text-[#909090]">
              Configure how members earn points, level up, and what they can win.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5 border-b border-[#E4E4E4] pb-3">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                  style={
                    tab === t.key
                      ? { backgroundColor: brand, color: "white" }
                      : { color: "#3a3a44" }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    { label: "Total Points Given", sub: "Last 30 days", value: overview.totalPointsGiven30d.toLocaleString() },
                    { label: "Members Earning Points", sub: "Last 30 days", value: overview.membersEarningPoints30d.toLocaleString() },
                    { label: "Active Rewards", sub: "Right now", value: overview.activeRewardsCount.toString() },
                    { label: "Recent Winners", sub: "Last 30 days", value: overview.recentWinners30d.toString() },
                    { label: "Participation Rate", sub: "Last 30 days", value: `${overview.participationRatePct}%` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-[#E4E4E4] p-3">
                      <p className="text-xs font-medium text-[#909090]">{s.label}</p>
                      <p className="mt-1 text-xl font-semibold text-[#202124]">{s.value}</p>
                      <p className="text-[11px] text-[#b4b4b4]">{s.sub}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#202124]">Active Rewards</h3>
                    <button
                      onClick={() => setTab("rewards")}
                      className="text-xs font-medium"
                      style={{ color: brand }}
                    >
                      Manage Rewards
                    </button>
                  </div>
                  {activeRewards.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#E4E4E4] p-6 text-center text-sm text-[#909090]">
                      No active rewards yet. Create one from the Rewards tab.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {activeRewards.map((r) => (
                        <div key={r.id} className="rounded-lg border border-[#E4E4E4] p-3">
                          <div className="flex items-center gap-2">
                            <Gift className="h-4 w-4" style={{ color: brand }} />
                            <p className="truncate text-sm font-semibold text-[#202124]">{r.title}</p>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-[#909090]">{r.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "points-system" && (
              <div className="mt-5 space-y-2">
                {ACTION_ORDER.map((action) => {
                  const rule = config.rules[action];
                  const Icon = ACTION_ICON[action];
                  return (
                    <div key={action} className="flex items-center gap-3 rounded-lg border border-[#E4E4E4] p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${brand}1a` }}>
                        <Icon className="h-4.5 w-4.5" style={{ color: brand }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#202124]">
                          {rule.label} {!rule.enabled && <span className="text-xs font-normal text-[#b4b4b4]">(Off)</span>}
                        </p>
                        <p className="truncate text-xs text-[#909090]">{rule.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-[#202124]">+{rule.points}</p>
                        <p className="text-[11px] text-[#909090]">{limitLabel(rule)}</p>
                      </div>
                      <button
                        onClick={() => setEditingRule(rule)}
                        className="shrink-0 rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium text-[#3a3a44] hover:bg-[#F8F7F5]"
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "levels" && (
              <div className="mt-5 space-y-2">
                {config.levels.map((l, i) => (
                  <div key={l.level} className="flex items-center gap-3 rounded-lg border border-[#E4E4E4] p-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: brand }}
                    >
                      {l.level}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#202124]">{l.name}</p>
                      <p className="text-xs text-[#909090]">{rangeLabel(config.levels, i)}</p>
                    </div>
                    <button
                      onClick={() => {
                        setLevelError(null);
                        setEditingLevel(l);
                      }}
                      className="shrink-0 rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium text-[#3a3a44] hover:bg-[#F8F7F5]"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tab === "rewards" && (
              <div className="mt-5 space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#909090]">Up to 3 rewards can be active at once.</p>
                  <button
                    onClick={openCreateReward}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: brand }}
                  >
                    <Plus className="h-3.5 w-3.5" /> New Reward
                  </button>
                </div>

                <RewardList
                  title="Active & Scheduled"
                  rewards={liveRewards}
                  emptyText="No active or scheduled rewards."
                  brand={brand}
                  onEdit={openEditReward}
                  onArchive={archiveReward}
                  onAward={openAwardWinner}
                />
                <RewardList
                  title="Past & Completed"
                  rewards={pastRewards}
                  emptyText="No past rewards yet."
                  brand={brand}
                  onEdit={openEditReward}
                  onArchive={archiveReward}
                  onAward={openAwardWinner}
                />
              </div>
            )}

            {tab === "winners" && (
              <div className="mt-5 space-y-2">
                {winners.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#E4E4E4] p-8 text-center text-sm text-[#909090]">
                    No winners yet. Award your first reward from the Rewards tab.
                  </div>
                ) : (
                  winners.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 rounded-lg border border-[#E4E4E4] p-3">
                      <Trophy className="h-4 w-4 shrink-0" style={{ color: brand }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#202124]">
                          {w.memberDisplayName} <span className="text-[#909090]">won</span> {w.rewardTitle}
                        </p>
                        {w.notes && <p className="text-xs text-[#909090]">{w.notes}</p>}
                      </div>
                      <select
                        value={w.fulfillmentStatus}
                        onChange={(e) => setWinnerFulfillment(w.id, e.target.value as WinnerFulfillmentStatus)}
                        className="shrink-0 rounded-md border border-[#E4E4E4] px-2 py-1 text-xs font-medium text-[#3a3a44]"
                      >
                        <option value="pending">Pending</option>
                        <option value="fulfilled">Fulfilled</option>
                      </select>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <EditPointRuleModal
        open={!!editingRule}
        onOpenChange={(o) => !o && setEditingRule(null)}
        rule={editingRule}
        brand={brand}
        onSave={saveRule}
        saving={savingRule}
      />
      <EditLevelModal
        open={!!editingLevel}
        onOpenChange={(o) => !o && setEditingLevel(null)}
        level={editingLevel}
        prevThreshold={editingLevel ? config.levels[editingLevel.level - 2]?.threshold ?? null : null}
        nextThreshold={editingLevel ? config.levels[editingLevel.level]?.threshold ?? null : null}
        brand={brand}
        onSave={saveLevel}
        saving={savingLevel}
        error={levelError}
      />
      <RewardModal
        open={rewardModalOpen}
        onOpenChange={setRewardModalOpen}
        reward={editingReward}
        levels={config.levels}
        brand={brand}
        onSave={saveReward}
        saving={savingReward}
        error={rewardError}
      />
      <AwardWinnerModal
        open={awardModalOpen}
        onOpenChange={setAwardModalOpen}
        reward={awardReward}
        candidates={candidates}
        memberSearchResults={memberSearchResults}
        onSearch={searchMembers}
        brand={brand}
        awardedByName={viewerDisplayName}
        onAward={awardWinner}
        awarding={awarding}
        awarded={awarded}
        error={awardError}
      />
    </div>
  );
}

function RewardList({
  title,
  rewards,
  emptyText,
  brand,
  onEdit,
  onArchive,
  onAward,
}: {
  title: string;
  rewards: RewardWithEffectiveStatus[];
  emptyText: string;
  brand: string;
  onEdit: (r: RewardWithEffectiveStatus) => void;
  onArchive: (id: string) => void;
  onAward: (r: RewardWithEffectiveStatus) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-[#202124]">{title}</h3>
      {rewards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E4E4E4] p-6 text-center text-xs text-[#909090]">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {rewards.map((r) => {
            const style = STATUS_STYLE[r.effectiveStatus] ?? STATUS_STYLE.draft;
            return (
              <div key={r.id} className="rounded-lg border border-[#E4E4E4] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#202124]">{r.title}</p>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {r.effectiveStatus}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[#909090]">{r.description}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {(r.effectiveStatus === "active" || r.effectiveStatus === "scheduled") && (
                      <button
                        onClick={() => onAward(r)}
                        className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
                        style={{ backgroundColor: brand }}
                      >
                        Award Winner
                      </button>
                    )}
                    <button
                      onClick={() => onEdit(r)}
                      className="rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium text-[#3a3a44] hover:bg-[#F8F7F5]"
                    >
                      Edit
                    </button>
                    {r.effectiveStatus !== "archived" && (
                      <button
                        onClick={() => onArchive(r.id)}
                        className="rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium text-[#3a3a44] hover:bg-[#F8F7F5]"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
