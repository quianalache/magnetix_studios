import type { CommunityGroup } from "@/types/community";

/**
 * Community Home hero banner (Part 3). Purely presentational — built from
 * fields that already existed on `CommunityGroup` before this task
 * (`coverUrl`, `tagline`, `name`, `brandColor`); no new branding fields were
 * introduced. Member/online/admin counts deliberately do NOT appear here —
 * those live in `AboutCommunityCard` per Part 2's explicit "don't duplicate
 * stats in the banner" instruction.
 */
export function CommunityBanner({
  group,
  brand,
}: {
  group: CommunityGroup;
  brand: string;
}) {
  const image = group.coverUrl;

  return (
    <div
      className="relative flex min-h-40 w-full flex-col justify-end overflow-hidden rounded-xl border border-[#E4E4E4] p-6 sm:min-h-48"
      style={
        image
          ? { backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { backgroundColor: brand }
      }
    >
      {image && (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}
      <div className="relative">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{group.name}</h1>
        {group.tagline?.trim() && (
          <p className="mt-1.5 max-w-xl text-sm text-white/85 sm:text-base">
            {group.tagline}
          </p>
        )}
      </div>
    </div>
  );
}
