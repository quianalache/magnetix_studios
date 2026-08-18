import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createPostServerSide } from "@/lib/server/community-feed-service";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import {
  MAX_IMAGES_PER_POST,
  MAX_VOICE_NOTES_PER_POST,
} from "@/lib/community/community-image-mime";
import type { MediaAttachment } from "@/types/media-attachment";

export const dynamic = "force-dynamic";

/**
 * Normalize + validate client-supplied attachments. Every attachment
 * object was already uploaded (and server-validated at upload time) via
 * /api/community/[saId]/voice-notes or /community-images before ever
 * reaching this route — this pass only checks SHAPE and caps counts; it
 * does not re-verify the Storage object exists (that already happened at
 * upload time, and doing it again per-attachment per-post-create would be
 * a disproportionate round-trip for Phase C). `authorMemberId` is always
 * overwritten with the real authenticated member — never trusted from the
 * client, same discipline as everything else in this route.
 */
function normalizeAttachments(
  raw: unknown,
  authorMemberId: string,
): MediaAttachment[] {
  if (!Array.isArray(raw)) return [];
  const images: MediaAttachment[] = [];
  const voices: MediaAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: unknown }).kind;
    if (kind === "image" && images.length < MAX_IMAGES_PER_POST) {
      const image = (item as { image?: Record<string, unknown> }).image;
      if (
        image &&
        typeof image.id === "string" &&
        typeof image.url === "string" &&
        typeof image.storagePath === "string" &&
        typeof image.mimeType === "string" &&
        typeof image.fileSizeBytes === "number"
      ) {
        images.push({
          kind: "image",
          image: {
            id: image.id,
            url: image.url,
            storagePath: image.storagePath,
            mimeType: image.mimeType,
            fileSizeBytes: image.fileSizeBytes,
            width: typeof image.width === "number" ? image.width : undefined,
            height: typeof image.height === "number" ? image.height : undefined,
            authorMemberId,
            createdAt: Date.now(),
            status: "ready",
          },
        });
      }
    } else if (kind === "voice" && voices.length < MAX_VOICE_NOTES_PER_POST) {
      const voice = (item as { voice?: Record<string, unknown> }).voice;
      if (
        voice &&
        typeof voice.id === "string" &&
        typeof voice.url === "string" &&
        typeof voice.storagePath === "string" &&
        typeof voice.mimeType === "string" &&
        typeof voice.durationMs === "number" &&
        typeof voice.fileSizeBytes === "number"
      ) {
        voices.push({
          kind: "voice",
          voice: {
            id: voice.id,
            url: voice.url,
            storagePath: voice.storagePath,
            mimeType: voice.mimeType,
            durationMs: voice.durationMs,
            fileSizeBytes: voice.fileSizeBytes,
            authorMemberId,
            createdAt: Date.now(),
            status: "ready",
          },
        });
      }
    }
  }
  return [...images, ...voices];
}

/** Member: create a feed post. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: {
    title?: string;
    body?: string;
    category?: string | null;
    attachments?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // `body.body` is real HTML from the Community rich-text composer
  // (Phase B), not plain text — the 10,000-char cap must be measured
  // against the VISIBLE text a member actually typed, not the raw HTML
  // string. `aboutPlainTextLength` is a plain regex tag-stripper (no HTML
  // parsing/rendering assumptions), already proven for exactly this job
  // by the About/Guidelines character counters — reused as-is, not
  // duplicated.
  const html = body.body?.trim() ?? "";
  const visibleLength = aboutPlainTextLength(html);
  const attachments = normalizeAttachments(body.attachments, access.member.id);

  // Phase C: a post is valid with visible text OR at least one real
  // attachment — image/voice-only posts are real content, not empty
  // posts. Attachments never count toward (or bypass) the text-length
  // cap; the two are validated independently.
  if (visibleLength === 0 && attachments.length === 0) {
    return NextResponse.json(
      { error: "Write something, or attach a photo or voice note" },
      { status: 400 },
    );
  }
  if (visibleLength > 10000) {
    return NextResponse.json({ error: "Post is too long" }, { status: 400 });
  }

  // Category must be one the group defines (or none).
  const category =
    body.category && access.group.categories.includes(body.category)
      ? body.category
      : null;

  const post = await createPostServerSide({
    subAccountId: saId,
    agencyId: access.gate.agencyId,
    groupId,
    authorMemberId: access.member.id,
    title: body.title?.trim() ?? "",
    body: html,
    attachments,
    category,
  });

  return NextResponse.json({ ok: true, post });
}
