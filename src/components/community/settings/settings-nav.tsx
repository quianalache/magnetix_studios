import Link from "next/link";
import {
  Bell,
  Download,
  Gauge,
  Layers,
  LayoutGrid,
  Palette,
  Puzzle,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import {
  communitySettingsBrandingHref,
  communitySettingsHref,
  communitySettingsNavigationHref,
  communitySettingsPointsRewardsHref,
  communitySettingsSkoolImportHref,
  type CommunityLinkBase,
} from "@/lib/community/routes";
import { cn } from "@/lib/utils";

export type SettingsSection = "general" | "branding" | "navigation" | "points-rewards" | "skool-import";

/**
 * Community Settings left nav. General, Branding, Navigation, and (as of
 * the Points & Rewards feature) Points & Rewards are real, navigable
 * sections now — every other item stays exactly as it was before:
 * intentionally inert (no href, disabled styling, no hidden functionality
 * behind it), per the explicit "do not secretly implement the other
 * sections" instruction. "Gamification" is REMOVED from this inert list
 * (not renamed in place) — it's promoted to the real "Points & Rewards"
 * entry above instead, per the explicit "Gamification / Gamification &
 * Rewards → Points & Rewards" naming instruction, used consistently
 * throughout Settings.
 */
const INERT_SECTIONS: { key: string; label: string; icon: typeof SettingsIcon }[] = [
  { key: "access", label: "Access & Membership", icon: Shield },
  { key: "home", label: "Community Home", icon: Layers },
  { key: "notifications", label: "Notifications & Digest", icon: Bell },
  { key: "moderation", label: "Moderation", icon: Gauge },
  { key: "integrations", label: "Integrations", icon: Puzzle },
  { key: "advanced", label: "Advanced", icon: SlidersHorizontal },
];

export function SettingsNav({
  brand,
  active,
  link,
  groupSlug,
}: {
  brand: string;
  active: SettingsSection;
  /** `{ saId, pretty }` — the same base every other community href builder
   *  in this codebase takes, so General <-> Branding navigation respects
   *  the opaque vs. custom-domain route shape automatically. */
  link: CommunityLinkBase;
  groupSlug: string;
}) {
  const sections: { key: SettingsSection; label: string; icon: typeof SettingsIcon; href: string }[] = [
    { key: "general", label: "General", icon: SettingsIcon, href: communitySettingsHref(link, groupSlug) },
    { key: "branding", label: "Branding", icon: Palette, href: communitySettingsBrandingHref(link, groupSlug) },
    { key: "navigation", label: "Navigation", icon: LayoutGrid, href: communitySettingsNavigationHref(link, groupSlug) },
    { key: "points-rewards", label: "Points & Rewards", icon: Trophy, href: communitySettingsPointsRewardsHref(link, groupSlug) },
    { key: "skool-import", label: "Skool Import", icon: Download, href: communitySettingsSkoolImportHref(link, groupSlug) },
  ];

  return (
    <nav className="space-y-0.5">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#909090]">
        Settings
      </p>
      {sections.map((s) => {
        const Icon = s.icon;
        const isActive = s.key === active;
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "text-white" : "text-[#3a3a44] hover:bg-[#F5F4F2]",
            )}
            style={isActive ? { backgroundColor: brand } : undefined}
          >
            <span className="flex items-center gap-2 truncate">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </span>
            {s.key === "skool-import" && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                  isActive ? "bg-white/25 text-white" : "bg-[#7C3AED]/10 text-[#7C3AED]",
                )}
              >
                New
              </span>
            )}
          </Link>
        );
      })}
      {INERT_SECTIONS.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.key}
            aria-disabled="true"
            title="Coming soon"
            className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#b4b4b4]"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
