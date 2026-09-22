import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

type SourceAsset = { role: string; sourceId: string; url: string; targetField: string };
type Source = {
  logoUrl: string;
  coverUrl: string;
  faviconUrl: string;
  aboutImages: { sourceAttachmentId: string; fileId: string; url: string }[];
};

const source = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "migration-artifacts/skool-community-profile-source.json"), "utf8")) as Source;
const subAccountId = process.env.SKOOL_TARGET_SUB_ACCOUNT_ID ?? "xvnedVCmQpEvHrcPhEDI";
const targetSlug = process.env.SKOOL_TARGET_GROUP_SLUG ?? "magnetic-visibility";
const commit = process.argv.includes("--commit");
const maxBytes = 5 * 1024 * 1024;

function app() {
  return getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

function extForMime(mime: string) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : null;
}

function isValidImage(buffer: Buffer, mime: string) {
  if (mime === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return buffer.subarray(0, 4).toString("ascii") === "GIF8";
  if (mime === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function storagePathFor(asset: { sourceId: string; sha256: string; ext: string | null }, groupId: string) {
  if (!asset.ext) throw new Error(`Cannot build storage path for ${asset.sourceId}: image extension is unavailable.`);
  return `community/${subAccountId}/${groupId}/migrated-${asset.sourceId}-${asset.sha256.slice(0, 16)}.${asset.ext}`;
}

function isExpectedHostedUrl(value: unknown, storagePath: string) {
  return typeof value === "string" && (value.includes(storagePath) || value.includes(encodeURIComponent(storagePath)));
}

async function inspectAsset(asset: SourceAsset) {
  const response = await fetch(asset.url, { redirect: "error" });
  const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = extForMime(contentType);
  const valid = response.ok && !!ext && buffer.length > 0 && buffer.length <= maxBytes && isValidImage(buffer, contentType);
  return { ...asset, httpStatus: response.status, contentType, bytes: buffer.length, valid, ext, buffer, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}

async function main() {
  const firebaseApp = app();
  const db = getFirestore(firebaseApp);
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not configured.");
  const groups = await db.collection(`subAccounts/${subAccountId}/communityGroups`).where("slug", "==", targetSlug).limit(2).get();
  if (groups.size !== 1) throw new Error(`Expected exactly one target group for slug ${targetSlug}; found ${groups.size}.`);
  const groupSnap = groups.docs[0];
  const target = groupSnap.data() as Record<string, unknown>;

  const assets: SourceAsset[] = [
    { role: "community logo/icon", sourceId: "logo", url: source.logoUrl, targetField: "logoUrl" },
    { role: "community banner/cover", sourceId: "cover", url: source.coverUrl, targetField: "coverUrl" },
    { role: "community favicon", sourceId: "favicon", url: source.faviconUrl, targetField: "faviconUrl" },
    ...source.aboutImages.map((item, index) => ({ role: `About gallery image ${index + 1}`, sourceId: item.fileId, url: item.url, targetField: "aboutMedia" })),
  ];
  const inspected = await Promise.all(assets.map(inspectAsset));
  const conflicts: { field: string; current: unknown; reason: string }[] = [];
  const currentAboutMedia = Array.isArray(target.aboutMedia) ? target.aboutMedia : [];
  for (const field of ["logoUrl", "coverUrl", "faviconUrl"] as const) {
    const current = target[field];
    const asset = inspected.find((item) => item.targetField === field);
    const expectedPath = asset?.valid ? storagePathFor(asset, groupSnap.id) : "";
    if (typeof current === "string" && current.trim() && !isExpectedHostedUrl(current, expectedPath)) conflicts.push({ field, current, reason: "existing non-empty Magnetix value; owner image preserved" });
  }
  if (currentAboutMedia.length > 0) {
    const migratedMediaIds = new Set(currentAboutMedia.map((item) => (item as Record<string, unknown>).id));
    const allAlreadyMigrated = inspected.filter((item) => item.targetField === "aboutMedia").every((item) => migratedMediaIds.has(`skool-${item.sourceId}`));
    if (!allAlreadyMigrated) conflicts.push({ field: "aboutMedia", current: currentAboutMedia, reason: "existing About media; owner content preserved" });
  }

  const proposed = inspected.map((asset) => ({ role: asset.role, targetField: asset.targetField, sourceUrl: asset.url, sourceId: asset.sourceId, httpStatus: asset.httpStatus, contentType: asset.contentType, bytes: asset.bytes, sha256: asset.sha256, valid: asset.valid, proposedStoragePath: asset.valid && asset.ext ? `community/${subAccountId}/${groupSnap.id}/migrated-${asset.sourceId}-${asset.sha256.slice(0, 16)}.${asset.ext}` : null }));
  const safeFields = inspected.filter((asset) => asset.valid && !conflicts.some((c) => c.field === asset.targetField)).map((asset) => asset.targetField);
  console.log(JSON.stringify({
    mode: commit ? "COMMIT" : "DRY_RUN",
    target: { path: groupSnap.ref.path, logoUrl: target.logoUrl ?? null, coverUrl: target.coverUrl ?? null, faviconUrl: target.faviconUrl ?? null, aboutMediaCount: currentAboutMedia.length },
    sourceAssets: proposed,
    safeToMigrate: [...new Set(safeFields)],
    conflicts,
    notMigrated: ["two Skool About video attachments: image-only task; no image field target", "source URLs remain in the audit artifact for provenance"],
    storageConvention: "community/{subAccountId}/{groupId}/migrated-{sourceId}-{sha256-prefix}.{ext}",
  }, null, 2));
  if (!commit) return;
  if (conflicts.length) throw new Error("Refusing commit because an existing owner-created image/media value would be overwritten.");
  if (inspected.some((asset) => !asset.valid)) throw new Error("Refusing commit because one or more source assets failed validation.");

  const bucket = getStorage(firebaseApp).bucket(bucketName);
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const aboutMedia: Record<string, unknown>[] = [];
  for (const asset of inspected) {
    if (!asset.valid || !asset.ext) throw new Error(`Validated asset is missing an image extension: ${asset.sourceId}`);
    const storagePath = storagePathFor(asset, groupSnap.id);
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      const token = crypto.randomUUID();
      await file.save(asset.buffer, { resumable: false, metadata: { contentType: asset.contentType, metadata: { firebaseStorageDownloadTokens: token, sourceSystem: "skool", sourceAssetId: asset.sourceId, sourceUrl: asset.url, sourceSha256: asset.sha256, assetRole: asset.role } } });
    }
    const [metadata] = await file.getMetadata();
    const token = metadata.metadata?.firebaseStorageDownloadTokens;
    if (!token) throw new Error(`Uploaded asset has no download token: ${storagePath}`);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
    if (asset.targetField === "aboutMedia") {
      const existing = currentAboutMedia.find((item) => (item as Record<string, unknown>).id === `skool-${asset.sourceId}`);
      aboutMedia.push(existing ?? { id: `skool-${asset.sourceId}`, type: "image", url, thumbnailUrl: null, provider: null, videoId: null, label: "", title: "", order: aboutMedia.length, featured: aboutMedia.length === 0 });
    } else if (!isExpectedHostedUrl(target[asset.targetField], storagePath)) updates[asset.targetField] = url;
  }
  if (currentAboutMedia.length === 0 || conflicts.every((conflict) => conflict.field !== "aboutMedia")) updates.aboutMedia = currentAboutMedia.length === 0 ? aboutMedia : currentAboutMedia;
  await groupSnap.ref.update(updates);
  console.log(JSON.stringify({ committedFields: Object.keys(updates).filter((key) => key !== "updatedAt"), aboutMediaCount: aboutMedia.length, targetPath: groupSnap.ref.path }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
