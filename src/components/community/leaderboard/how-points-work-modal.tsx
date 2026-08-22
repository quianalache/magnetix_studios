"use client";

import { FileEdit, Heart, MessageCircle, MessageSquareReply, UserPlus, Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CommunityLevel, PointActionKey, PointRuleMap } from "@/types/points-rewards";

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

function suffix(action: PointActionKey, rule: PointRuleMap[PointActionKey]): string | null {
  if (rule.limit.type === "per_day") return `up to ${rule.limit.maxPerDay ?? 0} per day`;
  if (rule.limit.type === "per_entity") return "once per invitee";
  return null;
}

function rangeLabel(levels: CommunityLevel[], i: number): string {
  const lower = levels[i].threshold;
  const upper = levels[i + 1] ? levels[i + 1].threshold - 1 : null;
  return `${lower.toLocaleString()}${upper !== null ? `–${upper.toLocaleString()}` : "+"} pts`;
}

/**
 * Member-facing "How Points & Levels Work" — the approved mockup's modal.
 * Entirely driven by the Community's ACTUAL configured rules/levels
 * (passed in as props, read server-side from the same
 * `PointsRewardsConfig` Settings edits) — never hardcoded copy, per the
 * explicit requirement.
 */
export function HowPointsWorkModal({
  open,
  onOpenChange,
  rules,
  levels,
  brand,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: PointRuleMap;
  levels: CommunityLevel[];
  brand: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-[#202124] sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-[#202124]">How Points & Levels Work</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[#202124]">How you earn points</h3>
            <div className="space-y-2">
              {ACTION_ORDER.filter((a) => rules[a]?.enabled).map((action) => {
                const rule = rules[action];
                const Icon = ACTION_ICON[action];
                const s = suffix(action, rule);
                return (
                  <div key={action} className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${brand}1a` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: brand }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#202124]">{rule.label}</p>
                      <p className="text-xs text-[#909090]">
                        {rule.description}
                        {s ? ` (${s})` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-[#202124]">+{rule.points}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[#202124]">Levels</h3>
            <div className="space-y-1.5">
              {levels.map((l, i) => (
                <div key={l.level} className="flex items-center gap-3">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: brand }}
                  >
                    {l.level}
                  </div>
                  <p className="flex-1 text-sm font-medium text-[#202124]">{l.name}</p>
                  <p className="text-xs text-[#909090]">{rangeLabel(levels, i)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
