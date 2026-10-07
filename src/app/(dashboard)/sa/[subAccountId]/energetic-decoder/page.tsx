"use client";

import { useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Home, LayoutTemplate, BookOpen, ScrollText, Palette, Share2 } from "lucide-react";
import { EnergeticDecoderHomeTab, type EnergeticDecoderHomeTarget } from "@/components/energetic-decoder/home-tab";
import { EnergeticDecoderReportBuilderTab } from "@/components/energetic-decoder/report-builder-tab";
import { EnergeticDecoderContentTab } from "@/components/energetic-decoder/content-tab";
import { EnergeticDecoderReadingsTab } from "@/components/energetic-decoder/readings-tab";
import { EnergeticDecoderChartDesignsTab } from "@/components/energetic-decoder/chart-designs-tab";
import { EnergeticDecoderEmbedsTab } from "@/components/energetic-decoder/embeds-tab";
import { TAB_STRIP_CLASS, useActiveTabVisible } from "@/components/energetic-decoder/tab-strip";

type Tab = "home" | "builder" | "content" | "readings" | "chartDesigns" | "embeds";

const VALID_TABS: Tab[] = ["home", "builder", "content", "readings", "chartDesigns", "embeds"];

/**
 * Structured after researching bodygraph.com (2026-08-05, then again more
 * thoroughly 2026-08-08/09 at her explicit request). Rev 2 of the tab
 * structure (2026-08-09), her 3rd round of feedback on this specific
 * question — she wanted a real Home overview up front and Design/Share
 * converted from single global-settings forms into real list-first,
 * multi-item tabs (bodygraph.com's own pattern: a Chart Design list you
 * create presets in, an Embed list of named codes) — "you have your chart
 * design page, which then gives you a list of the different chart
 * designs... a different tab for embed chart." Approved via Claude Artifact
 * mockup before any of this was written.
 *
 * `.momentum-scope` below is intentional, not a leftover — she asked
 * (2026-08-09) for this page's cards to use the same per-card color
 * rotation Growth uses (bg-card/bg-secondary/bg-accent/bg-muted), which are
 * momentum-scope tokens; Growth is momentum-scope too. An earlier comment
 * here claimed this page "stays on the app's own native theme," which was
 * simply wrong — the class was already applied and just never used to its
 * intended effect until this pass.
 */
export default function EnergeticDecoderPage() {
  // The module tab IS the URL's `?tab=` (2026-10-07). No `?tab=` — which
  // is exactly what the sidebar's Energetic Decoder link opens — means
  // Home, the owner's locked module entry point. (Decision 3's "Readings by
  // default" is retired: it made a sidebar click land in Readings, and the
  // old Readings tab then auto-opened the newest reading — "Staff QA Test".)
  // Intentional deep links always name their tab (`?tab=readings&profileId=…`
  // from Contact → View Chart, `?tab=builder` from the Report Editor, …), so
  // they still land where they point. Deriving the tab from the URL instead
  // of one-time state also means a sidebar click while already inside the
  // module resets to Home, and Back/Forward move between tabs.
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = VALID_TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "home";
  const router = useRouter();
  const pathname = usePathname();

  /** Switching module tabs is a navigation (`?tab=…` only), so Readings' own params never leak into another tab and Back returns to the previous tab. */
  function selectTab(next: Tab) {
    if (next === tab && !searchParams.get("profileId") && !searchParams.get("readingId") && !searchParams.get("set")) return;
    router.push(`${pathname}?tab=${next}`, { scroll: false });
  }

  // Icon per tab, plain text-primary when active — same locked-in rule as
  // Growth/Projects (2026-08-08): icons don't carry per-tab hue, only
  // card backgrounds do.
  const tabs: { key: Tab; label: string; icon: typeof Sparkles }[] = [
    { key: "home", label: "Home", icon: Home },
    { key: "readings", label: "Readings", icon: ScrollText },
    { key: "builder", label: "Report Builder", icon: LayoutTemplate },
    { key: "content", label: "Content", icon: BookOpen },
    { key: "chartDesigns", label: "Chart Designs", icon: Palette },
    { key: "embeds", label: "Embeds", icon: Share2 },
  ];

  const tabStripRef = useRef<HTMLDivElement>(null);
  useActiveTabVisible(tabStripRef, tab);

  function goto(target: EnergeticDecoderHomeTarget) {
    selectTab(target);
  }

  return (
    // Phones: a slimmer frame than momentum-scope's shared 1.5rem (this page only; `!` because that rule is unlayered CSS).
    <div className="momentum-scope mx-auto w-full min-w-0 max-w-6xl space-y-6 rounded-2xl max-sm:!p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Energetic Decoder</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Frequency, Human Design, and Astrology chart readings — pick
          whichever system(s) you offer, all live.
        </p>
      </div>

      {/* Module tabs — on a phone they scroll sideways INSIDE this strip
          only (touch-pan-x + overscroll-x-contain: no vertical drag, no
          bounce into the page); the page itself never scrolls sideways. */}
      <div
        ref={tabStripRef}
        className={`${TAB_STRIP_CLASS} shadow-[inset_0_-1px_0_var(--border)]`}
        role="tablist"
        data-module-tabs
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2.5 mr-5 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? "text-primary" : "opacity-60"}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "home" && <EnergeticDecoderHomeTab onGoto={goto} />}
      {tab === "builder" && <EnergeticDecoderReportBuilderTab />}
      {tab === "content" && <EnergeticDecoderContentTab />}
      {tab === "readings" && (
        <EnergeticDecoderReadingsTab />
      )}
      {tab === "chartDesigns" && <EnergeticDecoderChartDesignsTab />}
      {tab === "embeds" && <EnergeticDecoderEmbedsTab />}
    </div>
  );
}
