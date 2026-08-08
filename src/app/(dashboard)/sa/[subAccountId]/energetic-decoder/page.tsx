"use client";

import { useState } from "react";
import { Sparkles, ClipboardList, BookOpen, ScrollText, Palette, Share2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { EnergeticDecoderReportsTab } from "@/components/energetic-decoder/reports-tab";
import { EnergeticDecoderContentTab } from "@/components/energetic-decoder/content-tab";
import { EnergeticDecoderReadingsTab } from "@/components/energetic-decoder/readings-tab";
import { EnergeticDecoderThemeCard } from "@/components/energetic-decoder/theme-card";
import { EnergeticDecoderEmbedShareCard } from "@/components/energetic-decoder/embed-share-card";

type Tab = "reports" | "content" | "readings" | "design" | "share";

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

  // Colored icons per tab — same standard as AI Agents' channel nav and
  // now Growth/Projects (2026-08-08), her real palette tones. Design's
  // Palette and Share's Share2 match the icons those two tabs' own cards
  // (theme-card.tsx, embed-share-card.tsx) already use internally.
  const tabs: { key: Tab; label: string; icon: typeof Sparkles; tone: string }[] = [
    { key: "reports", label: "Reports", icon: ClipboardList, tone: "text-[#5E2574] dark:text-[#C892DE]" },
    { key: "content", label: "Content", icon: BookOpen, tone: "text-teal-700 dark:text-[#9EDBDD]" },
    { key: "readings", label: "Readings", icon: ScrollText, tone: "text-[#9C3A5C] dark:text-[#E8B7C8]" },
    { key: "design", label: "Design", icon: Palette, tone: "text-[#6B3F84] dark:text-[#EDD9EC]" },
    { key: "share", label: "Share", icon: Share2, tone: "text-[#A8386B] dark:text-[#F3D9D7]" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
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
              <Icon className={`h-3.5 w-3.5 ${isActive ? t.tone : "opacity-60"}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "reports" && <EnergeticDecoderReportsTab />}
      {tab === "content" && <EnergeticDecoderContentTab />}
      {tab === "readings" && <EnergeticDecoderReadingsTab />}
      {tab === "design" && <EnergeticDecoderThemeCard />}
      {tab === "share" && <EnergeticDecoderEmbedShareCard subAccountId={subAccountId} />}
    </div>
  );
}
