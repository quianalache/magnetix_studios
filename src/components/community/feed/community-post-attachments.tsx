import { VoiceNotePlayer } from "@/components/community/voice-notes/voice-note-player";
import { cn } from "@/lib/utils";
import type { ImageAttachment, MediaAttachment } from "@/types/media-attachment";

/**
 * ONE shared Community post attachment renderer — the feed card and post
 * detail both use this instead of scattering attachment-kind checks
 * across each surface independently. Renders BELOW the rich-text body,
 * never inline inside it. Phase C dispatches "image" and "voice"; a
 * future kind is one more branch here, not a new component per surface.
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

  return (
    <div className={cn("space-y-2", className)}>
      {images.length > 0 && <CommunityImageGrid images={images} />}
      {voiceNotes.map((v) => (
        <VoiceNotePlayer key={v.id} url={v.url} durationMs={v.durationMs} brand={brand} />
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
