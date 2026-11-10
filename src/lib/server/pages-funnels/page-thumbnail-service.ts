import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { getAdminDb } from "@/lib/firebase/admin";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { launchHeadlessChromium } from "@/lib/server/headless-chromium";
import { issueThumbnailToken } from "@/lib/server/pages-funnels/thumbnail-token";
import {
  MAX_QUEUED_PER_VISIT,
  THUMBNAIL_SCALE,
  THUMBNAIL_VIEWPORT,
  thumbnailIsCurrent,
  thumbnailTarget,
  thumbnailToQueue,
  type ThumbnailTarget,
} from "@/lib/pages-funnels/thumbnail";
import type { PageDoc, PageThumbnail } from "@/types/pages-funnels";

/**
 * Automatic page thumbnails (Pages & Funnels home, 2026-11).
 *
 * Capture: a short-lived headless Chromium (the same runtime the Skool
 * importer ships) opens this deployment's own `/p/{pageId}` with a 3-minute
 * capture pass (thumbnail-token.ts), at a 1280×800 desktop viewport, and
 * screenshots the first screen as a 640×400 JPEG. The pass makes `/p` skip
 * the tenant's tracking scripts and automatic popups, and lets it render the
 * saved DRAFT for pages that were never published. Nothing else about the
 * public page changes.
 *
 * Storage: `page-thumbnails/{subAccountId}/{pageId}/…jpg` in the workspace's
 * Firebase Storage bucket with a download token (same pattern as public
 * Media Library images). Storage rules stay default-deny; the URL is the
 * only way in, and a page's thumbnail URL is only readable by people who
 * can already read the page record.
 *
 * Triggers (never on every dashboard visit):
 *  - Publish queues a capture of the new published version.
 *  - The library asks once per visit for pages whose thumbnail is missing
 *    or out of date (`queueStaleThumbnails`), throttled per page by
 *    `thumbnailRequest` (15 min retry; drafts at most hourly), at most 6
 *    per visit.
 * With QStash configured the capture runs in its own function
 * (/api/pages-funnels/thumbnail/step). Without it (local QA) it runs after
 * the response in the same process.
 */
const PAGES = "pages";
const CAPTURE_TIMEOUT_MS = 30_000;

function appBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || null;
}

function bucketName(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null;
}

function downloadUrl(bucket: string, key: string, token: string) {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  const base = host ? `http://${host}` : "https://firebasestorage.googleapis.com";
  return `${base}/v0/b/${bucket}/o/${encodeURIComponent(key)}?alt=media&token=${token}`;
}

export type CaptureOutcome =
  | { status: "captured"; thumbnail: PageThumbnail }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Screenshot the page's current target version and store it. Never throws. */
