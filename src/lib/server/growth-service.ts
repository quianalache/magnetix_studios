import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  Goal,
  GoalStatus,
  MoneyEntry,
  MoneyEntryKind,
  PagePerformance,
  SocialPlatform,
  SocialPlatformLog,
  WeeklyReview,
} from "@/types/growth";

/** Admin-SDK service for the Growth tab (Social/Money/Goals/Business Pulse/Weekly Review). Same split as project-service.ts: one server-side place for CRUD + the Overview stat-row math, called from the API routes. */

function socialCol() {
  return getAdminDb().collection("socialPlatforms");
}
function logsCol(platformId: string) {
  return socialCol().doc(platformId).collection("logs");
}
function moneyCol() {
  return getAdminDb().collection("moneyEntries");
}
function goalsCol() {
  return getAdminDb().collection("goals");
}
function pagesCol() {
  return getAdminDb().collection("pagePerformance");
}
function reviewsCol() {
  return getAdminDb().collection("weeklyReviews");
}

function toDoc<T>(snap: FirebaseFirestore.DocumentSnapshot): T {
  return { id: snap.id, ...(snap.data() as Omit<T, "id">) } as T;
}
function toDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}

// ── social ───────────────────────────────────────────────────────────────

export async function listSocialPlatforms(subAccountId: string): Promise<SocialPlatform[]> {
  const snap = await socialCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDoc<SocialPlatform>(d));
}

export async function addSocialPlatform(opts: {
  agencyId: string;
  subAccountId: string;
  platform: string;
  startedAt: Date | null;
}): Promise<SocialPlatform> {
  const ref = socialCol().doc();
  await ref.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    platform: opts.platform,
    startedAt: opts.startedAt ? Timestamp.fromDate(opts.startedAt) : FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<SocialPlatform>(snap);
}

export async function deleteSocialPlatform(platformId: string): Promise<void> {
  const logs = await logsCol(platformId).get();
  const batch = getAdminDb().batch();
  for (const d of logs.docs) batch.delete(d.ref);
  batch.delete(socialCol().doc(platformId));
  await batch.commit();
}

export async function listSocialLogs(platformId: string): Promise<SocialPlatformLog[]> {
  const snap = await logsCol(platformId).orderBy("date", "desc").get();
  return snap.docs.map((d) => toDoc<SocialPlatformLog>(d));
}

export async function addSocialLog(
  platformId: string,
  opts: { date: Date; count: number },
): Promise<SocialPlatformLog> {
  const ref = logsCol(platformId).doc();
  await ref.set({
    date: Timestamp.fromDate(opts.date),
    count: opts.count,
    createdAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<SocialPlatformLog>(snap);
}

export async function latestSocialCount(platformId: string): Promise<number> {
  const snap = await logsCol(platformId).orderBy("date", "desc").limit(1).get();
  return snap.empty ? 0 : ((snap.docs[0].data().count as number) ?? 0);
}

// ── money ────────────────────────────────────────────────────────────────

export async function listMoneyEntries(
  subAccountId: string,
  kind?: MoneyEntryKind,
): Promise<MoneyEntry[]> {
  let q = moneyCol().where("subAccountId", "==", subAccountId) as FirebaseFirestore.Query;
  if (kind) q = q.where("kind", "==", kind);
  const snap = await q.get();
  return snap.docs
    .map((d) => toDoc<MoneyEntry>(d))
    .sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0));
}

export async function addMoneyEntry(opts: {
  agencyId: string;
  subAccountId: string;
  kind: MoneyEntryKind;
  title: string;
  amount: number;
  date: Date;
  recurring: boolean;
  linkedOfferId: string | null;
}): Promise<MoneyEntry> {
  const ref = moneyCol().doc();
  await ref.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    kind: opts.kind,
    title: opts.title,
    amount: opts.amount,
    date: Timestamp.fromDate(opts.date),
    recurring: opts.recurring,
    linkedOfferId: opts.linkedOfferId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<MoneyEntry>(snap);
}

