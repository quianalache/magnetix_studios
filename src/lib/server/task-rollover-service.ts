import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  activityVisibilityFor,
  recordTaskActivity,
} from "@/lib/server/task-graph-service";

/**
 * Optional overdue-task rollover (restored Momentum OS behavior, Projects &
 * Tasks Phase 2). OFF by default: only tasks with `autoRollover === true`
 * (a per-task toggle in Task Detail) are ever touched — standalone and
 * project tasks alike.
 *
 * An open task whose due DAY (in the sub-account's timezone) is before
 * today moves forward to today, keeping its time of day. The SAME task
 * document moves — no duplicate is created — and it records:
 * - `originalDueAt` (first due date, set once),
 * - `rolledOverCount` (+1 per rollover, shown as "Rolled over N times"),
 * - a `due_changed` history row in taskActivity with reason "rollover".
 * Each move re-checks inside a transaction, so overlapping runs are no-ops.
 */

function dayKey(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export async function runRolloverSweep(now = new Date()) {
  const db = getAdminDb();
  const snap = await db
    .collection("tasks")
    .where("autoRollover", "==", true)
    .where("completed", "==", false)
    .get();
  const tzCache = new Map<string, string>();
  let rolled = 0;
  let checked = 0;
  for (const doc of snap.docs) {
    checked++;
    const t = doc.data();
    if (t.archived === true) continue;
    if (t.projectId) {
      const parent = await db.doc(`projects/${t.projectId}`).get();
      if (parent.data()?.status === "archived") continue;
    }
    const due = (t.dueAt as Timestamp | null)?.toDate?.();
    if (!due || !t.subAccountId) continue;
    let tz = tzCache.get(t.subAccountId);
    if (!tz) {
      const sub = await db.doc(`subAccounts/${t.subAccountId}`).get();
      tz = (sub.data()?.timezone as string) || "UTC";
      tzCache.set(t.subAccountId, tz);
    }
    const shift = daysBetween(dayKey(due, tz), dayKey(now, tz));
    if (shift <= 0) continue;
    const next = new Date(due.getTime() + shift * 86_400_000);
    const moved = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const f = fresh.data();
      if (!f || f.completed || f.autoRollover !== true) return false;
      const freshDue = (f.dueAt as Timestamp | null)?.toDate?.();
      if (!freshDue || freshDue.getTime() !== due.getTime()) return false;
      tx.update(doc.ref, {
        dueAt: Timestamp.fromDate(next),
        originalDueAt: f.originalDueAt ?? f.dueAt,
        rolledOverCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!moved) continue;
    rolled++;
    await recordTaskActivity({
      subAccountId: t.subAccountId,
      agencyId: t.agencyId,
      taskId: doc.id,
      projectId: t.projectId ?? null,
      taskTitle: t.title ?? "",
      type: "rolled_over",
      actor: { kind: "system", name: "Auto rollover" },
      summary: `Rolled over to ${dayKey(next, tz)}`,
      detail: {
        from: due.toISOString(),
        to: next.toISOString(),
        reason: "rollover",
      },
      visibility: activityVisibilityFor(t),
    });
  }
  return { checked, rolled };
}
