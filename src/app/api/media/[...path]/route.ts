import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny, requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  deleteBunnyHostedVideo,
  findBunnyAssetByGuid,
  getBunnyPlaybackUrl,
  initBunnyHostedVideo,
  syncBunnyHostedVideo,
  webhookEventId,
  type BunnyWebhookCheckpoint,
} from "@/lib/server/bunny-stream-service";
import type { VideoOwnerScope } from "@/types/media-asset";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

async function body(request: Request) {
  try { return await request.json(); } catch { return null; }
}

async function authorize(request: Request, scope: VideoOwnerScope) {
  if (scope.kind === "agency") {
    const caller = await requireAgencyOwnerAny(request);
    if (caller instanceof NextResponse || caller.agencyId !== scope.agencyId) return null;
    return caller;
  }
  const caller = await requireSubAccountAdmin(request, scope.subAccountId);
  if (caller instanceof NextResponse || caller.agencyId !== scope.agencyId) return null;
  return caller;
}

function parseScope(value: unknown): VideoOwnerScope | null {
  if (!value || typeof value !== "object") return null;
  const scope = value as Record<string, unknown>;
  if (scope.kind === "agency" && typeof scope.agencyId === "string") return { kind: "agency", agencyId: scope.agencyId };
  if (scope.kind === "tenant" && typeof scope.agencyId === "string" && typeof scope.subAccountId === "string") return { kind: "tenant", agencyId: scope.agencyId, subAccountId: scope.subAccountId };
  return null;
}

function webhookEnvPresence() {
  return {
    BUNNY_STREAM_LIBRARY_ID: Boolean(process.env.BUNNY_STREAM_LIBRARY_ID),
    BUNNY_STREAM_API_KEY: Boolean(process.env.BUNNY_STREAM_API_KEY),
    BUNNY_STREAM_CDN_HOSTNAME: Boolean(process.env.BUNNY_STREAM_CDN_HOSTNAME),
    BUNNY_STREAM_TOKEN_KEY: Boolean(process.env.BUNNY_STREAM_TOKEN_KEY),
  };
}

function webhookErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
    return { errorName: error.name, errorMessage: error.message, stack: error.stack, bunnyHttpStatus: status };
  }
  return { errorName: "UnknownError", errorMessage: String(error), stack: undefined, bunnyHttpStatus: undefined };
}

export async function POST(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const path = (await ctx.params).path || [];
  const input = await body(request);
  if (!input) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (path.join("/") === "webhooks/bunny-stream") {
    let checkpoint = "webhook_received";
    let guid = "";
    const logCheckpoint: BunnyWebhookCheckpoint = (nextCheckpoint, details) => {
      checkpoint = nextCheckpoint;
      console.info("[bunny-webhook] checkpoint", { checkpoint: nextCheckpoint, ...details });
    };
    try {
      logCheckpoint("webhook_received", { method: request.method, path: path.join("/") });
      guid = String(input.videoGuid || input.videoId || input.VideoGuid || input.VideoId || "");
      if (!guid) return NextResponse.json({ ok: false, error: "Missing Bunny video GUID" }, { status: 400 });
      logCheckpoint("guid_parsed", { guid });
      const found = await findBunnyAssetByGuid(guid);
      if (!found) return NextResponse.json({ ok: true, ignored: true });
      logCheckpoint("media_asset_lookup_succeeded", { assetId: found.asset.id });
      const eventId = webhookEventId(input as Record<string, unknown>);
      const eventRef = getAdminDb().collection("bunnyWebhookEvents").doc(eventId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 150));
      const existing = await eventRef.get();
      if (existing.exists) return NextResponse.json({ ok: true, duplicate: true });
      const scope = found.asset.ownerScope || (found.asset.subAccountId ? { kind: "tenant", agencyId: found.asset.agencyId, subAccountId: found.asset.subAccountId } : { kind: "agency", agencyId: found.asset.agencyId });
      await syncBunnyHostedVideo(scope, found.asset.id, logCheckpoint);
      logCheckpoint("webhook_event_persistence_starting", { eventId });
      await eventRef.set({ eventId, videoGuid: guid, processedAt: new Date().toISOString() });
      logCheckpoint("handler_completed", { eventId });
      return NextResponse.json({ ok: true });
    } catch (error) {
      const details = { checkpoint, guid, ...webhookErrorDetails(error), envPresence: webhookEnvPresence() };
      console.error("[bunny-webhook] exception", details);
      try {
        await getAdminDb().collection("bunnyWebhookDiagnostics").add({ ...details, recordedAt: new Date().toISOString() });
      } catch (diagnosticWriteError) {
        console.error("[bunny-webhook] diagnostic persistence failed", {
          errorName: diagnosticWriteError instanceof Error ? diagnosticWriteError.name : "UnknownError",
          errorMessage: diagnosticWriteError instanceof Error ? diagnosticWriteError.message : String(diagnosticWriteError),
        });
      }
      throw error;
    }
  }

  if (path.join("/") === "hosted-videos/upload-init") {
    const scope = parseScope(input.ownerScope);
    if (!scope || typeof input.filename !== "string" || typeof input.mimeType !== "string" || typeof input.sizeBytes !== "number") return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
    const caller = await authorize(request, scope);
    if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const result = await initBunnyHostedVideo({ scope, title: String(input.title || input.filename), filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, createdBy: caller.uid, courseId: typeof input.courseId === "string" ? input.courseId : undefined, lessonId: typeof input.lessonId === "string" ? input.lessonId : undefined });
    return NextResponse.json(result);
  }

  const match = path.join("/").match(/^hosted-videos\/([^/]+)\/(finalize|playback)$/);
  if (match) {
    const scope = parseScope(input.ownerScope);
    if (!scope) return NextResponse.json({ error: "Invalid owner scope" }, { status: 400 });
    const caller = await authorize(request, scope);
    if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const assetId = match[1];
    if (match[2] === "finalize") return NextResponse.json(await syncBunnyHostedVideo(scope, assetId));
    const url = await getBunnyPlaybackUrl(scope, assetId);
    return url ? NextResponse.json({ url, expiresInSeconds: 300 }) : NextResponse.json({ error: "Video is not ready" }, { status: 409 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const path = (await ctx.params).path || [];
  const input = await body(request);
  const match = path.join("/").match(/^hosted-videos\/([^/]+)$/);
  const scope = parseScope(input?.ownerScope);
  if (!match || !scope) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!(await authorize(request, scope))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { await deleteBunnyHostedVideo(scope, match[1]); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete hosted video" }, { status: 409 }); }
}
