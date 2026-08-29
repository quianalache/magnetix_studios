import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  LiveSession,
  LiveSessionMode,
  LiveSessionRole,
  LiveSessionSourceType,
  LiveSessionStatus,
} from "@/types/live-session";

const COLLECTION = "liveSessions";

function sessionRef(id: string) {
  return getAdminDb().collection(COLLECTION).doc(id);
}

export function providerRoomNameForSession(sessionId: string): string {
  return `magnetix-live-${sessionId}`;
}

export async function getLiveSessionServerSide(
  sessionId: string
): Promise<LiveSession | null> {
  if (!sessionId || sessionId.length > 128) return null;
  const snap = await sessionRef(sessionId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<LiveSession, "id">) };
}

export async function getLiveSessionByProviderRoomServerSide(
  roomName: string
): Promise<LiveSession | null> {
  if (!roomName || roomName.length > 160) return null;
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .where("providerRoomName", "==", roomName)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<LiveSession, "id">) };
}

export async function createLiveSessionServerSide(input: {
  id?: string;
  agencyId?: string | null;
  subAccountId?: string | null;
  sourceType: LiveSessionSourceType;
  sourceId?: string | null;
  title: string;
  description?: string | null;
  mode?: LiveSessionMode;
  status?: LiveSessionStatus;
  hostPersonId?: string | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
}): Promise<LiveSession> {
  const ref = input.id
    ? sessionRef(input.id)
    : getAdminDb().collection(COLLECTION).doc();
  const existing = await ref.get();
  if (existing.exists)
    return { id: ref.id, ...(existing.data() as Omit<LiveSession, "id">) };
  const doc = {
    agencyId: input.agencyId ?? null,
    subAccountId: input.subAccountId ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    title: input.title.trim().slice(0, 200),
    description: input.description?.trim().slice(0, 2000) ?? null,
    mode: input.mode ?? "meeting",
    status: input.status ?? "scheduled",
    scheduledStartAt: input.scheduledStartAt ?? null,
    scheduledEndAt: input.scheduledEndAt ?? null,
    actualStartedAt: null,
    actualEndedAt: null,
    provider: "livekit" as const,
    providerRoomName: providerRoomNameForSession(ref.id),
    hostPersonId: input.hostPersonId ?? null,
    settings: { recordingEnabled: false, maxParticipants: null },
    recordingStatus: "disabled" as const,
    providerEgressId: null,
    replayAssetId: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.create(doc);
  return { id: ref.id, ...doc } as LiveSession;
}

export async function getOrCreateInternalPocSessionServerSide(): Promise<LiveSession> {
  return createLiveSessionServerSide({
    id: "internal-livekit-poc",
    sourceType: "internal",
    title: "Magnetix Live Internal Proof of Concept",
  });
}

export async function updateLiveSessionLifecycleServerSide(
  sessionId: string,
  status: LiveSessionStatus
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (status === "live") updates.actualStartedAt = FieldValue.serverTimestamp();
  if (status === "ended" || status === "canceled")
    updates.actualEndedAt = FieldValue.serverTimestamp();
  await sessionRef(sessionId).update(updates);
}

export function roleCanPublish(role: LiveSessionRole): boolean {
  return (
    role === "HOST" ||
    role === "CO_HOST" ||
    role === "PRESENTER" ||
    role === "SPEAKER"
  );
}

export function rolePermissions(role: LiveSessionRole) {
  return {
    canSubscribe: true,
    canPublish: roleCanPublish(role),
    canPublishData: true,
  };
}
