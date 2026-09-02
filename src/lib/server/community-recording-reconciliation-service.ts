import "server-only";

import {
  EgressClient,
  EgressStatus,
  type EgressInfo,
} from "livekit-server-sdk";
import { getAdminDb } from "@/lib/firebase/admin";
import { livekitConfig } from "@/lib/livekit/config";
import { mediaStorageAdapter } from "@/lib/server/media-storage";
import { getMediaAsset } from "@/lib/server/media-asset-service";
import {
  findCommunityLiveRoomForSession,
  reconcileCommunityRecordingEgressServerSide,
} from "@/lib/server/community-live-recording-service";

const TERMINAL_STATUSES = new Set([
  EgressStatus.EGRESS_COMPLETE,
  EgressStatus.EGRESS_FAILED,
  EgressStatus.EGRESS_ABORTED,
  EgressStatus.EGRESS_LIMIT_REACHED,
]);

function egressHost(url: string) {
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function postRef(saId: string, groupId: string, postId: string) {
  return getAdminDb().doc(
    `subAccounts/${saId}/communityGroups/${groupId}/posts/${postId}`
  );
}

function roomPathParts(path: string) {
  const match = path.match(
    /^subAccounts\/([^/]+)\/communityGroups\/([^/]+)\/liveRooms\/([^/]+)$/
  );
  return match
    ? { subAccountId: match[1], groupId: match[2], roomId: match[3] }
    : null;
}

function outputPath(egress: EgressInfo): string | null {
  if (egress.request.case !== "roomComposite") return null;
  const request = egress.request.value;
  if (request.output.case === "file") return request.output.value.filepath;
  return request.fileOutputs[0]?.filepath ?? null;
}

function isTerminal(egress: EgressInfo) {
  return TERMINAL_STATUSES.has(egress.status);
}

function logStageFailure(
  providerEgressId: string,
  stage: string,
  error: unknown
) {
  console.error("[community-recording-reconciliation] stage failed", {
    providerEgressId,
    stage,
    errorName: error instanceof Error ? error.name : "unknown",
    errorMessage: error instanceof Error ? error.message : "unknown",
  });
}

async function atStage<T>(
  providerEgressId: string,
  stage: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logStageFailure(providerEgressId, stage, error);
    throw error;
  }
}

export interface CommunityRecordingReconciliationPlan {
  providerEgressId: string;
  egressStatus: string;
  egressRoomName: string | null;
  egressOutputPath: string | null;
  r2ObjectExists: boolean;
  r2ObjectSize: number | null;
  r2ObjectContentType: string | null;
  mediaAssetStatus: string | null;
  postReplayStatus: string | null;
  liveSessionId: string | null;
  mediaAssetId: string | null;
  communityPostId: string | null;
  recoverable: boolean;
  wouldFinalize: boolean;
  wouldFail: boolean;
  reason: string;
}

async function getEgress(providerEgressId: string): Promise<EgressInfo | null> {
  const { url, apiKey, apiSecret } = livekitConfig();
  const rows = await atStage(providerEgressId, "livekit_egress_lookup", () =>
    new EgressClient(egressHost(url), apiKey, apiSecret).listEgress({
      egressId: providerEgressId,
    })
  );
  return rows[0] ?? null;
}

