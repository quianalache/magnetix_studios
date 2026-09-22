import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

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

type SourceImage = { sourceAttachmentId: string; fileId: string; url: string };
type SourceVideo = { sourceAttachmentId: string; videoUrl: string };
type Source = {
  aboutImages: SourceImage[];
  aboutVideos: SourceVideo[];
  aboutMediaOrder: { sourceAttachmentId: string; type: "image" | "video" }[];
};
type Media = Record<string, unknown>;

const source = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "migration-artifacts/skool-community-profile-source.json"), "utf8")) as Source;
const subAccountId = process.env.SKOOL_TARGET_SUB_ACCOUNT_ID ?? "xvnedVCmQpEvHrcPhEDI";
const targetSlug = process.env.SKOOL_TARGET_GROUP_SLUG ?? "magnetic-visibility";
const commit = process.argv.includes("--commit");

function app() {
  return getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

function youtubeId(url: string): string {
  const match = url.match(/youtu\.be\/([^?&#/]+)/i) ?? url.match(/[?&]v=([^?&#/]+)/i);
  if (!match) throw new Error(`Unsupported YouTube URL: ${url}`);
  return match[1];
}

function sourceKey(sourceAttachmentId: string) {
  return `skool-${sourceAttachmentId}`;
}

function mediaKey(entry: { sourceAttachmentId: string; type: "image" | "video" }) {
  return entry.type === "image"
    ? sourceKey(imageByAttachment(entry.sourceAttachmentId).fileId)
    : sourceKey(entry.sourceAttachmentId);
}

function imageByAttachment(id: string) {
  const image = source.aboutImages.find((item) => item.sourceAttachmentId === id);
  if (!image) throw new Error(`Missing source image for attachment ${id}`);
  return image;
}

function videoByAttachment(id: string) {
  const video = source.aboutVideos.find((item) => item.sourceAttachmentId === id);
  if (!video) throw new Error(`Missing source video for attachment ${id}`);
  return video;
}

function expectedMedia(current: Media[], entry: { sourceAttachmentId: string; type: "image" | "video" }, order: number): Media {
  const id = mediaKey(entry);
  const existing = current.find((item) => item.id === id);
  if (entry.type === "image") {
    const image = imageByAttachment(entry.sourceAttachmentId);
    if (existing && (existing.type !== "image" || typeof existing.url !== "string" || !existing.url.includes("firebasestorage.googleapis.com"))) {
      throw new Error(`Refusing to replace existing image record ${id}; owner data is not a Firebase-hosted image.`);
    }
    return { ...(existing ?? { id, type: "image", url: image.url, thumbnailUrl: null, provider: null, videoId: null, label: "", title: "", featured: false }), order };
  }
  const video = videoByAttachment(entry.sourceAttachmentId);
  const idValue = youtubeId(video.videoUrl);
  if (existing && (existing.type !== "video" || existing.provider !== "youtube" || existing.videoId !== idValue)) {
    throw new Error(`Refusing to replace existing video record ${id}; identity differs from the verified source.`);
  }
  return {
    ...(existing ?? { id, type: "video", url: video.videoUrl, label: "", title: "", linkUrl: null, featured: false }),
    type: "video",
    url: video.videoUrl,
    linkUrl: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${idValue}/hqdefault.jpg`,
    provider: "youtube",
    videoId: idValue,
    order,
  };
}

async function main() {
  const db = getFirestore(app());
  const groups = await db.collection(`subAccounts/${subAccountId}/communityGroups`).where("slug", "==", targetSlug).limit(2).get();
  if (groups.size !== 1) throw new Error(`Expected exactly one target group for slug ${targetSlug}; found ${groups.size}.`);
  const group = groups.docs[0];
  const current = Array.isArray(group.data().aboutMedia) ? group.data().aboutMedia as Media[] : [];
  const expectedIds = new Set(source.aboutMediaOrder.map(mediaKey));
  const unknown = current.filter((item) => typeof item.id !== "string" || !expectedIds.has(item.id));
  if (unknown.length) throw new Error(`Refusing to overwrite ${unknown.length} unrecognized About media record(s).`);
  const proposed = source.aboutMediaOrder.map((entry, order) => expectedMedia(current, entry, order));
  const changed = JSON.stringify(current) !== JSON.stringify(proposed);
  console.log(JSON.stringify({ mode: commit ? "COMMIT" : "DRY_RUN", targetPath: group.ref.path, currentCount: current.length, proposedCount: proposed.length, changed, proposed }, null, 2));
  if (!commit || !changed) return;
  await group.ref.update({ aboutMedia: proposed, updatedAt: FieldValue.serverTimestamp() });
  console.log(JSON.stringify({ committedFields: ["aboutMedia"], mediaCount: proposed.length, targetPath: group.ref.path }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
