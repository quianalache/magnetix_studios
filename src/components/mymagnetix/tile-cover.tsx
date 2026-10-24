import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneForId, type TileTone } from "@/lib/mymagnetix/visuals";

const TONE: Record<TileTone, string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
};

/**
 * Cover area for a MyMagnetix card: the real image when there is one,
 * otherwise a soft accent tint with the item's icon (Visual Direction 2 —
 * accents as accents, no loud gradient banner or repeated title text).
 */
export function TileCover({ id, src, icon: Icon, className }: { id: string; src?: string | null; icon: LucideIcon; className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden", src ? "bg-muted" : TONE[toneForId(id)], className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted cover URL
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="flex size-11 items-center justify-center rounded-full bg-card/70">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