export async function deleteMoneyEntry(entryId: string): Promise<void> {
  await moneyCol().doc(entryId).delete();
}

/** The Overview + Money tab stat rows — all real math off `moneyEntries`, nothing typed in. */
export async function computeMoneyStats(subAccountId: string): Promise<{
  incomeThisMonth: number;
  expensesThisMonth: number;
  currentMrr: number;
  mrrRecordCount: number;
  projectedCashFlow: number;
  netProfitLoss: number;
}> {
  const entries = await listMoneyEntries(subAccountId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let incomeThisMonth = 0;
  let expensesThisMonth = 0;
  let currentMrr = 0;
  let mrrRecordCount = 0;
  let recurringExpenses = 0;

  for (const e of entries) {
    const d = toDate(e.date);
    const inThisMonth = !!d && d.getTime() >= monthStart.getTime();
    if (e.kind === "income") {
      if (inThisMonth) incomeThisMonth += e.amount;
      if (e.recurring) {
        currentMrr += e.amount;
        mrrRecordCount += 1;
      }
    } else {
      if (inThisMonth) expensesThisMonth += e.amount;
      if (e.recurring) recurringExpenses += e.amount;
    }
  }

  return {
    incomeThisMonth,
    expensesThisMonth,
    currentMrr,
    mrrRecordCount,
    projectedCashFlow: currentMrr - recurringExpenses,
    netProfitLoss: incomeThisMonth - expensesThisMonth,
  };
}

// ── goals ────────────────────────────────────────────────────────────────

export async function listGoals(subAccountId: string, status?: GoalStatus): Promise<Goal[]> {
  let q = goalsCol().where("subAccountId", "==", subAccountId) as FirebaseFirestore.Query;
  if (status) q = q.where("status", "==", status);
  const snap = await q.get();
  return snap.docs.map((d) => toDoc<Goal>(d));
}

export async function createGoal(opts: {
  agencyId: string;
  subAccountId: string;
  name: string;
  type: string;
  current: number;
  target: number;
  startAt: Date | null;
  endAt: Date | null;
}): Promise<Goal> {
  const ref = goalsCol().doc();
  await ref.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    name: opts.name,
    type: opts.type,
    current: opts.current,
    target: opts.target,
    startAt: opts.startAt ? Timestamp.fromDate(opts.startAt) : null,
    endAt: opts.endAt ? Timestamp.fromDate(opts.endAt) : null,
    status: "active",
    completedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<Goal>(snap);
}

export async function updateGoal(
  goalId: string,
  patch: Partial<{
    name: string;
    type: string;
    current: number;
    target: number;
    startAt: Date | null;
    endAt: Date | null;
    status: GoalStatus;
  }>,
): Promise<void> {
  const data: Record<string, unknown> = { ...patch, updatedAt: FieldValue.serverTimestamp() };
  if (patch.startAt !== undefined) data.startAt = patch.startAt ? Timestamp.fromDate(patch.startAt) : null;
  if (patch.endAt !== undefined) data.endAt = patch.endAt ? Timestamp.fromDate(patch.endAt) : null;
  if (patch.status === "completed") data.completedAt = FieldValue.serverTimestamp();
  await goalsCol().doc(goalId).set(data, { merge: true });
}

export async function deleteGoal(goalId: string): Promise<void> {
  await goalsCol().doc(goalId).delete();
}

// ── business pulse: page performance ────────────────────────────────────

export async function listPagePerformance(subAccountId: string): Promise<PagePerformance[]> {
  const snap = await pagesCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDoc<PagePerformance>(d));
}

export async function addPagePerformance(opts: {
  agencyId: string;
  subAccountId: string;
  title: string;
  url: string;
  pageType: string;
}): Promise<PagePerformance> {
  const ref = pagesCol().doc();
  await ref.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    title: opts.title,
    url: opts.url,
    pageType: opts.pageType,
    impressions: 0,
    conversions: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<PagePerformance>(snap);
}

