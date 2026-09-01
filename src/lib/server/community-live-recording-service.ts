import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EgressStatus,
  S3Upload,
  type EgressInfo,
} from "livekit-server-sdk";
import { getAdminDb } from "@/lib/firebase/admin";
import { livekitConfig } from "@/lib/livekit/config";
import {
  createMediaAsset,
  getMediaAsset,
  markMediaAssetFailed,
  markMediaAssetReady,
  setMediaAssetStatus,
  updateMediaAsset,
} from "@/lib/server/media-asset-service";
import { mediaStorageAdapter } from "@/lib/server/media-storage";
import { getCommunityLiveSessionServerSide } from "@/lib/server/community-live-room-service";

function egressHost(url: string) {
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function r2Output(key: string) {
  const endpoint = process.env.MAGNETIX_MEDIA_S3_ENDPOINT;
  const bucket = process.env.MAGNETIX_MEDIA_S3_BUCKET;
  const accessKey = process.env.MAGNETIX_MEDIA_S3_ACCESS_KEY_ID;
  const secret = process.env.MAGNETIX_MEDIA_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKey || !secret)
    throw new Error("Private media storage is not configured.");
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: key,
    disableManifest: true,
    output: {
      case: "s3",
      value: new S3Upload({
        endpoint,
        bucket,
        accessKey,
        secret,
        region: process.env.MAGNETIX_MEDIA_S3_REGION ?? "auto",
        forcePathStyle:
          process.env.MAGNETIX_MEDIA_S3_FORCE_PATH_STYLE === "true",
        contentDisposition: "inline",
      }),
    },
  });
}

function postRef(saId: string, groupId: string, postId: string) {
  return getAdminDb().doc(
    `subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}`
  );
}
function roomRef(saId: string, groupId: string, roomId: string) {
  return getAdminDb().doc(
    `subAccounts/${saId}/communityGroups/${groupId}/liveRooms/${roomId}`
  );
}
function sessionRef(sessionId: string) {
  return getAdminDb().collection("liveSessions").doc(sessionId);
}

