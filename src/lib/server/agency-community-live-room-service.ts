import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createLiveSessionServerSide,
  getLiveSessionServerSide,
  updateLiveSessionLifecycleServerSide,
} from "@/lib/server/live-session-service";
import { createAgencyPostServerSide, updateAgencyPostServerSide } from "@/lib/server/community-agency-service";
import type { CommunityLiveRoom, CommunityLiveRoomStatus } from "@/types/community";
import type { AgencyPostAuthor } from "@/lib/server/community-agency-service";

/**
 * Agency Community Live Rooms — the agency-scope sibling of
 * community-live-room-service.ts, rooted at `agencies/{agencyId}/
 * communityGroups/{groupId}/liveRooms`. Deliberately does NOT build a
 * recording/replay pipeline (no `createCommunityLiveRecordingAsset`
 * equivalent) — `recordingStatus` stays permanently "unavailable" — but
 * DOES still create the companion feed post when `keepAsPost` (default
 * true), because that post is the ONLY existing mechanism a member has to
 * discover and join a live room (feed-view.tsx's `postType === "live"`
 * card) — skipping it would leave members with no way to find an active
 * room at all. The inline embedded live player on that card is agency-
 * scope-disabled (see feed-view.tsx) in favor of a "Join Live" link to the
 * dedicated live-room page, since CommunityLiveStage itself hardcodes
 * tenant URLs with no override props.
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
    notifyMembers: false,
    communityPostId,
    recordingAssetId: null,
    recordingStatus: "unavailable" as const,
    scheduledStartAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await roomRef.create(doc);
  return { id: roomRef.id, ...doc } as CommunityLiveRoom;
}

export async function endAgencyLiveRoomServerSide(
  agencyId: string,
  groupId: string,
  roomId: string,
): Promise<boolean> {
  const room = await getAgencyLiveRoomServerSide(agencyId, groupId, roomId);
  if (!room) return false;
  await Promise.all([
    room.status === "live" ? updateLiveSessionLifecycleServerSide(room.liveSessionId, "ended") : Promise.resolve(),
    roomCollection(agencyId, groupId)
      .doc(roomId)
      .update({ status: "ended" as CommunityLiveRoomStatus, updatedAt: FieldValue.serverTimestamp() }),
    room.communityPostId
      ? updateAgencyPostServerSide(agencyId, groupId, room.communityPostId, { liveStatus: "ended" })
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