export async function inspectCommunityRecordingReconciliation(
  providerEgressId: string
): Promise<{
  plan: CommunityRecordingReconciliationPlan;
  egress: EgressInfo | null;
}> {
  const egress = await getEgress(providerEgressId);
  const empty = (reason: string): CommunityRecordingReconciliationPlan => ({
    providerEgressId,
    egressStatus: egress ? String(egress.status) : "not_found",
    egressRoomName: egress?.roomName || null,
    egressOutputPath: egress ? outputPath(egress) : null,
    r2ObjectExists: false,
    r2ObjectSize: null,
    r2ObjectContentType: null,
    mediaAssetStatus: null,
    postReplayStatus: null,
    liveSessionId: null,
    mediaAssetId: null,
    communityPostId: null,
    recoverable: false,
    wouldFinalize: false,
    wouldFail: false,
    reason,
  });
  if (!egress) return { plan: empty("Egress was not found."), egress };
  if (!isTerminal(egress))
    return { plan: empty("Egress is still active."), egress };

  const match = await atStage(providerEgressId, "live_session_lookup", () =>
    getAdminDb()
      .collection("liveSessions")
      .where("providerEgressId", "==", providerEgressId)
      .limit(1)
      .get()
  );
  if (match.empty)
    return {
      plan: empty("No Magnetix LiveSession references this Egress."),
      egress,
    };

  const sessionDoc = match.docs[0];
  const session = sessionDoc.data() as {
    agencyId?: string | null;
    subAccountId?: string | null;
    sourceType?: string;
    sourceId?: string | null;
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
    return {
      plan: empty(
        "LiveSession is not a complete Community recording relation."
      ),
      egress,
    };

  const room = await atStage(providerEgressId, "community_room_lookup", () =>
    findCommunityLiveRoomForSession(
      session.subAccountId!,
      session.sourceId!,
      sessionDoc.id
    )
  );
  if (!room)
    return {
      plan: empty("No Community live room references this LiveSession."),
      egress,
    };
  const parts = roomPathParts(room.ref.path);
  const roomData = room.data() as {
    groupId?: string;
    communityPostId?: string | null;
    recordingAssetId?: string | null;
  };
  if (
    !parts ||
    parts.subAccountId !== session.subAccountId ||
    parts.roomId !== session.sourceId ||
    !roomData.groupId ||
    roomData.groupId !== parts.groupId
  )
    return {
      plan: empty("Community room relation does not match the LiveSession."),
      egress,
    };

  const asset = await atStage(providerEgressId, "media_asset_lookup", () =>
    getMediaAsset(
      { agencyId: session.agencyId!, subAccountId: session.subAccountId! },
      session.recordingAssetId!
    )
  );
  if (!asset)
    return { plan: empty("Recording MediaAsset was not found."), egress };

  const expectedKey = `community-live/${session.subAccountId}/${parts.groupId}/${parts.roomId}/${sessionDoc.id}.mp4`;
  if (
    asset.source?.type !== "live_session" ||
    asset.source.id !== sessionDoc.id ||
    asset.storage.key !== expectedKey
  )
    return {
      plan: empty(
        "MediaAsset source or storage key does not match the trusted recording relation."
      ),
      egress,
    };

  const object =
    egress.status === EgressStatus.EGRESS_COMPLETE
      ? await atStage(providerEgressId, "r2_head_object", () =>
          mediaStorageAdapter("s3_compatible").inspectObject(expectedKey)
        )
      : null;
  const exists = Boolean(object && (object.fileSizeBytes ?? 0) > 0);
  const roomName = egress.roomName || null;
  const expectedRoomName = `magnetix-live-${sessionDoc.id}`;
  const filePath = outputPath(egress);
  const providerMatches =
    roomName === expectedRoomName && filePath === expectedKey;
  const complete = egress.status === EgressStatus.EGRESS_COMPLETE;
  const post = roomData.communityPostId
    ? await atStage(providerEgressId, "community_post_lookup", () =>
        postRef(
          session.subAccountId!,
          parts.groupId,
          roomData.communityPostId!
        ).get()
      )
    : null;
  const postData = post?.exists
    ? (post.data() as { replayStatus?: string })
    : null;
  const currentProcessing =
    session.recordingStatus === "processing" && asset.status === "processing";
  const postExists = Boolean(roomData.communityPostId && post?.exists);
  const wouldFinalize =
    complete && exists && providerMatches && currentProcessing && postExists;
  const wouldFail =
    !complete &&
    currentProcessing &&
    (egress.status === EgressStatus.EGRESS_FAILED ||
      egress.status === EgressStatus.EGRESS_ABORTED ||
      egress.status === EgressStatus.EGRESS_LIMIT_REACHED);
  let reason = "No mutation is appropriate.";
  if (wouldFinalize)
    reason =
      "Completed Egress and non-empty matching R2 object would be finalized.";
  else if (wouldFail) reason = "Terminal failed Egress would be marked failed.";
  else if (complete && !exists)
    reason = "Egress completed but the expected R2 object is missing or empty.";
  else if (complete && !providerMatches)
    reason =
      "Egress room or output path does not match trusted Magnetix records.";
  else if (complete && !postExists)
    reason = "The retained Community post relation is missing.";
  else if (!currentProcessing)
    reason = "Linked recording is no longer in processing state.";

  return {
    plan: {
      providerEgressId,
      egressStatus: String(egress.status),
      egressRoomName: roomName,
      egressOutputPath: filePath,
      r2ObjectExists: Boolean(object),
      r2ObjectSize: object?.fileSizeBytes ?? null,
      r2ObjectContentType: object?.mimeType ?? null,
      mediaAssetStatus: asset.status,
      postReplayStatus: postData?.replayStatus ?? null,
      liveSessionId: sessionDoc.id,
      mediaAssetId: asset.id,
      communityPostId: roomData.communityPostId ?? null,
      recoverable: wouldFinalize,
      wouldFinalize,
      wouldFail,
      reason,
    },
    egress,
  };
}

export async function reconcileCommunityRecordingByProviderEgressId(
  providerEgressId: string
) {
  const inspected =
    await inspectCommunityRecordingReconciliation(providerEgressId);
  if (inspected.plan.wouldFinalize || inspected.plan.wouldFail) {
    await reconcileCommunityRecordingEgressServerSide(inspected.egress!);
  }
  return inspected.plan;
}

export async function reconcileStaleCommunityRecordingsServerSide() {
  const snap = await getAdminDb()
    .collection("liveSessions")
    .where("sourceType", "==", "community")
    .where("recordingStatus", "==", "processing")
    .limit(25)
    .get();
  const results: CommunityRecordingReconciliationPlan[] = [];
  for (const doc of snap.docs) {
    const providerEgressId = doc.get("providerEgressId") as string | null;
    if (!providerEgressId) continue;
    try {
      results.push(
        await reconcileCommunityRecordingByProviderEgressId(providerEgressId)
      );
    } catch (error) {
      console.warn("[community-recording-reconciliation] sweep item failed", {
        providerEgressId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return results;
}
