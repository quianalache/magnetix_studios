import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emptyDailyReflectionFields, type DailyReflectionDoc, type DailyOperationalStats } from "@/types/reflection";

function col() {
  return getAdminDb().collection("dailyReflections");
}

function docId(subAccountId: string, date: string): string {
  return `${subAccountId}_${date}`;
}

function toDoc(id: string, data: FirebaseFirestore.DocumentData): DailyReflectionDoc {
  return { id, ...(data as Omit<DailyReflectionDoc, "id">) };
}

export async function getDailyReflection(
  subAccountId: string,
  date: string,
): Promise<DailyReflectionDoc | null> {
  const snap = await col().doc(docId(subAccountId, date)).get();
  return snap.exists ? toDoc(snap.id, snap.data()!) : null;
}

export async function upsertDailyReflection(opts: {
  agencyId: string;
  subAccountId: string;
  date: string;
  fields: Partial<ReturnType<typeof emptyDailyReflectionFields>>;
}): Promise<DailyReflectionDoc> {
  const ref = col().doc(docId(opts.subAccountId, opts.date));
  const existing = await ref.get();
  await ref.set(
    {
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      date: opts.date,
      ...emptyDailyReflectionFields(),
      ...(existing.exists ? existing.data() : {}),
      ...opts.fields,
      createdAt: existing.exists ? existing.data()!.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const snap = await ref.get();
  return toDoc(snap.id, snap.data()!);
}

/**
 * "Operational Awareness" mini-stats — real where a source system exists
 * in this app, honestly null/zero where it doesn't. Rituals has no
 * tracking system at all yet (it's one of the 7 un-built Reflection
 * sub-tabs), so it stays null rather than a fake 0.
 */
export async function getDailyOperationalStats(
  subAccountId: string,
  date: string,
): Promise<DailyOperationalStats> {
  const db = getAdminDb();
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59.999`);
  const startTs = Timestamp.fromDate(dayStart);
  const endTs = Timestamp.fromDate(dayEnd);

  const [tasksSnap, moneySnap, contentSnap] = await Promise.all([
    db
      .collection("tasks")
      .where("subAccountId", "==", subAccountId)
      .where("completed", "==", true)
      .where("completedAt", ">=", startTs)
      .where("completedAt", "<=", endTs)
      .get(),
    db
      .collection("moneyEntries")
      .where("subAccountId", "==", subAccountId)
      .where("date", ">=", startTs)
      .where("date", "<=", endTs)
      .get(),
    db
      .collection("contentItems")
      .where("subAccountId", "==", subAccountId)
      .where("stage", "==", "published")
      .where("publishDate", ">=", startTs)
      .where("publishDate", "<=", endTs)
      .get(),
  ]);

  let income = 0;
  let expenses = 0;
  for (const doc of moneySnap.docs) {
    const d = doc.data();
    if (d.kind === "income") income += Number(d.amount) || 0;
    else expenses += Number(d.amount) || 0;
  }

  return {
    tasksCompleted: tasksSnap.size,
    ritualsCompleted: null,
    income,
    netFlow: income - expenses,
    contentPublished: contentSnap.size,
    hoursTracked: 0,
  };
}
