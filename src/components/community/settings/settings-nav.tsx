import {
  Bell,
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
import { cn } from "@/lib/utils";

/**
 * Community Settings left nav. Establishes the future section architecture
 * from the approved mockup, but only "General" is wired up in this task —
 * every other item is intentionally inert (no href, disabled styling, no
 * hidden functionality behind it), per the explicit "do not secretly
 * implement the other sections" instruction.
 */
const SECTIONS: { key: string; label: string; icon: typeof SettingsIcon; active?: boolean }[] = [
  { key: "general", label: "General", icon: SettingsIcon, active: true },
  { key: "branding", label: "Branding & Appearance", icon: Palette },
  { key: "navigation", label: "Navigation & Channels", icon: LayoutGrid },
  { key: "access", label: "Access & Membership", icon: Shield },
  { key: "home", label: "Community Home", icon: Layers },
  { key: "gamification", label: "Gamification", icon: Trophy },
  { key: "notifications", label: "Notifications & Digest", icon: Bell },
  { key: "moderation", label: "Moderation", icon: Gauge },
  { key: "integrations", label: "Integrations", icon: Puzzle },
  { key: "advanced", label: "Advanced", icon: SlidersHorizontal },
];

export function SettingsNav({ brand }: { brand: string }) {
  return (
    <nav className="space-y-0.5">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#909090]">
        Settings
      </p>
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.key}
            aria-disabled={!s.active}
            aria-current={s.active ? "page" : undefined}
            title={s.active ? undefined : "Coming soon"}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
              s.active ? "text-white" : "cursor-not-allowed text-[#b4b4b4]",
            )}
            style={s.active ? { backgroundColor: brand } : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
