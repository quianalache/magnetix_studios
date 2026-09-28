import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getBunnyPlaybackUrl } from "@/lib/server/bunny-stream-service";
import { isoOf } from "@/lib/server/assets/people";
import type { MediaAsset } from "@/types/media-asset";
import type { MediaShareDoc, MediaShareView } from "@/types/media-library";

/**
 * Shareable video replays (Assets, 2026-09). Owner decision: every video is
 * protected by default; an admin may explicitly share ONE video through a
 * Magnetix link. Architecture:
 *
 * 1. Enabling sharing writes `mediaShares/{shareId}` (server-only, default
 *    deny) with the MediaAsset reference.
 * 2. The public link is `/replay/{shareId}.{hmac}` — unguessable (random
 *    128-bit id + HMAC with AUTOMATIONS_TOKEN_SECRET) and never stored.
 * 3. Each view re-validates the record (active, not expired, asset still
 *    live + ready, same tenant) and only then mints a short-lived Bunny
 *    embed token for the EXISTING video (getBunnyPlaybackUrl, 5 minutes).
 *    Library settings (token auth, blocked direct access) are unchanged
 *    and nothing is re-hosted.
 * 4. Revoking flips the record; no further tokens are issued (a token
 *    issued moments before stays valid until its short expiry).
 *
 * Sharing a lesson's video never grants the course: the share only ever
 * resolves this one asset. `kind` / `recipient` are reserved for future
 * private gift links.
 */

export class MediaShareError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const COLLECTION = "mediaShares";

function secret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s) throw new MediaShareError("Sharing isn't configured on this deployment.", 503);
  return s;
}

function sign(shareId: string): string {
  return createHmac("sha256", secret()).update(`media-share:v1:${shareId}`).digest("base64url").slice(0, 32);
}

export function shareToken(shareId: string): string {
  return `${shareId}.${sign(shareId)}`;
}

export function shareUrl(shareId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return `${base}/replay/${shareToken(shareId)}`;
}

/** Parses + HMAC-checks a token. Null for anything malformed or forged. */
export function parseShareToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const [id, sig, extra] = token.split(".");
  if (!id || !sig || extra !== undefined || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) return null;
  let expected: string;
  try {
    expected = sign(id);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

type ShareRow = MediaShareDoc & { id: string };

function toMillis(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | null;
  if (t && typeof t.toMillis === "function") return t.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
}

export function shareView(s: ShareRow): MediaShareView {
  const exp = toMillis(s.expiresAt);
  return {
    id: s.id,
    url: shareUrl(s.id),
    status: s.status,
    expiresAt: isoOf(s.expiresAt),
    expired: exp !== null && exp <= Date.now(),
    createdAt: isoOf(s.createdAt),
    viewCount: s.viewCount ?? 0,
  };
}

/** Active (not revoked) shares for a sub-account — one per asset at most. */
export async function listSharesForSubAccount(subAccountId: string): Promise<ShareRow[]> {
  const snap = await getAdminDb()
    .collection(COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("status", "==", "active")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as MediaShareDoc) }));
}

async function activeShareFor(subAccountId: string, assetId: string): Promise<ShareRow | null> {
  const all = await listSharesForSubAccount(subAccountId);
  return all.find((s) => s.mediaAssetId === assetId) ?? null;
}

function parseExpiry(v: unknown): Timestamp | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return "invalid";
  if (ms <= Date.now()) return "invalid";
  if (ms > Date.now() + 5 * 365 * 86_400_000) return "invalid";
  return Timestamp.fromMillis(ms);
}

/**
 * Turn sharing on for one video (or update its expiry). Only ready Bunny
 * videos can be shared. Returns the active share.
 */
