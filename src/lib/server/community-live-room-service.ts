import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createLiveSessionServerSide,
  getLiveSessionServerSide,
  updateLiveSessionLifecycleServerSide,
} from "@/lib/server/live-session-service";
import type {
  CommunityLiveRoom,
  CommunityLiveRoomStatus,
} from "@/types/community";
import { createPostServerSide } from "@/lib/server/community-feed-service";

function roomCollection(subAccountId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${subAccountId}/communityGroups/${groupId}/liveRooms`
  );
}

export async function getCommunityLiveRoomServerSide(
  subAccountId: string,
  groupId: string,
  roomId: string
): Promise<CommunityLiveRoom | null> {
  const snap = await roomCollection(subAccountId, groupId).doc(roomId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<CommunityLiveRoom, "id">) };
}

export async function listCommunityLiveRoomsServerSide(
  subAccountId: string,
  groupId: string
): Promise<CommunityLiveRoom[]> {
  const snap = await roomCollection(subAccountId, groupId)
    .orderBy("createdAt", "desc")
    .limit(25)
    .get();
  return snap.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<CommunityLiveRoom, "id">),
    }))
    .filter((room) => room.status === "live");
}

export async function createCommunityLiveRoomServerSide(input: {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  createdByMemberId: string;
  title: string;
  description?: string | null;
  mode: "meeting" | "broadcast";
  channel?: string | null;
  keepAsPost?: boolean;
  notifyMembers?: boolean;
  thumbnailUrl?: string | null;
}): Promise<CommunityLiveRoom> {
  const roomRef = roomCollection(input.subAccountId, input.groupId).doc();
  const session = await createLiveSessionServerSide({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    sourceType: "community",
    sourceId: roomRef.id,
    title: input.title,
    description: input.description,
    mode: input.mode,
    status: "live",
  });
  const keepAsPost = input.keepAsPost !== false;
  let communityPostId: string | null = null;
  if (keepAsPost) {
    const post = await createPostServerSide({
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      groupId: input.groupId,
      authorMemberId: input.createdByMemberId,
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
  }
  const doc = {
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    groupId: input.groupId,
    liveSessionId: session.id,
    title: input.title.trim().slice(0, 200),
    description: input.description?.trim().slice(0, 2000) ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    mode: input.mode,
    status: "live" as const,
    createdByMemberId: input.createdByMemberId,
    channel: input.channel ?? null,
    keepAsPost,
    notifyMembers: input.notifyMembers === true,
    communityPostId,
    scheduledStartAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await roomRef.create(doc);
  return { id: roomRef.id, ...doc } as CommunityLiveRoom;
}

export async function endCommunityLiveRoomServerSide(
  subAccountId: string,
  groupId: string,
  roomId: string
): Promise<boolean> {
  const room = await getCommunityLiveRoomServerSide(
    subAccountId,
    groupId,
    roomId
  );
  if (!room) return false;
  await Promise.all([
    room.status === "live"
      ? updateLiveSessionLifecycleServerSide(room.liveSessionId, "ended")
      : Promise.resolve(),
    roomCollection(subAccountId, groupId)
      .doc(roomId)
      .update({
        status: "ended" as CommunityLiveRoomStatus,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    room.communityPostId
      ? getAdminDb()
          .doc(
            `subAccounts/${subAccountId}/communityGroups/${groupId}/posts/${room.communityPostId}`
          )
          .update({
            liveStatus: "ended",
            updatedAt: FieldValue.serverTimestamp(),
          })
      : Promise.resolve(),
  ]);
  return true;
}

export async function getCommunityLiveSessionServerSide(
  subAccountId: string,
  groupId: string,
  roomId: string
) {
  const room = await getCommunityLiveRoomServerSide(
    subAccountId,
    groupId,
    roomId
  );
  if (!room) return null;
  const session = await getLiveSessionServerSide(room.liveSessionId);
  return session?.subAccountId === subAccountId && session.sourceId === roomId
    ? { room, session }
    : null;
}
