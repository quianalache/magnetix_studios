"use client";

import { useState } from "react";
import { Sparkles, ClipboardList, LayoutTemplate, BookOpen, ScrollText, Palette, Share2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { EnergeticDecoderReportsTab } from "@/components/energetic-decoder/reports-tab";
import { EnergeticDecoderReportBuilderTab } from "@/components/energetic-decoder/report-builder-tab";
import { EnergeticDecoderContentTab } from "@/components/energetic-decoder/content-tab";
import { EnergeticDecoderReadingsTab } from "@/components/energetic-decoder/readings-tab";
import { EnergeticDecoderThemeCard } from "@/components/energetic-decoder/theme-card";
import { EnergeticDecoderEmbedShareCard } from "@/components/energetic-decoder/embed-share-card";

type Tab = "reports" | "builder" | "content" | "readings" | "design" | "share";

/**
 * Structured after researching bodygraph.com (2026-08-05, then again more
 * thoroughly 2026-08-08 at her explicit request — read their real Help
 * Centre, not search summaries): their practitioner tool splits Chart
 * Design (visual), Chart Content/Language (the interpretive text library,
 * a single source of truth), and Reading Reports (assembly/delivery only
 * — reports reference content via shortcodes, never store gate text
 * directly) into three separate tools. The first build here nested gate
 * content inside Reports, which she correctly called out as not matching
 * that model. Content is now its own tab, mirroring the real split:
 * Content decides WHAT A GATE SAYS, Reports decides WHAT'S INCLUDED.
 */
export default function EnergeticDecoderPage() {
  const { subAccountId } = useSubAccount();
  const [tab, setTab] = useState<Tab>("reports");

  // Icon per tab, plain text-primary when active — same locked-in rule as
  // Growth/Projects (2026-08-08): icons don't carry per-tab hue, only
  // MomentumOS-modeled pages (Growth, Content Library) get momentum-scope;
  // this isn't one of those, it stays on the app's own native theme.
  // Design's Palette and Share's Share2 still match the icons those two
  // tabs' own cards (theme-card.tsx, embed-share-card.tsx) use internally.
  const tabs: { key: Tab; label: string; icon: typeof Sparkles }[] = [
    { key: "reports", label: "Reports", icon: ClipboardList },
    { key: "builder", label: "Report Builder", icon: LayoutTemplate },
    { key: "content", label: "Content", icon: BookOpen },
    { key: "readings", label: "Readings", icon: ScrollText },
    { key: "design", label: "Design", icon: Palette },
    { key: "share", label: "Share", icon: Share2 },
  ];

  return (
    <div className="momentum-scope mx-auto w-full max-w-3xl space-y-6 rounded-2xl">
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

      <div className="flex gap-1 border-b">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative top-px flex items-center gap-1.5 border-b-2 px-1 pb-2.5 mr-5 text-sm font-semibold transition-colors ${
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

      {tab === "reports" && <EnergeticDecoderReportsTab />}
      {tab === "builder" && <EnergeticDecoderReportBuilderTab />}
      {tab === "content" && <EnergeticDecoderContentTab />}
      {tab === "readings" && <EnergeticDecoderReadingsTab />}
      {tab === "design" && <EnergeticDecoderThemeCard />}
      {tab === "share" && <EnergeticDecoderEmbedShareCard subAccountId={subAccountId} />}
    </div>
  );
}
