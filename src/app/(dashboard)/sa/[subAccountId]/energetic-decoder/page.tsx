"use client";

import { useState } from "react";
import { Sparkles, Home, ClipboardList, LayoutTemplate, BookOpen, ScrollText, Palette, Share2 } from "lucide-react";
import { EnergeticDecoderHomeTab, type EnergeticDecoderHomeTarget } from "@/components/energetic-decoder/home-tab";
import { EnergeticDecoderReportsTab } from "@/components/energetic-decoder/reports-tab";
import { EnergeticDecoderReportBuilderTab } from "@/components/energetic-decoder/report-builder-tab";
import { EnergeticDecoderContentTab } from "@/components/energetic-decoder/content-tab";
import { EnergeticDecoderReadingsTab } from "@/components/energetic-decoder/readings-tab";
import { EnergeticDecoderChartDesignsTab } from "@/components/energetic-decoder/chart-designs-tab";
import { EnergeticDecoderEmbedsTab } from "@/components/energetic-decoder/embeds-tab";

type Tab = "home" | "reports" | "builder" | "content" | "readings" | "chartDesigns" | "embeds";

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
  const [tab, setTab] = useState<Tab>("home");

  // Icon per tab, plain text-primary when active — same locked-in rule as
  // Growth/Projects (2026-08-08): icons don't carry per-tab hue, only
  // card backgrounds do.
  const tabs: { key: Tab; label: string; icon: typeof Sparkles }[] = [
    { key: "home", label: "Home", icon: Home },
    { key: "readings", label: "Readings", icon: ScrollText },
    { key: "reports", label: "Reports", icon: ClipboardList },
    { key: "builder", label: "Report Builder", icon: LayoutTemplate },
    { key: "content", label: "Content", icon: BookOpen },
    { key: "chartDesigns", label: "Chart Designs", icon: Palette },
    { key: "embeds", label: "Embeds", icon: Share2 },
  ];

  function goto(target: EnergeticDecoderHomeTarget) {
    setTab(target);
  }

  return (
    <div className="momentum-scope mx-auto w-full max-w-6xl space-y-6 rounded-2xl">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Energetic Decoder</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Gene Keys, Human Design, and Astrology chart readings — pick
          whichever system(s) you offer, all live.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative top-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2.5 mr-5 text-sm font-semibold transition-colors ${
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
      {tab === "reports" && <EnergeticDecoderReportsTab />}
      {tab === "builder" && <EnergeticDecoderReportBuilderTab />}
      {tab === "content" && <EnergeticDecoderContentTab />}
      {tab === "readings" && <EnergeticDecoderReadingsTab />}
      {tab === "chartDesigns" && <EnergeticDecoderChartDesignsTab />}
      {tab === "embeds" && <EnergeticDecoderEmbedsTab />}
    </div>
  );
}
