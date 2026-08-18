import { Download } from "lucide-react";
import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { embedUrlFor } from "@/lib/community/video-embed";
import { labelForCommunityFileMimeType, formatFileSize } from "@/lib/community/community-file-mime";
import { cn } from "@/lib/utils";
import type {
  FileAttachment,
  GifAttachment,
  ImageAttachment,
  MediaAttachment,
  VideoLinkAttachment,
} from "@/types/media-attachment";

/**
 * ONE shared Community post attachment renderer — the feed card and post
 * detail both use this instead of scattering attachment-kind checks
 * across each surface independently. Renders BELOW the rich-text body,
 * never inline inside it. Phase C shipped "image"/"voice"; Phase D adds
 * "gif"/"file"/"video-link" the same way — one more branch here, never a
 * new component per surface.
 */
export function CommunityPostAttachments({
  attachments,
  brand,
  className,
}: {
  attachments: MediaAttachment[] | undefined;
  brand: string;
  className?: string;
}) {
  if (!attachments?.length) return null;

  const images = attachments
    .filter((a): a is Extract<MediaAttachment, { kind: "image" }> => a.kind === "image")
    .map((a) => a.image);
  const voiceNotes = attachments
    .filter((a): a is Extract<MediaAttachment, { kind: "voice" }> => a.kind === "voice")
    .map((a) => a.voice);
  const gifs = attachments
    .filter((a): a is Extract<MediaAttachment, { kind: "gif" }> => a.kind === "gif")
    .map((a) => a.gif);
  const files = attachments
    .filter((a): a is Extract<MediaAttachment, { kind: "file" }> => a.kind === "file")
    .map((a) => a.file);
  const videoLinks = attachments
    .filter((a): a is Extract<MediaAttachment, { kind: "video-link" }> => a.kind === "video-link")
    .map((a) => a.videoLink);

  return (
    <div className={cn("space-y-2", className)}>
      {images.length > 0 && <CommunityImageGrid images={images} />}
      {gifs.map((g) => (
        <CommunityGifBlock key={g.id} gif={g} />
      ))}
      {videoLinks.map((v) => (
        <CommunityVideoEmbed key={v.id} video={v} />
      ))}
      {voiceNotes.map((v) => (
        <VoiceNotePlayer key={v.id} url={v.url} durationMs={v.durationMs} brand={brand} />
      ))}
      {files.map((f) => (
        <CommunityFileCard key={f.id} file={f} />
      ))}
    </div>
  );
}

/** Simple, intentional layouts for 1–4 images. Not a gallery/lightbox —
 *  just responsive, non-overflowing, aspect-ratio-aware image blocks. */
function CommunityImageGrid({ images }: { images: ImageAttachment[] }) {
  if (images.length === 1) {
    const img = images[0];
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={img.url}
        alt=""
        className="max-h-[420px] w-full rounded-xl object-cover"
        style={
          img.width && img.height ? { aspectRatio: `${img.width} / ${img.height}` } : undefined
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1">
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={img.id}
          src={img.url}
          alt=""
          className={cn(
            "aspect-square w-full rounded-lg object-cover",
            images.length === 3 && i === 2 && "col-span-2 aspect-[2/1]",
          )}
        />
      ))}
    </div>
  );
}

function CommunityGifBlock({ gif }: { gif: GifAttachment }) {
  return (
    <div>
      <div
        className="overflow-hidden rounded-xl"
        style={{ aspectRatio: `${gif.width} / ${gif.height}`, maxHeight: 420 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={gif.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      </div>
      {gif.attribution && <p className="mt-1 text-[10px] text-[#b4b4b4]">{gif.attribution}</p>}
    </div>
  );
}

/** Responsive 16:9 embed — only ever a supported-provider embed URL, never
 *  an arbitrary iframe src (that restriction is enforced where the
 *  attachment is created/validated, not here). */
function CommunityVideoEmbed({ video }: { video: VideoLinkAttachment }) {
  const src = video.embedUrl || embedUrlFor(video.provider, video.providerId);
  if (!src) return null;
  return (
    <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }}>
      <iframe
        src={src}
        title="Attached video"
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function CommunityFileCard({ file }: { file: FileAttachment }) {
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-[#E4E4E4] bg-[#FAFAFA] px-3 py-2.5 hover:border-[#d4d4d4]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EDEDED] text-[10px] font-bold text-[#606060]">
        {labelForCommunityFileMimeType(file.mimeType)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[#202124]">{file.fileName}</span>
        <span className="block text-xs text-[#909090]">{formatFileSize(file.fileSizeBytes)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-[#909090]" />
    </a>
  );
}
