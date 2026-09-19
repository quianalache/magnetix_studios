import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createLiveSessionServerSide,
  getLiveSessionServerSide,
  updateLiveSessionLifecycleServerSide,
} from "@/lib/server/live-session-service";
import {
  createAgencyPostServerSide,
  updateAgencyPostServerSide,
  notifyAgencyCommunityLiveStarted,
} from "@/lib/server/community-agency-service";
import { createAgencyLiveRecordingAsset } from "@/lib/server/agency-community-live-recording-service";
import { stopCommunityLiveRecordingServerSide } from "@/lib/server/community-live-recording-service";
import type { CommunityLiveRoom, CommunityLiveRoomStatus } from "@/types/community";
import type { AgencyPostAuthor } from "@/lib/server/community-agency-service";

/**
 * Agency Community Live Rooms — the agency-scope sibling of
 * community-live-room-service.ts, rooted at `agencies/{agencyId}/
 * communityGroups/{groupId}/liveRooms`. Now has full recording/replay
 * parity (see agency-community-live-recording-service.ts) — creates a
 * recording asset alongside the companion feed post when `keepAsPost`
 * (default true), same as tenant. `stopCommunityLiveRecordingServerSide`
 * is reused directly, unchanged — the LiveKit egress stop call only needs
 * a `sessionId` and touches nothing tenant-scoped (see that file's own
 * doc comment).
 */

function roomCollection(agencyId: string, groupId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups/${groupId}/liveRooms`);
}

export async function getAgencyLiveRoomServerSide(
  agencyId: string,
  groupId: string,
  roomId: string,
): Promise<CommunityLiveRoom | null> {
  const snap = await roomCollection(agencyId, groupId).doc(roomId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<CommunityLiveRoom, "id">) };
}

export async function listAgencyLiveRoomsServerSide(
  agencyId: string,
  groupId: string,
): Promise<CommunityLiveRoom[]> {
  const snap = await roomCollection(agencyId, groupId).orderBy("createdAt", "desc").limit(25).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CommunityLiveRoom, "id">) }))
    .filter((room) => room.status === "live");
}

export async function createAgencyLiveRoomServerSide(input: {
  agencyId: string;
  groupId: string;
  author: AgencyPostAuthor;
  title: string;
  description?: string | null;
  mode: "meeting" | "broadcast";
  channel?: string | null;
  keepAsPost?: boolean;
  notifyMembers?: boolean;
  thumbnailUrl?: string | null;
}): Promise<CommunityLiveRoom> {
  const roomRef = roomCollection(input.agencyId, input.groupId).doc();
  const session = await createLiveSessionServerSide({
    agencyId: input.agencyId,
    subAccountId: null,
    sourceType: "community",
    sourceId: roomRef.id,
    title: input.title,
    description: input.description,
    mode: input.mode,
    status: "live",
  });
  const keepAsPost = input.keepAsPost !== false;
  let communityPostId: string | null = null;
  let recordingAssetId: string | null = null;
  if (keepAsPost) {
    const post = await createAgencyPostServerSide({
      agencyId: input.agencyId,
      groupId: input.groupId,
      author: input.author,
      title: input.title,
      body: input.description ?? "",
      category: input.channel ?? null,
      postType: "live",
      liveSessionId: session.id,
      liveRoomId: roomRef.id,
      liveMode: input.mode,
      liveStatus: "live",
      thumbnailUrl: input.thumbnailUrl ?? null,
    });
    communityPostId = post.id;
    try {
      const asset = await createAgencyLiveRecordingAsset({
        agencyId: input.agencyId,
        groupId: input.groupId,
        roomId: roomRef.id,
        sessionId: session.id,
      });
      recordingAssetId = asset.id;
    } catch {
      // Starting a live room must not fail because recording storage is
      // temporarily unavailable — mirrors tenant's own fallback exactly.
      await getAdminDb().collection("liveSessions").doc(session.id).set(
        { recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      await updateAgencyPostServerSide(input.agencyId, input.groupId, post.id, { replayStatus: "unavailable" });
    }
  }
  const doc = {
    agencyId: input.agencyId,
    groupId: input.groupId,
    liveSessionId: session.id,
    title: input.title.trim().slice(0, 200),
    description: input.description?.trim().slice(0, 2000) ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    mode: input.mode,
    status: "live" as const,
    createdByMemberId: input.author.kind === "owner" ? input.author.uid : input.author.personId,
    channel: input.channel ?? null,
    keepAsPost,
    notifyMembers: input.notifyMembers === true,
    communityPostId,
    recordingAssetId,
    recordingStatus: recordingAssetId ? ("pending" as const) : ("unavailable" as const),
    scheduledStartAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await roomRef.create(doc);
  // The room is now durably LIVE; never notify while the setup dialog is
  // merely open — mirrors tenant's exact same ordering/reasoning.
  if (doc.notifyMembers) {
    await notifyAgencyCommunityLiveStarted({
      agencyId: input.agencyId,
      groupId: input.groupId,
      roomId: roomRef.id,
      title: doc.title,
      channel: doc.channel,
      hostPersonId: input.author.kind === "member" ? input.author.personId : null,
    });
  }
  return { id: roomRef.id, ...doc } as CommunityLiveRoom;
}

export async function endAgencyLiveRoomServerSide(
  agencyId: string,
  groupId: string,
  roomId: string,
): Promise<boolean> {
  const room = await getAgencyLiveRoomServerSide(agencyId, groupId, roomId);
  if (!room) return false;
  // A processing status is only set after LiveKit accepted an egress. The
  // stop request allows its verified terminal webhook to finalize the
  // asset — mirrors tenant `endCommunityLiveRoomServerSide` exactly.
  if (room.status === "live") {
    try {
      await stopCommunityLiveRecordingServerSide(room.liveSessionId);
    } catch {
      // Do not erase a confirmed processing state: LiveKit may still send
      // the terminal webhook after a transient stop request failure.
    }
  }
  const recordingProcessing = room.recordingStatus === "processing";
  await Promise.all([
    room.status === "live" ? updateLiveSessionLifecycleServerSide(room.liveSessionId, "ended") : Promise.resolve(),
    roomCollection(agencyId, groupId)
      .doc(roomId)
      .update({ status: "ended" as CommunityLiveRoomStatus, updatedAt: FieldValue.serverTimestamp() }),
    room.communityPostId
      ? updateAgencyPostServerSide(agencyId, groupId, room.communityPostId, {
          liveStatus: "ended",
          ...(recordingProcessing
            ? { replayStatus: "processing" as const }
            : room.recordingStatus === "failed" || room.recordingStatus === "unavailable"
              ? { replayStatus: room.recordingStatus }
              : {}),
        })
      : Promise.resolve(),
  ]);
  return true;
}

export async function getAgencyLiveSessionServerSide(agencyId: string, groupId: string, roomId: string) {
  const room = await getAgencyLiveRoomServerSide(agencyId, groupId, roomId);
  if (!room) return null;
  const session = await getLiveSessionServerSide(room.liveSessionId);
  return session?.agencyId === agencyId && session.sourceId === roomId ? { room, session } : null;
}
