import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createLiveSessionServerSide,
  getLiveSessionServerSide,
  updateLiveSessionLifecycleServerSide,
} from "@/lib/server/live-session-service";
import type {
  CommunityEvent,
  CommunityEventLocationType,
} from "@/types/community";

function eventsCollection(subAccountId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${subAccountId}/communityGroups/${groupId}/events`
  );
}

function eventFromDoc(
  id: string,
  data: FirebaseFirestore.DocumentData
): CommunityEvent {
  return { id, ...(data as Omit<CommunityEvent, "id">) };
}

export async function getCommunityEventServerSide(
  subAccountId: string,
  groupId: string,
  eventId: string
): Promise<CommunityEvent | null> {
  const snap = await eventsCollection(subAccountId, groupId).doc(eventId).get();
  return snap.exists ? eventFromDoc(snap.id, snap.data() ?? {}) : null;
}

export async function listCommunityEventsServerSide(
  subAccountId: string,
  groupId: string
): Promise<CommunityEvent[]> {
  const snap = await eventsCollection(subAccountId, groupId).limit(100).get();
  return snap.docs
    .map((doc) => eventFromDoc(doc.id, doc.data()))
    .sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt));
}

function toMillis(value: unknown): number {
  const v = value as { toMillis?: () => number; seconds?: number } | null;
  if (typeof v?.toMillis === "function") return v.toMillis();
  return typeof v?.seconds === "number" ? v.seconds * 1000 : 0;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("External URL must use http or https.");
  return url.toString();
}

export async function createCommunityEventServerSide(input: {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  createdByMemberId: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  channel?: string | null;
  locationType: CommunityEventLocationType;
  externalUrl?: string | null;
  liveMode?: "meeting" | "broadcast";
}): Promise<CommunityEvent> {
  const eventRef = eventsCollection(input.subAccountId, input.groupId).doc();
  let liveSessionId: string | null = null;
  if (input.locationType === "magnetix_live") {
    const session = await createLiveSessionServerSide({
      agencyId: input.agencyId,
      subAccountId: input.subAccountId,
      sourceType: "community",
      sourceId: eventRef.id,
      title: input.title,
      description: input.description,
      mode: input.liveMode ?? "meeting",
      status: "scheduled",
      scheduledStartAt: input.startAt,
      scheduledEndAt: input.endAt,
    });
    liveSessionId = session.id;
  }
  const doc = {
    subAccountId: input.subAccountId,
    groupId: input.groupId,
    title: input.title.trim().slice(0, 200),
    description: input.description?.trim().slice(0, 4000) ?? "",
    startAt: input.startAt,
    endAt: input.endAt,
    timezone: input.timezone,
    status: "scheduled" as const,
    channel: input.channel ?? null,
    locationType: input.locationType,
    externalUrl:
      input.locationType === "external"
        ? normalizeUrl(input.externalUrl)
        : null,
    liveSessionId,
    liveMode:
      input.locationType === "magnetix_live"
        ? (input.liveMode ?? "meeting")
        : null,
    createdByMemberId: input.createdByMemberId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await eventRef.create(doc);
  return { id: eventRef.id, ...doc } as unknown as CommunityEvent;
}

export async function updateCommunityEventLifecycleServerSide(
  subAccountId: string,
  groupId: string,
  eventId: string,
  status: "live" | "ended" | "canceled"
): Promise<CommunityEvent | null> {
  const event = await getCommunityEventServerSide(
    subAccountId,
    groupId,
    eventId
  );
  if (!event) return null;
  if (event.liveSessionId) {
    await updateLiveSessionLifecycleServerSide(event.liveSessionId, status);
  }
  const ref = eventsCollection(subAccountId, groupId).doc(eventId);
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  return getCommunityEventServerSide(subAccountId, groupId, eventId);
}

export async function getCommunityEventSessionServerSide(
  subAccountId: string,
  groupId: string,
  eventId: string
) {
  const event = await getCommunityEventServerSide(
    subAccountId,
    groupId,
    eventId
  );
  if (!event?.liveSessionId) return null;
  const session = await getLiveSessionServerSide(event.liveSessionId);
  return session?.subAccountId === subAccountId && session.sourceId === eventId
    ? { event, session }
    : null;
}