export async function deletePagePerformance(pageId: string): Promise<void> {
  await pagesCol().doc(pageId).delete();
}

// ── weekly review ────────────────────────────────────────────────────────

/** Monday 00:00 local of the week containing `d`. */
export function weekStartOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diff);
  return monday;
}

export async function getWeeklyReview(
  subAccountId: string,
  weekStart: Date,
): Promise<WeeklyReview | null> {
  const snap = await reviewsCol()
    .where("subAccountId", "==", subAccountId)
    .where("weekStart", "==", Timestamp.fromDate(weekStart))
    .limit(1)
    .get();
  return snap.empty ? null : toDoc<WeeklyReview>(snap.docs[0]);
}

export async function upsertWeeklyReview(opts: {
  agencyId: string;
  subAccountId: string;
  weekStart: Date;
  hoursTracked: number;
  biggestWin: string;
  lessonLearned: string;
  needsAttention: string;
  priority1: string;
  priority2: string;
  priority3: string;
  revenueGoal: number | null;
}): Promise<WeeklyReview> {
  const existing = await getWeeklyReview(opts.subAccountId, opts.weekStart);
  const ref = existing ? reviewsCol().doc(existing.id) : reviewsCol().doc();
  await ref.set(
    {
      agencyId: opts.agencyId,
      subAccountId: opts.subAccountId,
      weekStart: Timestamp.fromDate(opts.weekStart),
      hoursTracked: opts.hoursTracked,
      biggestWin: opts.biggestWin,
      lessonLearned: opts.lessonLearned,
      needsAttention: opts.needsAttention,
      priority1: opts.priority1,
      priority2: opts.priority2,
      priority3: opts.priority3,
      revenueGoal: opts.revenueGoal,
      createdAt: existing ? existing.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const snap = await ref.get();
  return toDoc<WeeklyReview>(snap);
}

/**
 * This week's stats — real numbers, not MomentumOS's originals:
 *  - tasksCompleted / incomeThisWeek: genuinely computed from this
 *    sub-account's own `tasks` and `moneyEntries` collections.
 *  - momentumScorePct: an honest substitute for MomentumOS's
 *    Routines-based Momentum Score (this CRM has no Routines feature) —
 *    this week's real task completion rate (completed ÷ due-this-week)
 *    instead. `null` when nothing was due, matching the "No routine tasks
 *    completed this week yet" empty case.
 */
export async function computeWeekStats(
  subAccountId: string,
  weekStart: Date,
): Promise<{ tasksCompleted: number; incomeThisWeek: number; momentumScorePct: number | null }> {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [taskSnap, entries] = await Promise.all([
    getAdminDb().collection("tasks").where("subAccountId", "==", subAccountId).get(),
    listMoneyEntries(subAccountId, "income"),
  ]);

  let tasksCompleted = 0;
  let tasksDue = 0;
  for (const d of taskSnap.docs) {
    const t = d.data();
    const due = toDate(t.dueAt);
    const inWeek = !!due && due.getTime() >= weekStart.getTime() && due.getTime() < weekEnd.getTime();
    if (inWeek) tasksDue += 1;
    const completedAt = toDate(t.completedAt);
    if (
      t.completed === true &&
      completedAt &&
      completedAt.getTime() >= weekStart.getTime() &&
      completedAt.getTime() < weekEnd.getTime()
    ) {
      tasksCompleted += 1;
    }
  }

  const incomeThisWeek = entries
    .filter((e) => {
      const d = toDate(e.date);
      return !!d && d.getTime() >= weekStart.getTime() && d.getTime() < weekEnd.getTime();
    })
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    tasksCompleted,
    incomeThisWeek,
    momentumScorePct: tasksDue > 0 ? Math.round((tasksCompleted / tasksDue) * 100) : null,
  };
}
