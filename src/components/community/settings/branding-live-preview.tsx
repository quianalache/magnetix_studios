import { Bell, Heart, MessageCircle, Search } from "lucide-react";
import type { CommunityThemeColors } from "@/types/community";

/**
 * Branding's "Live Theme Preview" (Part 8) — deliberately NOT the General
 * tab's `LivePreviewPanel` (that one answers "what does my community's
 * NAME/LOGO/COVER look like" by rendering real Home components with a
 * synthetic group). This one answers a different question — "what do
 * these COLORS actually change" — so it's a purpose-built miniature
 * Community interface (header/nav, buttons, tabs, post cards, a right-rail
 * card) painted entirely from the six theme roles via inline styles, the
 * same technique every real Community component already uses for its own
 * single `brand` color. Every color role gets used somewhere visible here,
 * on purpose — a moderator changing any one of the six should be able to
 * point at what moved.
 */
export function BrandingLivePreview({ colors }: { colors: CommunityThemeColors }) {
  return (
    <div
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{ backgroundColor: colors.background, borderColor: colors.surface === colors.background ? `${colors.text}22` : colors.surface }}
    >
      {/* Header / nav */}
      <div
        className="flex items-center gap-3 border-b px-3 py-2.5"
        style={{ backgroundColor: colors.surface, borderColor: `${colors.text}14` }}
      >
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
          style={{ backgroundColor: colors.primary }}
        >
          M
        </div>
        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-[10px]"
          style={{ backgroundColor: colors.background, color: `${colors.text}99` }}
        >
          <Search className="h-3 w-3 shrink-0" />
          <span className="truncate">Search community…</span>
        </div>
        <Bell className="h-3.5 w-3.5 shrink-0" style={{ color: `${colors.text}99` }} />
        <div
          className="h-5 w-5 shrink-0 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />
      </div>

      {/* Nav tabs */}
      <div
        className="flex items-center gap-3 border-b px-3 py-1.5 text-[10px] font-medium"
        style={{ backgroundColor: colors.surface, borderColor: `${colors.text}14` }}
      >
        {["Home", "Classroom", "Events", "About"].map((tab, i) => (
          <span
            key={tab}
            className="border-b-2 pb-1"
            style={{
              borderColor: i === 0 ? colors.primary : "transparent",
              color: i === 0 ? colors.primary : `${colors.text}80`,
            }}
          >
            {tab}
          </span>
        ))}
        <button
          type="button"
          className="ml-auto rounded-md px-2 py-1 text-[10px] font-semibold text-white"
          style={{ backgroundColor: colors.primaryAction }}
        >
          + New Post
        </button>
      </div>

      {/* Body */}
      <div className="space-y-2.5 p-3">
        {/* Post card */}
        <div
          className="space-y-1.5 rounded-lg border p-2.5"
          style={{ backgroundColor: colors.surface, borderColor: `${colors.text}14` }}
        >
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: colors.accent }} />
            <span className="text-[10px] font-semibold" style={{ color: colors.text }}>
              Quiana LaChé
            </span>
            <span className="text-[9px]" style={{ color: `${colors.text}66` }}>
              2h ago
            </span>
          </div>
          <p className="text-[10px] font-semibold" style={{ color: colors.text }}>
            Just launched my new course!
          </p>
          <p className="text-[9px] leading-snug" style={{ color: `${colors.text}99` }}>
            After months of planning, I&apos;m excited to finally share this with you.{" "}
            <span style={{ color: colors.accent }}>#launch</span>
          </p>
          <div className="flex items-center gap-3 pt-1 text-[9px]" style={{ color: `${colors.text}80` }}>
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" style={{ color: colors.accent }} /> 24
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> 8
            </span>
          </div>
        </div>

        {/* Second, quieter post card + right-rail card, side by side */}
        <div className="grid grid-cols-[1fr_78px] gap-2.5">
          <div
            className="space-y-1 rounded-lg border p-2.5"
            style={{ backgroundColor: colors.surface, borderColor: `${colors.text}14` }}
          >
            <p className="text-[9px] font-semibold" style={{ color: colors.text }}>
              Best tools for course creation?
            </p>
            <p className="text-[8px]" style={{ color: `${colors.text}80` }}>
              Marcus Thompson · Questions
            </p>
          </div>
          <div
            className="flex flex-col items-center justify-center gap-0.5 rounded-lg p-2 text-center"
            style={{ backgroundColor: colors.primary }}
          >
            <span className="text-[13px] font-bold leading-none text-white">24</span>
            <span className="text-[7px] leading-none text-white/80">AUG</span>
            <span className="mt-1 text-[7px] leading-tight text-white">Live Q&A</span>
          </div>
        </div>
      </div>
    </div>
  );
}
