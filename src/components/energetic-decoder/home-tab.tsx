"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, LayoutTemplate, Palette, ScrollText, Share2, Sparkles } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/system/metric-card";
import { EmptyState } from "@/components/system/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DecoderEditorialPage } from "@/components/energetic-decoder/decoder-shell";

/** Must match the Tab union in page.tsx — kept here as a subset so this file doesn't need to import the page component. */
export type EnergeticDecoderHomeTarget = "readings" | "builder" | "content" | "chartDesigns" | "embeds";

interface HomeStats {
  totalReadings: number;
  readingsToday: number;
  reportDesignCount: number;
  chartDesignCount: number;
  embedCount: number;
  recent: { id: string; name: string; system: string; createdAt: string | null }[];
}

/**
 * Home — the overview tab she asked for directly (2026-08-09): "for home...
 * it could be something like quick links... reports downloaded today...
 * reports purchased today, charts purchased today... We need more." Real
 * countable stats only — no invented "reports purchased today" style
 * revenue figures, since there's no Stripe purchase record for reports yet
 * to make that real (flagged, not silently faked).
 *
 * v2 (2026-10-16): the module's editorial landing — serif header with the
 * planet, white figure cards, Recent readings beside Jump to. No New reading
 * / Reading configuration here (owner decision): those live on Readings.
 */
export function EnergeticDecoderHomeTab({ onGoto }: { onGoto: (t: EnergeticDecoderHomeTarget) => void }) {
  const { subAccountId } = useSubAccount();
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/home-stats`)
      .then((r) => r.json())
      .then((d) => setStats(d.stats ?? null))
      .catch(() => setStats(null));
  }, [subAccountId]);

  const links: { target: EnergeticDecoderHomeTarget; label: string; desc: string; icon: typeof ScrollText; tone: Tone }[] = [
    { target: "readings", label: "Readings", desc: "See a client's saved chart", icon: ScrollText, tone: "violet" },
    { target: "builder", label: "Report Builder", desc: "Edit a personalized report design", icon: LayoutTemplate, tone: "pink" },
    { target: "content", label: "Content", desc: "Rewrite what a gate or type says", icon: BookOpen, tone: "gold" },
    { target: "chartDesigns", label: "Chart Designs", desc: "Manage saved chart color presets", icon: Palette, tone: "aqua" },
    { target: "embeds", label: "Reading Tools", desc: "Share your Reading on pages, websites and links", icon: Share2, tone: "blue" },
  ];

  return (
    <DecoderEditorialPage
      icon={Sparkles}
      title="Energetic Decoder"
      description="Human Design and Astrology chart readings — pick whichever system(s) you offer. Frequency is coming soon."
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" data-decoder-home-stats>
        <MetricCard icon={ScrollText} tone="violet" label="Total readings" value={stats?.totalReadings ?? "—"} hint={stats ? `+${stats.readingsToday} today` : undefined} loading={!stats} />
        <MetricCard icon={LayoutTemplate} tone="pink" label="Report designs" value={stats?.reportDesignCount ?? "—"} hint="in Report Builder" loading={!stats} />
        <MetricCard icon={Palette} tone="aqua" label="Chart designs" value={stats?.chartDesignCount ?? "—"} hint="saved color presets" loading={!stats} />
        <MetricCard icon={Share2} tone="gold" label="Reading Tools" value={stats?.embedCount ?? "—"} hint="ways people get their Reading" loading={!stats} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card" aria-labelledby="decoder-recent">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <h2 id="decoder-recent" className="text-section font-semibold">Recent readings</h2>
            <button type="button" onClick={() => onGoto("readings")} className="inline-flex items-center gap-1 text-body-sm font-semibold text-link hover:underline">
              View all <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {!stats ? (
            <div className="space-y-2 px-5 pb-5">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : stats.recent.length === 0 ? (
            <EmptyState compact icon={ScrollText} title="No readings yet" description="Readings you create show up here." />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {stats.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-body-sm sm:px-5">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-foreground">{r.name}</span>
                    <span className="text-muted-foreground"> — {systemLabel(r.system)} reading</span>
                  </span>
                  <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 space-y-2.5" aria-labelledby="decoder-jump">
          <h2 id="decoder-jump" className="text-micro font-semibold tracking-[0.12em] text-ink-tertiary uppercase">Jump to</h2>
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <button
                key={l.target}
                type="button"
                onClick={() => onGoto(l.target)}
                className="group flex w-full items-center gap-3 rounded-card border border-border bg-card px-4 py-3 text-left shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop"
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-chip", TONE[l.tone])}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-foreground">{l.label}</span>
                  <span className="block truncate text-caption text-muted-foreground">{l.desc}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-link transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            );
          })}
        </section>
      </div>
    </DecoderEditorialPage>
  );
}

type Tone = "violet" | "pink" | "gold" | "aqua" | "blue";
const TONE: Record<Tone, string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
};

function systemLabel(system: string): string {
  if (system === "mixed") return "Human Design + Astrology";
  if (system === "humanDesign") return "Human Design";
  if (system === "astrology") return "Astrology";
  return "Frequency";
}