export async function enableReplayShare(opts: {
  asset: MediaAsset;
  uid: string;
  expiresAt?: unknown;
}): Promise<MediaShareView> {
  const { asset } = opts;
  if (asset.storage.provider !== "bunny" || (asset.mediaType !== "video" && asset.mediaType !== "recording")) {
    throw new MediaShareError("Only hosted videos can have a replay link.");
  }
  if (asset.status !== "ready") throw new MediaShareError("This video is still processing — share it once it's ready.", 409);
  if (!asset.subAccountId) throw new MediaShareError("Only sub-account videos can be shared here.");
  secret(); // fail early (503) before writing anything
  const expiry = parseExpiry(opts.expiresAt);
  if (expiry === "invalid") throw new MediaShareError("Choose an expiry date in the future (or none).");

  const existing = await activeShareFor(asset.subAccountId, asset.id);
  if (existing) {
    if ("expiresAt" in opts) {
      await getAdminDb().doc(`${COLLECTION}/${existing.id}`).update({ expiresAt: expiry });
      return shareView({ ...existing, expiresAt: expiry });
    }
    return shareView(existing);
  }
  const id = randomBytes(16).toString("base64url");
  const doc: MediaShareDoc = {
    agencyId: asset.agencyId,
    subAccountId: asset.subAccountId,
    mediaAssetId: asset.id,
    kind: "public_replay",
    status: "active",
    recipient: null,
    expiresAt: expiry,
    createdByUid: opts.uid,
    createdAt: FieldValue.serverTimestamp(),
    revokedAt: null,
    revokedByUid: null,
    viewCount: 0,
    lastViewedAt: null,
  };
  await getAdminDb().doc(`${COLLECTION}/${id}`).create(doc);
  return shareView({ ...doc, id, createdAt: Timestamp.now() });
}

/** Turn sharing off. Future opens are refused; re-enabling creates a NEW link. */
export async function revokeSharesForAsset(subAccountId: string, assetId: string, uid: string): Promise<number> {
  const all = (await listSharesForSubAccount(subAccountId)).filter((s) => s.mediaAssetId === assetId);
  await Promise.all(
    all.map((s) =>
      getAdminDb().doc(`${COLLECTION}/${s.id}`).update({
        status: "revoked",
        revokedAt: FieldValue.serverTimestamp(),
        revokedByUid: uid,
      })
    )
  );
  return all.length;
}

export type ReplayResolution =
  | { ok: true; title: string; brandName: string; embedUrl: string; expiresInSeconds: number }
  | { ok: false; reason: "invalid" | "revoked" | "expired" | "unavailable" | "processing" };

/**
 * Public side — the ONLY way a replay link yields playback. Validates the
 * token, the share record, the asset and its tenant on every call, then
 * mints a fresh short-lived Bunny token for the existing video.
 */
export async function resolveReplay(token: unknown): Promise<ReplayResolution> {
  const shareId = parseShareToken(token);
  if (!shareId) return { ok: false, reason: "invalid" };
  const db = getAdminDb();
  const snap = await db.doc(`${COLLECTION}/${shareId}`).get();
  const share = snap.data() as MediaShareDoc | undefined;
  if (!share || share.kind !== "public_replay") return { ok: false, reason: "invalid" };
  if (share.status !== "active") return { ok: false, reason: "revoked" };
  const exp = toMillis(share.expiresAt);
  if (exp !== null && exp <= Date.now()) return { ok: false, reason: "expired" };

  const assetSnap = await db.doc(`subAccounts/${share.subAccountId}/mediaAssets/${share.mediaAssetId}`).get();
  const asset = assetSnap.exists ? ({ id: assetSnap.id, ...(assetSnap.data() as Omit<MediaAsset, "id">) } as MediaAsset) : null;
  if (
    !asset ||
    asset.subAccountId !== share.subAccountId ||
    asset.agencyId !== share.agencyId ||
    asset.status === "deleted" ||
    asset.deletedAt ||
    asset.storage?.provider !== "bunny"
  ) {
    return { ok: false, reason: "unavailable" };
  }
  if (asset.status !== "ready") return { ok: false, reason: "processing" };
  const sub = (await db.doc(`subAccounts/${share.subAccountId}`).get()).data();
  if (!sub || sub.agencyId !== share.agencyId) return { ok: false, reason: "unavailable" };

  const embedUrl = await getBunnyPlaybackUrl(
    { kind: "tenant", agencyId: share.agencyId, subAccountId: share.subAccountId },
    asset.id
  );
  if (!embedUrl) return { ok: false, reason: "processing" };
  void snap.ref
    .update({ viewCount: FieldValue.increment(1), lastViewedAt: FieldValue.serverTimestamp() })
    .catch(() => undefined);
  return {
    ok: true,
    title: asset.library?.title || asset.bunny?.title || "Video replay",
    brandName: (sub.name as string) || "",
    embedUrl,
    expiresInSeconds: 300,
  };
}
