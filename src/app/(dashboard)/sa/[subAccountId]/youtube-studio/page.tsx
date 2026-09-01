"use client";

import { useEffect, useState } from "react";
import { Video, Lightbulb, LayoutList, BrainCircuit, ArrowRight, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { StatCard } from "@/components/ui/stat-card";
import type { YtcsIdea, YtcsVideoProject } from "@/types/ytcs";

/**
 * YTCS Dashboard — entry points matching the original tool's real
 * Dashboard (migration spec §3: Set Up Channel Brain / Start a Video
 * Project / Save a Quick Idea, plus the 4 real stat counters), adapted
 * for Business Brain's new shared ownership. Real data only — no
 * ecosystem/analytics metrics that weren't part of the real product.
 */
export default function YtcsDashboardPage() {
  const { subAccountId, saPath } = useSubAccount();
  const [videos, setVideos] = useState<YtcsVideoProject[] | null>(null);
  const [ideas, setIdeas] = useState<YtcsIdea[] | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos`)
      .then((r) => r.json())
      .then((d) => !cancelled && setVideos(d.projects ?? []))
      .catch(() => !cancelled && setVideos([]));
    fetch(`/api/sub-accounts/${subAccountId}/ytcs/ideas`)
      .then((r) => r.json())
      .then((d) => !cancelled && setIdeas(d.ideas ?? []))
      .catch(() => !cancelled && setIdeas([]));
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  const loading = videos === null || ideas === null;
  const totalVideos = videos?.length ?? 0;
  const published = videos?.filter((v) => v.status === "Published").length ?? 0;
  const inProgress = totalVideos - published;
  const totalIdeas = ideas?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Lightbulb className="h-4 w-4" />}
          iconBg="bg-amber-500/10"
          tone="text-amber-600 dark:text-amber-400"
          label="Total Saved Ideas"
          value={loading ? <Loader2 className="h-5 w-5 animate-spin" /> : totalIdeas}
          loading={loading}
        />
        <StatCard
          icon={<Video className="h-4 w-4" />}
          iconBg="bg-violet-500/10"
          tone="text-violet-600 dark:text-violet-400"
          label="Total Video Projects"
          value={totalVideos}
          loading={loading}
        />
        <StatCard
          icon={<LayoutList className="h-4 w-4" />}
          iconBg="bg-blue-500/10"
          tone="text-blue-600 dark:text-blue-400"
          label="Videos In Progress"
          value={inProgress}
          loading={loading}
        />
        <StatCard
          icon={<ArrowRight className="h-4 w-4" />}
          iconBg="bg-emerald-500/10"
          tone="text-emerald-600 dark:text-emerald-400"
          label="Published Videos"
          value={published}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href={saPath("/youtube-studio/workspace")}
          className="group rounded-2xl border bg-card p-5 transition-all hover:-translate-y-px hover:border-primary/30"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Video className="h-4 w-4" />
          </span>
          <h3 className="mt-3 text-base font-semibold">Start a Video Project</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Move one video from idea to title, outline, script, and publish prep.
          </p>
        </a>

        <a
          href={saPath("/youtube-studio/ideas")}
          className="group rounded-2xl border bg-card p-5 transition-all hover:-translate-y-px hover:border-primary/30"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Lightbulb className="h-4 w-4" />
          </span>
          <h3 className="mt-3 text-base font-semibold">Save a Quick Idea</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop in the random thoughts and hot takes before they vanish.
          </p>
        </a>
      </div>

      <a
        href={saPath("/dashboard/settings")}
        className="flex items-center gap-3 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-px hover:border-primary/30"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <BrainCircuit className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Business Brain</h3>
          <p className="text-sm text-muted-foreground">
            Shared context powering your YouTube strategy — audience, voice, offers,
            frameworks, stories, and topics, all editable in Settings.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}
