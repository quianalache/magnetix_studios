"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import type { YtcsVideoProject } from "@/types/ytcs";

/**
 * Video Library — Phase 1 shows the real project list (same underlying
 * data as Video Workspace's list; there is one real list, not two) with
 * status counts. The fuller ecosystem/ecosystem-snapshot analytics
 * (Top Topics, Missing Data nudges — migration spec §15) are explicitly
 * a later phase, not invented here.
 */
export default function VideoLibraryPage() {
  const { subAccountId, saPath } = useSubAccount();
  const router = useRouter();
  const [projects, setProjects] = useState<YtcsVideoProject[] | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos`)
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => setProjects([]));
  }, [subAccountId]);

  const total = projects?.length ?? 0;
  const published = projects?.filter((p) => p.status === "Published").length ?? 0;
  const inProgress = total - published;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{total} total</span>
        <span>{inProgress} in progress</span>
        <span>{published} published</span>
      </div>

      {projects === null && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {projects?.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No video projects yet.
        </p>
      )}
      <div className="space-y-2">
        {projects?.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => router.push(saPath(`/youtube-studio/workspace/${p.id}`))}
            className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Video className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name || "Untitled Video Project"}</p>
              <p className="text-xs text-muted-foreground">
                {p.startingPointType ?? "—"} · Step: {p.currentStep ?? "Input"} · Status: {p.status ?? "—"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
