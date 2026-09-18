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
import { mediaStorageAdapter } from "@/lib/server/media-storage";
import { getAgencyLiveSessionServerSide } from "@/lib/server/agency-community-live-room-service";
import { updateAgencyPostServerSide } from "@/lib/server/community-agency-service";

/**
 * Agency Community — Live Room recording/replay, the agency-scope sibling
 * of community-live-recording-service.ts. The LiveKit egress lifecycle
 * itself is already scope-agnostic infrastructure (`liveSessions` is a
 * single global, unscoped collection — see live-session-service.ts —
 * hence `stopCommunityLiveRecordingServerSide` is reused directly for
 * agency, unchanged, from that file).
 *
 * The one real adaptation: `media-asset-service.ts` hardcodes
 * `subAccounts/{subAccountId}/mediaAssets` and requires a non-null
 * `subAccountId` on every asset, so it has no home for an agency-owned
 * recording. Rather than widen that shared, foundational service (used
 * across the whole product, well beyond Community) to a nullable tenant
 * key, this keeps a lightweight, PARALLEL asset record scoped to
 * `agencies/{agencyId}/mediaAssets/{assetId}` — just enough fields
 * (storage key/bucket/mimeType, status) to drive the SAME egress-to-R2
 * pipeline and the SAME `mediaStorageAdapter` used for signed playback
 * URLs. Access control for the signed URL is enforced by the caller
 * (`resolveAgencyCommunityCaller` at the route layer, matching every
 * other agency Community route) rather than the generic
 * `resolveMediaAssetAccess` policy engine, since this is a single,
 * narrow surface (one owner-or-member-of-this-exact-group check), not a
 * general-purpose asset access policy.
 */

interface AgencyRecordingAsset {
  id: string;
  agencyId: string;
  groupId: string;
  status: "pending" | "processing" | "ready" | "failed";
  storage: { provider: "s3_compatible"; key: string; bucket: string | null; mimeType: string; fileSizeBytes: number | null };
}

function assetsCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/mediaAssets`);
}

function roomRef(agencyId: string, groupId: string, roomId: string) {
  return getAdminDb().doc(`agencies/${agencyId}/communityGroups/${groupId}/liveRooms/${roomId}`);
}

function sessionRef(sessionId: string) {
  return getAdminDb().collection("liveSessions").doc(sessionId);
}

function egressHost(url: string) {
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function r2Output(key: string) {
  const endpoint = process.env.MAGNETIX_MEDIA_S3_ENDPOINT;
  const bucket = process.env.MAGNETIX_MEDIA_S3_BUCKET;
  const accessKey = process.env.MAGNETIX_MEDIA_S3_ACCESS_KEY_ID;
  const secret = process.env.MAGNETIX_MEDIA_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKey || !secret) {
    throw new Error("Private media storage is not configured.");
  }
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
        forcePathStyle: process.env.MAGNETIX_MEDIA_S3_FORCE_PATH_STYLE === "true",
        contentDisposition: "inline",
      }),
    },
  });
}

/**
 * Enumerate only this agency's groups, then read the exact room doc in
 * each — mirrors tenant `findCommunityLiveRoomForSession`'s no-collection-
 * group-index approach exactly.
 */
export async function findAgencyLiveRoomForSession(
  agencyId: string,
  roomId: string,
  liveSessionId: string,
) {
  const groups = await getAdminDb().collection(`agencies/${agencyId}/communityGroups`).get();
  const rooms = await Promise.all(groups.docs.map((group) => group.ref.collection("liveRooms").doc(roomId).get()));
  return rooms.find((room) => room.exists && room.data()?.liveSessionId === liveSessionId) ?? null;
}

export async function createAgencyLiveRecordingAsset(input: {
  agencyId: string;
  groupId: string;
  roomId: string;
  sessionId: string;
}): Promise<AgencyRecordingAsset> {
  const ref = assetsCol(input.agencyId).doc();
  const doc: Omit<AgencyRecordingAsset, "id"> & { createdAt: FieldValue; updatedAt: FieldValue } = {
    agencyId: input.agencyId,
    groupId: input.groupId,
    status: "pending",
    storage: {
      provider: "s3_compatible",
      key: `community-live/agency/${input.agencyId}/${input.groupId}/${input.roomId}/${input.sessionId}.mp4`,
      bucket: process.env.MAGNETIX_MEDIA_S3_BUCKET ?? null,
      mimeType: "video/mp4",
      fileSizeBytes: null,
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc);
  await sessionRef(input.sessionId).set(
    { recordingStatus: "pending", recordingAssetId: ref.id, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { id: ref.id, ...doc };
}

async function getAgencyRecordingAsset(agencyId: string, assetId: string): Promise<AgencyRecordingAsset | null> {
  const snap = await assetsCol(agencyId).doc(assetId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<AgencyRecordingAsset, "id">) };
}

async function setAgencyAssetStatus(agencyId: string, assetId: string, status: AgencyRecordingAsset["status"]) {
  await assetsCol(agencyId).doc(assetId).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Starts one RoomComposite egress only after the host has joined — mirrors
 *  tenant `startCommunityLiveRecordingServerSide` exactly. */
export async function startAgencyLiveRecordingServerSide(input: {
  agencyId: string;
  groupId: string;
  roomId: string;
}) {
  const found = await getAgencyLiveSessionServerSide(input.agencyId, input.groupId, input.roomId);
  if (!found || !found.room.keepAsPost || found.room.status !== "live" || found.session.status !== "live") {
    return { started: false, reason: "inactive" as const };
  }
  const assetId = found.room.recordingAssetId ?? found.session.recordingAssetId;
  if (!assetId) return { started: false, reason: "unavailable" as const };
  if (
    found.session.providerEgressId ||
    found.session.recordingStatus === "processing" ||
    found.session.recordingStatus === "ready"
  ) {
    return { started: false, reason: "already_started" as const };
  }
  const asset = await getAgencyRecordingAsset(input.agencyId, assetId);
  if (!asset) return { started: false, reason: "unavailable" as const };
  try {
    const { url, apiKey, apiSecret } = livekitConfig();
    const egress = await new EgressClient(egressHost(url), apiKey, apiSecret).startRoomCompositeEgress(
      found.session.providerRoomName,
      r2Output(asset.storage.key),
      { layout: "speaker" },
    );
    await Promise.all([
      setAgencyAssetStatus(input.agencyId, asset.id, "processing"),
      sessionRef(found.session.id).set(
        { providerEgressId: egress.egressId, recordingStatus: "processing", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
      roomRef(input.agencyId, input.groupId, input.roomId).set(
        { recordingStatus: "processing", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
    ]);
    return { started: true, egressId: egress.egressId };
  } catch (error) {
    await Promise.all([
      setAgencyAssetStatus(input.agencyId, asset.id, "failed"),
      sessionRef(found.session.id).set(
        { recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
      roomRef(input.agencyId, input.groupId, input.roomId).set(
        { recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
    ]);
    throw error;
  }
}

/** Idempotently consumes the verified terminal egress webhook for an
 *  agency-owned session — mirrors tenant
 *  `reconcileCommunityRecordingEgressServerSide`, minus the CRM workflow-
 *  event emission (Contact-based marketing automation has no agency
 *  analog). A no-op for any tenant session (guarded by `!session.agencyId
 *  || session.subAccountId` below), so this is always safe to call
 *  alongside the tenant reconciler for every webhook event. */
export async function reconcileAgencyRecordingEgressServerSide(egress: EgressInfo) {
  if (
    egress.status !== EgressStatus.EGRESS_COMPLETE &&
    egress.status !== EgressStatus.EGRESS_FAILED &&
    egress.status !== EgressStatus.EGRESS_ABORTED &&
    egress.status !== EgressStatus.EGRESS_LIMIT_REACHED
  ) {
    return;
  }
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
    recordingStatus?: string;
  };
  if (!session.agencyId || session.subAccountId || session.sourceType !== "community" || !session.sourceId || !session.recordingAssetId) {
    return;
  }
  const room = await findAgencyLiveRoomForSession(session.agencyId, session.sourceId, sessionDoc.id);
  if (!room) return;
  const roomData = room.data() as { groupId: string; communityPostId: string | null };
  const asset = await getAgencyRecordingAsset(session.agencyId, session.recordingAssetId);
  if (!asset || session.recordingStatus === "ready" || session.recordingStatus === "failed") return;

  const terminalOk = egress.status === EgressStatus.EGRESS_COMPLETE;
  const object = terminalOk ? await mediaStorageAdapter("s3_compatible").inspectObject(asset.storage.key) : null;

  if (terminalOk && object) {
    await Promise.all([
      assetsCol(session.agencyId)
        .doc(asset.id)
        .set(
          {
            status: "ready",
            storage: { ...asset.storage, mimeType: object.mimeType ?? asset.storage.mimeType, fileSizeBytes: object.fileSizeBytes },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      sessionRef(sessionDoc.id).set(
        { recordingStatus: "ready", replayAssetId: asset.id, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
      room.ref.set({ recordingStatus: "ready", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      roomData.communityPostId
        ? updateAgencyPostServerSide(session.agencyId, roomData.groupId, roomData.communityPostId, {
            replayStatus: "ready",
            replayAssetId: asset.id,
          })
        : Promise.resolve(),
    ]);
    return;
  }

  await Promise.all([
    setAgencyAssetStatus(session.agencyId, asset.id, "failed"),
    sessionRef(sessionDoc.id).set({ recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    room.ref.set({ recordingStatus: "failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    roomData.communityPostId
      ? updateAgencyPostServerSide(session.agencyId, roomData.groupId, roomData.communityPostId, { replayStatus: "failed" })
      : Promise.resolve(),
  ]);
}

/** Resolve a short-lived signed replay URL for an agency-owned recording
 *  asset. Callers are responsible for verifying the viewer is the agency
 *  owner or an active member of this exact group before calling (see
 *  `resolveAgencyCommunityCaller` at the route layer) — this function
 *  performs no further access check of its own. */
export async function resolveAgencyReplayUrl(opts: {
  agencyId: string;
  assetId: string;
  expiresInSeconds?: number;
}) {
  const asset = await getAgencyRecordingAsset(opts.agencyId, opts.assetId);
  if (!asset || asset.status !== "ready") return null;
  return mediaStorageAdapter(asset.storage.provider).createAuthorizedUrl({
    key: asset.storage.key,
    disposition: "inline",
    expiresInSeconds: opts.expiresInSeconds,
  });
}
