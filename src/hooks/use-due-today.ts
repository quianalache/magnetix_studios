"use client";

import { useEffect, useState } from "react";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { toDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useOptionalSubAccount } from "@/context/sub-account-context";

/**
 * Number of incomplete tasks due today (or overdue) for the active
 * sub-account. The Sidebar renders this as a badge next to the Tasks nav
 * item, so it has to work both inside `/sa/[subAccountId]/...` (where the
 * provider exposes the active scope) and at agency-level pages (where we
 * fall back to the user's first sub-account membership).
 */
export function useDueTodayCount(): number {
  const { user, memberships } = useAuth();
  const sub = useOptionalSubAccount();
  const [count, setCount] = useState(0);
  // Today's open routine activities the viewer can see (their own routines
  // + shared ones). They live server-side, so they're fetched, not subscribed.
  const [routineCount, setRoutineCount] = useState(0);

  const fallback = memberships[0];
  const subAccountId = sub?.subAccountId ?? fallback?.subAccountId ?? null;
  const agencyId = sub?.agencyId ?? fallback?.agencyId ?? null;

  useEffect(() => {
    if (!user || !subAccountId || !agencyId) {
      setCount(0);
      return;
    }
    const unsub = subscribeToTasks(
      { agencyId, subAccountId },
      (tasks) => {
        const now = Date.now();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);
        let n = 0;
        for (const t of tasks) {
          if (t.completed) continue;
          const d = toDate(t.dueAt);
          if (!d) continue;
          // A routine activity from a past day is a missed occurrence (kept in
          // the routine's history), not overdue work — same as My Tasks.
          if (t.routineId && d.getTime() < today.getTime()) continue;
          // overdue or due today
          if (d.getTime() < nextDay.getTime() || d.getTime() < now) {
            n += 1;
          }
        }
        setCount(n);
      },
    );
    return () => unsub();
  }, [user, subAccountId, agencyId]);

  useEffect(() => {
    if (!user || !subAccountId) {
      setRoutineCount(0);
      return;
    }
    let cancelled = false;
    const load = () =>
      fetch(`/api/sub-accounts/${subAccountId}/routines/activities`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { today: string; tasks: { completed?: boolean; occurrenceDate?: string }[] } | null) => {
          if (cancelled || !b) return;
          setRoutineCount(b.tasks.filter((t) => !t.completed && t.occurrenceDate === b.today).length);
        })
        .catch(() => {});
    void load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [user, subAccountId]);

  return count + routineCount;
}