export async function createCommunityLiveRecordingAsset(input: {
  agencyId: string;
  subAccountId: string;
  groupId: string;
  roomId: string;
  sessionId: string;
  uploadedByPersonId: string;
}) {
  const asset = await createMediaAsset(
    { agencyId: input.agencyId, subAccountId: input.subAccountId },
    {
      uploadedByPersonId: input.uploadedByPersonId,
      mediaType: "recording",
      source: { type: "live_session", id: input.sessionId },
      storage: {
        provider: "s3_compatible",
        key: `community-live/${input.subAccountId}/${input.groupId}/${input.roomId}/${input.sessionId}.mp4`,
        bucket: process.env.MAGNETIX_MEDIA_S3_BUCKET ?? null,
        mimeType: "video/mp4",
        fileSizeBytes: null,
      },
      access: { type: "community_group", groupId: input.groupId },
      status: "pending",
      metadata: { originalFilename: null },
    }
  );
  await sessionRef(input.sessionId).set(
    {
      settings: { recordingEnabled: true, maxParticipants: null },
      recordingStatus: "pending",
      recordingAssetId: asset.id,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return asset;
}

/** Starts one RoomComposite egress only after the host has joined. The
 * stock `speaker` layout keeps the primary share/speaker separate from its
 * participant strip; it does not reuse or depend on the browser DOM. */
export async function startCommunityLiveRecordingServerSide(input: {
  subAccountId: string;
  groupId: string;
  roomId: string;
}) {
  const found = await getCommunityLiveSessionServerSide(
    input.subAccountId,
    input.groupId,
    input.roomId
  );
  if (
    !found ||
    !found.room.keepAsPost ||
    found.room.status !== "live" ||
    found.session.status !== "live"
  )
    return { started: false, reason: "inactive" as const };
  const assetId = found.room.recordingAssetId ?? found.session.recordingAssetId;
  if (!assetId) return { started: false, reason: "unavailable" as const };
  if (
    found.session.providerEgressId ||
    found.session.recordingStatus === "processing" ||
    found.session.recordingStatus === "ready"
  )
    return { started: false, reason: "already_started" as const };
  const asset = await getMediaAsset(
    { agencyId: found.room.agencyId, subAccountId: input.subAccountId },
    assetId
  );
  if (!asset) return { started: false, reason: "unavailable" as const };
  try {
    const { url, apiKey, apiSecret } = livekitConfig();
    const egress = await new EgressClient(
      egressHost(url),
      apiKey,
      apiSecret
    ).startRoomCompositeEgress(
      found.session.providerRoomName,
      r2Output(asset.storage.key),
      { layout: "speaker" }
    );
    await Promise.all([
      setMediaAssetStatus(
        { agencyId: found.room.agencyId, subAccountId: input.subAccountId },
        asset.id,
        "processing"
      ),
      sessionRef(found.session.id).set(
        {
          providerEgressId: egress.egressId,
          recordingStatus: "processing",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      roomRef(input.subAccountId, input.groupId, input.roomId).set(
        {
          recordingStatus: "processing",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
    ]);
    return { started: true, egressId: egress.egressId };
  } catch (error) {
    await Promise.all([
      markMediaAssetFailed(
        { agencyId: found.room.agencyId, subAccountId: input.subAccountId },
        asset.id
      ),
      sessionRef(found.session.id).set(
        { recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      ),
      roomRef(input.subAccountId, input.groupId, input.roomId).set(
        { recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      ),
    ]);
    throw error;
  }
}

export async function stopCommunityLiveRecordingServerSide(sessionId: string) {
  const snap = await sessionRef(sessionId).get();
  const session = snap.data() as
    | { providerEgressId?: string | null; recordingStatus?: string }
    | undefined;
  if (!session?.providerEgressId || session.recordingStatus !== "processing")
    return;
  const { url, apiKey, apiSecret } = livekitConfig();
  await new EgressClient(egressHost(url), apiKey, apiSecret).stopEgress(
    session.providerEgressId
  );
}

/** Idempotently consumes the verified terminal egress webhook. */
export async function reconcileCommunityRecordingEgressServerSide(
  egress: EgressInfo
) {
  if (
    egress.status !== EgressStatus.EGRESS_COMPLETE &&
    egress.status !== EgressStatus.EGRESS_FAILED &&
    egress.status !== EgressStatus.EGRESS_ABORTED &&
    egress.status !== EgressStatus.EGRESS_LIMIT_REACHED
  )
    return;
  const match = await getAdminDb()
    .collection("liveSessions")
    .where("providerEgressId", "==", egress.egressId)
    .limit(1)
    .get();
  if (match.empty) return;
  const sessionDoc = match.docs[0];
  const session = sessionDoc.data() as {
    agencyId: string | null;
    subAccountId: string | null;
    sourceType: string;
    sourceId: string | null;
    recordingAssetId?: string | null;
    replayAssetId?: string | null;
    recordingStatus?: string;
  };
  if (
    !session.agencyId ||
    !session.subAccountId ||
    session.sourceType !== "community" ||
    !session.sourceId ||
    !session.recordingAssetId
  )
    return;
  const rooms = await getAdminDb()
    .collectionGroup("liveRooms")
    .where("liveSessionId", "==", sessionDoc.id)
    .limit(1)
    .get();
  if (rooms.empty) return;
  const room = rooms.docs[0];
  const roomData = room.data() as {
    groupId: string;
    communityPostId: string | null;
  };
  const tenant = {
    agencyId: session.agencyId,
    subAccountId: session.subAccountId,
  };
  const asset = await getMediaAsset(tenant, session.recordingAssetId);
  if (
    !asset ||
    session.recordingStatus === "ready" ||
    session.recordingStatus === "failed"
  )
    return;
  const terminalOk = egress.status === EgressStatus.EGRESS_COMPLETE;
  const object = terminalOk
    ? await mediaStorageAdapter("s3_compatible").inspectObject(
        asset.storage.key
      )
    : null;
  if (terminalOk && object) {
    await Promise.all([
      updateMediaAsset(tenant, asset.id, { metadata: { ...asset.metadata } }),
      markMediaAssetReady(tenant, asset.id),
      sessionRef(sessionDoc.id).set(
        {
          recordingStatus: "ready",
          replayAssetId: asset.id,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      room.ref.set(
        { recordingStatus: "ready", updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      ),
      ...(roomData.communityPostId
        ? [
            postRef(
              session.subAccountId,
              roomData.groupId,
              roomData.communityPostId
            ).set(
              {
                replayStatus: "ready",
                replayAssetId: asset.id,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            ),
          ]
        : []),
    ]);
    await updateMediaAsset(tenant, asset.id, {
      metadata: { ...asset.metadata },
    });
    await getAdminDb()
      .doc(`subAccounts/${session.subAccountId}/mediaAssets/${asset.id}`)
      .set(
        {
          storage: {
            ...asset.storage,
            mimeType: object.mimeType ?? asset.storage.mimeType,
            fileSizeBytes: object.fileSizeBytes,
          },
          metadata: {
            ...asset.metadata,
            durationMs: egress.fileResults[0]
              ? Number(egress.fileResults[0].duration)
              : null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return;
  }
  await Promise.all([
    markMediaAssetFailed(tenant, asset.id),
    sessionRef(sessionDoc.id).set(
      { recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    ),
    room.ref.set(
      { recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    ),
    ...(roomData.communityPostId
      ? [
          postRef(
            session.subAccountId,
            roomData.groupId,
            roomData.communityPostId
          ).set(
            { replayStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          ),
        ]
      : []),
  ]);
}
