import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Growth — full port of MomentumOS's Growth tab (Overview / Social / Money /
 * Goals / Business Pulse / Weekly Review), structure and copy pulled
 * directly from the real "Momentum OS — Daily Flow" Claude Artifact
 * (fetched 2026-08-06). Per explicit instruction: port the STRUCTURE and
 * the mechanism for creating entries, never her personal example data
 * (goals/transactions/logs already in her account stay out of this CRM).
 *
 * Two honest substitutions where MomentumOS's original computed a stat off
 * a source this CRM doesn't have:
 *  - "Hours Tracked" (Weekly Review) — MomentumOS has a Focus Timer in
 *    Tasks; this CRM doesn't. Kept as a real field, just manually entered
 *    per week instead of auto-tracked.
 *  - "Momentum Score" (Weekly Review) — MomentumOS computes this off
 *    Routines (a Tasks sub-tab this CRM never built). Substituted with a
 *    real, honestly-computed number instead: this sub-account's actual
 *    task completion rate for the week, from the existing `tasks`
 *    collection — same spirit (are you keeping up with your own system?),
 *    real data, not decorative.
 *  - "Funnel Performance" (Business Pulse) — genuinely blocked, not
 *    substituted: Funnels isn't built in this CRM yet (see the Funnels
 *    backlog item). The tab stays, with an honest empty state pointing at
 *    that gap, rather than being silently dropped or faked.
 */

export interface SocialPlatform {
  id: string;
  agencyId: string;
  subAccountId: string;
  platform: string;
  startedAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface SocialPlatformLog {
  id: string;
  date: Timestamp | FieldValue | null;
  count: number;
  createdAt: Timestamp | FieldValue | null;
}

export type MoneyEntryKind = "income" | "expense";

export interface MoneyEntry {
  id: string;
  agencyId: string;
  subAccountId: string;
  kind: MoneyEntryKind;
  title: string;
  amount: number;
  date: Timestamp | FieldValue | null;
  /** Counts toward MRR (income) or recurring expenses (expense) on the Overview stat row. */
  recurring: boolean;
  /** Set when linked to a real Course Offer purchase rather than typed in — see Assets' same "linked to an Offer" model. Null = manually logged, same as MomentumOS. */
  linkedOfferId: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type GoalStatus = "active" | "completed";

export interface Goal {
  id: string;
  agencyId: string;
  subAccountId: string;
  name: string;
  /** Free-text tag, matches MomentumOS's own goal cards (e.g. "Followers / Subscribers", "Revenue"). */
  type: string;
  current: number;
  target: number;
  startAt: Timestamp | FieldValue | null;
  endAt: Timestamp | FieldValue | null;
  status: GoalStatus;
  completedAt: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface PagePerformance {
  id: string;
  agencyId: string;
  subAccountId: string;
  title: string;
  url: string;
  pageType: string;
  impressions: number;
  conversions: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface WeeklyReview {
  id: string;
  agencyId: string;
  subAccountId: string;
  /** Normalized to the Monday of the reviewed week (00:00 local) — one doc per sub-account per week. */
  weekStart: Timestamp | FieldValue | null;
  hoursTracked: number;
  biggestWin: string;
  lessonLearned: string;
  needsAttention: string;
  priority1: string;
  priority2: string;
  priority3: string;
  revenueGoal: number | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export function goalProgressPct(goal: Pick<Goal, "current" | "target">): number {
  if (goal.target <= 0) return 0;
  return Math.min(100, Math.round((goal.current / goal.target) * 100));
}
