"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { EnergeticDecoderReportsTab } from "@/components/energetic-decoder/reports-tab";
import { EnergeticDecoderReadingsTab } from "@/components/energetic-decoder/readings-tab";
import { EnergeticDecoderThemeCard } from "@/components/energetic-decoder/theme-card";
import { EnergeticDecoderEmbedShareCard } from "@/components/energetic-decoder/embed-share-card";

type Tab = "reports" | "readings" | "design" | "share";

/**
 * Structured after researching bodygraph.com (2026-08-05, at her request,
 * twice — the second pass specifically on their Report Editor): its
 * "dashboard" is a practitioner business tool, not a personal dashboard
 * for whoever gets a reading. Rebuilt as real tabs instead of one long
 * stacked page, per her mockup review: Reports (build what you're
 * selling — sequences + per-gate content) lands first, then Readings
 * (saved client charts), Design (branding), Share (embed/link/QR).
 */
export default function EnergeticDecoderPage() {
  const { subAccountId } = useSubAccount();
  const [tab, setTab] = useState<Tab>("reports");

  const tabs: { key: Tab; label: string }[] = [
    { key: "reports", label: "Reports" },
    { key: "readings", label: "Readings" },
    { key: "design", label: "Design" },
    { key: "share", label: "Share" },
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
          Gene Keys, Human Design, and astrology chart readings — pick
          whichever system(s) you offer. Gene Keys is live; Human Design
          and astrology are coming.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative top-px border-b-2 px-1 pb-2.5 mr-5 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "reports" && <EnergeticDecoderReportsTab />}
      {tab === "readings" && <EnergeticDecoderReadingsTab />}
      {tab === "design" && <EnergeticDecoderThemeCard />}
      {tab === "share" && <EnergeticDecoderEmbedShareCard subAccountId={subAccountId} />}
    </div>
  );
}
