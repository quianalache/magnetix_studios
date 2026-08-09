"use client";

import { useEffect, useState } from "react";
import {
  ScrollText, Wand2, LayoutTemplate, Palette, BookOpen, Share2, ClipboardList,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";

/** Must match the Tab union in page.tsx — kept here as a subset so this file doesn't need to import the page component. */
export type EnergeticDecoderHomeTarget = "readings" | "builder" | "content" | "chartDesigns" | "embeds" | "reports";

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

  const links: { target: EnergeticDecoderHomeTarget; label: string; desc: string; icon: typeof ScrollText }[] = [
    { target: "readings", label: "Readings", desc: "See a client's saved chart", icon: ScrollText },
    { target: "builder", label: "Report Builder", desc: "Edit a personalized report design", icon: LayoutTemplate },
    { target: "chartDesigns", label: "Chart Designs", desc: "Manage saved chart color presets", icon: Palette },
    { target: "content", label: "Content", desc: "Rewrite what a gate or type says", icon: BookOpen },
    { target: "embeds", label: "Embeds", desc: "Manage embed codes for your site", icon: Share2 },
    { target: "reports", label: "Reports", desc: "Pricing + what each system includes", icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HomeStat icon={ScrollText} bg="bg-card" label="Total readings" value={stats?.totalReadings} hint={stats ? `+${stats.readingsToday} today` : undefined} />
        <HomeStat icon={LayoutTemplate} bg="bg-secondary" label="Report designs" value={stats?.reportDesignCount} hint="in Report Builder" />
        <HomeStat icon={Wand2} bg="bg-accent/20" label="Chart designs" value={stats?.chartDesignCount} hint="saved color presets" />
        <HomeStat icon={Share2} bg="bg-muted" label="Embeds" value={stats?.embedCount} hint="links you've created" />
      </div>

      <div>
        <p className="mb-2.5 text-sm font-semibold">Jump to</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <button
                key={l.target}
                type="button"
                onClick={() => onGoto(l.target)}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-sm hover:border-primary"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/30 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{l.label}</p>
                  <p className="text-xs text-muted-foreground">{l.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-sm font-semibold">Recent activity</p>
        {!stats ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
        ) : stats.recent.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No readings yet.</p>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {stats.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{r.name} — {systemLabel(r.system)} reading</span>
                <span className="shrink-0 text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function systemLabel(system: string): string {
  if (system === "mixed") return "Human Design + Astrology";
  if (system === "humanDesign") return "Human Design";
  if (system === "astrology") return "Astrology";
  return "Gene Keys";
}

function HomeStat({
  icon: Icon,
  label,
  value,
  hint,
  bg,
}: {
  icon: typeof ScrollText;
  label: string;
  value: number | undefined;
  hint?: string;
  bg: string;
}) {
  return (
    <div className={cn("rounded-lg border-none shadow-sm", bg)}>
      <div className="flex flex-row items-center justify-between gap-2 p-6 pb-2">
        <h3 className="text-sm font-medium tracking-tight text-foreground">{label}</h3>
        <Icon className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <div className="p-6 pt-0">
        <div className="text-2xl font-bold tabular-nums text-foreground">{value ?? "—"}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
