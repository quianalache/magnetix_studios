import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  emptyDailyReflectionFields,
  type DailyReflectionDoc,
  type DailyOperationalStats,
  type RitualDoc,
  type RitualFrequency,
  type RitualTimeBlock,
  type NoteDoc,
  type MemoryDoc,
} from "@/types/reflection";

function col() {
  return getAdminDb().collection("dailyReflections");
}

function ritualsCol() {
  return getAdminDb().collection("reflectionRituals");
}

function notesCol() {
  return getAdminDb().collection("reflectionNotes");
}

function memoriesCol() {
  return getAdminDb().collection("reflectionMemories");
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
 * in this app, honestly zero where it doesn't. ritualsCompleted now reads
 * real RitualDoc.completedDates (rituals shipped 2026-08-08) — counts how
 * many of the sub-account's rituals were checked off on this date.
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

  const [tasksSnap, moneySnap, contentSnap, ritualsSnap] = await Promise.all([
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
    ritualsCol().where("subAccountId", "==", subAccountId).get(),
  ]);

  let income = 0;
  let expenses = 0;
  for (const doc of moneySnap.docs) {
    const d = doc.data();
    if (d.kind === "income") income += Number(d.amount) || 0;
    else expenses += Number(d.amount) || 0;
  }

  const ritualsCompleted = ritualsSnap.docs.filter((doc) =>
    ((doc.data().completedDates as string[] | undefined) ?? []).includes(date),
  ).length;

  return {
    tasksCompleted: tasksSnap.size,
    ritualsCompleted,
    income,
    netFlow: income - expenses,
    contentPublished: contentSnap.size,
    hoursTracked: 0,
  };
}

// ── Rituals ─────────────────────────────────────────────────────────────

function toRitual(id: string, data: FirebaseFirestore.DocumentData): RitualDoc {
  return { id, ...(data as Omit<RitualDoc, "id">) };
}

export async function listRituals(subAccountId: string): Promise<RitualDoc[]> {
  const snap = await ritualsCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toRitual(d.id, d.data()));
}

export async function createRitual(input: {
  agencyId: string;
  subAccountId: string;
  name: string;
  description: string;
  frequency: RitualFrequency;
  timeBlock: RitualTimeBlock;
}): Promise<RitualDoc> {
  const ref = await ritualsCol().add({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    name: input.name,
    description: input.description,
    frequency: input.frequency,
    timeBlock: input.timeBlock,
    completedDates: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toRitual(snap.id, snap.data()!);
}

export async function updateRitual(
  subAccountId: string,
  ritualId: string,
  fields: Partial<Pick<RitualDoc, "name" | "description" | "frequency" | "timeBlock">>,
): Promise<void> {
  const ref = ritualsCol().doc(ritualId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Ritual not found");
  await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

export async function toggleRitual(subAccountId: string, ritualId: string, date: string): Promise<RitualDoc> {
  const ref = ritualsCol().doc(ritualId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Ritual not found");
  const dates = new Set<string>((snap.data()?.completedDates as string[] | undefined) ?? []);
  if (dates.has(date)) dates.delete(date);
  else dates.add(date);
  await ref.update({ completedDates: [...dates], updatedAt: FieldValue.serverTimestamp() });
  const updated = await ref.get();
  return toRitual(updated.id, updated.data()!);
}

export async function deleteRitual(subAccountId: string, ritualId: string): Promise<void> {
  const ref = ritualsCol().doc(ritualId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Ritual not found");
  await ref.delete();
}

// ── Notes ───────────────────────────────────────────────────────────────

function toNote(id: string, data: FirebaseFirestore.DocumentData): NoteDoc {
  return { id, ...(data as Omit<NoteDoc, "id">) };
}

export async function listNotes(subAccountId: string): Promise<NoteDoc[]> {
  const snap = await notesCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs
    .map((d) => toNote(d.id, d.data()))
    .sort((a, b) => {
      const at = a.updatedAt instanceof Timestamp ? a.updatedAt.toMillis() : 0;
      const bt = b.updatedAt instanceof Timestamp ? b.updatedAt.toMillis() : 0;
      return bt - at;
    });
}

export async function createNote(input: {
  agencyId: string;
  subAccountId: string;
  title: string;
  content: string;
  category: string;
}): Promise<NoteDoc> {
  const ref = await notesCol().add({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    title: input.title,
    content: input.content,
    category: input.category,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toNote(snap.id, snap.data()!);
}

export async function deleteNote(subAccountId: string, noteId: string): Promise<void> {
  const ref = notesCol().doc(noteId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Note not found");
  await ref.delete();
}

// ── Memories ────────────────────────────────────────────────────────────

function toMemory(id: string, data: FirebaseFirestore.DocumentData): MemoryDoc {
  return { id, ...(data as Omit<MemoryDoc, "id">) };
}

export async function listMemories(subAccountId: string): Promise<MemoryDoc[]> {
  const snap = await memoriesCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs
    .map((d) => toMemory(d.id, d.data()))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function createMemory(input: {
  agencyId: string;
  subAccountId: string;
  title: string;
  date: string;
  reflection: string;
  linkedProjectId: string | null;
}): Promise<MemoryDoc> {
  const ref = await memoriesCol().add({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    title: input.title,
    date: input.date,
    reflection: input.reflection,
    linkedProjectId: input.linkedProjectId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toMemory(snap.id, snap.data()!);
}

export async function deleteMemory(subAccountId: string, memoryId: string): Promise<void> {
  const ref = memoriesCol().doc(memoryId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Memory not found");
  await ref.delete();
}