export async function capturePageThumbnail(pageId: string): Promise<CaptureOutcome> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(pageId)) return { status: "skipped", reason: "invalid_id" };
  const ref = getAdminDb().collection(PAGES).doc(pageId);
  const snap = await ref.get().catch(() => null);
  if (!snap?.exists) return { status: "skipped", reason: "missing" };
  const page = snap.data() as Omit<PageDoc, "id">;
  if (!page.subAccountId) return { status: "skipped", reason: "no_workspace" };
  const target = thumbnailTarget(page);
  if (!target) return { status: "skipped", reason: "no_capturable_version" };
  if (thumbnailIsCurrent(page, target)) return { status: "skipped", reason: "current" };

  const base = appBaseUrl();
  const bucket = bucketName();
  const token = issueThumbnailToken(pageId, target.variant);
  if (!base || !bucket || !token) return { status: "failed", reason: "not_configured" };

  let bytes: Buffer;
  try {
    bytes = await screenshot(`${base}/p/${encodeURIComponent(pageId)}?mx_thumb=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error(`[page-thumbnail] capture failed for ${pageId}`, err instanceof Error ? err.message : err);
    return { status: "failed", reason: "capture_failed" };
  }

  const key = `page-thumbnails/${page.subAccountId}/${pageId}/${target.variant}-${target.sourceVersion}-${randomUUID().slice(0, 8)}.jpg`;
  const downloadToken = randomUUID();
  const file = getStorage().bucket(bucket).file(key);
  try {
    await file.save(bytes, {
      resumable: false,
      contentType: "image/jpeg",
      metadata: { cacheControl: "public, max-age=31536000, immutable", metadata: { firebaseStorageDownloadTokens: downloadToken, subAccountId: page.subAccountId, pageId } },
    });
  } catch (err) {
    console.error(`[page-thumbnail] upload failed for ${pageId}`, err instanceof Error ? err.message : err);
    return { status: "failed", reason: "upload_failed" };
  }

  const thumbnail: PageThumbnail = {
    url: downloadUrl(bucket, key, downloadToken),
    storageKey: key,
    variant: target.variant,
    sourceVersion: target.sourceVersion,
    capturedAt: Date.now(),
    width: Math.round(THUMBNAIL_VIEWPORT.width * THUMBNAIL_SCALE),
    height: Math.round(THUMBNAIL_VIEWPORT.height * THUMBNAIL_SCALE),
  };

  // Write only if nothing newer landed while we were capturing (a later
  // publish, or a published thumbnail that a draft capture must not replace).
  const result = await getAdminDb()
    .runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data() as Omit<PageDoc, "id"> | undefined;
      if (!fresh || fresh.subAccountId !== page.subAccountId) return { write: false, oldKey: null };
      const cur = fresh.thumbnail;
      const newerSame = cur && cur.variant === thumbnail.variant && cur.sourceVersion >= thumbnail.sourceVersion;
      const publishedWins = cur?.variant === "published" && thumbnail.variant === "draft" && fresh.status === "published";
      if (newerSame || publishedWins) return { write: false, oldKey: null };
      tx.update(ref, { thumbnail });
      return { write: true, oldKey: cur?.storageKey ?? null };
    })
    .catch(() => ({ write: false, oldKey: null }));

  const bucketRef = getStorage().bucket(bucket);
  if (!result.write) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    return { status: "skipped", reason: "superseded" };
  }
  if (result.oldKey && result.oldKey.startsWith(`page-thumbnails/${page.subAccountId}/${pageId}/`)) {
    await bucketRef.file(result.oldKey).delete({ ignoreNotFound: true }).catch(() => undefined);
  }
  return { status: "captured", thumbnail };
}

async function screenshot(url: string): Promise<Buffer> {
  const browser = await launchHeadlessChromium();
  try {
    const context = await browser.newContext({
      viewport: { ...THUMBNAIL_VIEWPORT },
      deviceScaleFactor: THUMBNAIL_SCALE,
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    const tab = await context.newPage();
    const res = await tab.goto(url, { waitUntil: "domcontentloaded", timeout: CAPTURE_TIMEOUT_MS });
    if (!res || res.status() !== 200) throw new Error(`page returned ${res?.status() ?? "no response"}`);
    // Images and web fonts above the fold, then a short settle for layout.
    await tab.waitForLoadState("load", { timeout: 12_000 }).catch(() => undefined);
    await tab.evaluate(() => (document as Document & { fonts?: FontFaceSet }).fonts?.ready).catch(() => undefined);
    await tab.waitForTimeout(700);
    const buf = await tab.screenshot({ type: "jpeg", quality: 80, fullPage: false });
    if (buf.length < 1500) throw new Error("screenshot was empty");
    return buf;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Queue captures. Records each request first (the throttle), then sends one
 * QStash message per page. Pages QStash couldn't take (local QA has no
 * queue) are captured one after another after this response — never several
 * browsers at once.
 */
export async function requestPageThumbnails(items: Array<{ pageId: string; target: ThumbnailTarget }>): Promise<void> {
  const local: string[] = [];
  for (const { pageId, target } of items) {
    await getAdminDb()
      .collection(PAGES)
      .doc(pageId)
      .update({ thumbnailRequest: { at: Date.now(), variant: target.variant, sourceVersion: target.sourceVersion } })
      .catch(() => undefined);
    const queued = qstashIsConfigured()
      ? await publishCallback({
          pathname: "/api/pages-funnels/thumbnail/step",
          body: { pageId },
          delaySeconds: 2,
          deduplicationId: `pthumb_${pageId}_${target.variant}_${target.sourceVersion}`,
        })
      : null;
    if (!queued) local.push(pageId);
  }
  if (local.length) {
    after(async () => {
      for (const id of local) await capturePageThumbnail(id);
    });
  }
}

/** After Publish: queue the new published version. Never throws. */
export async function requestThumbnailAfterPublish(pageId: string): Promise<void> {
  try {
    const page = (await getAdminDb().collection(PAGES).doc(pageId).get()).data() as Omit<PageDoc, "id"> | undefined;
    const target = page ? thumbnailTarget(page) : null;
    if (target) await requestPageThumbnails([{ pageId, target }]);
  } catch (err) {
    console.error(`[page-thumbnail] couldn't queue ${pageId} after publish`, err);
  }
}

/** Library visit: queue missing / out-of-date thumbnails for one workspace (throttled). */
export async function queueStaleThumbnails(subAccountId: string): Promise<number> {
  const snap = await getAdminDb().collection(PAGES).where("subAccountId", "==", subAccountId).get();
  const now = Date.now();
  const due: Array<{ id: string; target: ThumbnailTarget; recent: number }> = [];
  for (const d of snap.docs) {
    const page = d.data() as Omit<PageDoc, "id">;
    const target = thumbnailToQueue(page, now);
    if (target) due.push({ id: d.id, target, recent: target.sourceVersion });
  }
  // Most recently changed first; published before drafts.
  due.sort((a, b) => (a.target.variant === b.target.variant ? b.recent - a.recent : a.target.variant === "published" ? -1 : 1));
  const batch = due.slice(0, MAX_QUEUED_PER_VISIT);
  await requestPageThumbnails(batch.map((b) => ({ pageId: b.id, target: b.target })));
  return batch.length;
}
