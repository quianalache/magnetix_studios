"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/system/status-pill";

export type ModeFilter = "all" | "live" | "test";

/** Absolute local timestamp, matching the webhook settings rows. */
export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return d.toLocaleString();
}

/** Tailwind text colour for an HTTP status code. 0 = never attempted. */
export function httpStatusClass(status: number | null): string {
  if (!status) return "text-muted-foreground";
  if (status >= 200 && status < 300) return "text-status-success-fg";
  if (status >= 300 && status < 400) return "text-status-info-fg";
  if (status >= 400 && status < 500) return "text-status-warning-fg";
  return "text-status-danger-fg";
}

export function ModeBadge({ mode }: { mode: "live" | "test" }) {
  return (
    <StatusPill tone={mode === "live" ? "success" : "warning"} className="shrink-0 capitalize">
      {mode}
    </StatusPill>
  );
}

/**
 * Shared toolbar: a live/test/all segmented filter on the left, a result
 * count + refresh button on the right.
 */
export function LogToolbar({
  mode,
  onModeChange,
  count,
  loading,
  onRefresh,
}: {
  mode: ModeFilter;
  onModeChange: (m: ModeFilter) => void;
  count: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  const modes: ModeFilter[] = ["all", "live", "test"];
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <SegmentedControl
        value={mode}
        onChange={onModeChange}
        options={modes.map((m) => ({ value: m, label: m === "all" ? "All" : m === "live" ? "Live" : "Test" }))}
      />
      <div className="flex items-center gap-3">
        <span className="text-caption text-muted-foreground tabular-nums">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>
    </div>
  );
}

/** Monospace block for headers / body excerpts in the expanded detail. */
export function CodeBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  let pretty = value;
  try {
    pretty = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    // Not JSON — show raw.
  }
  return (
    <div className="space-y-1">
      <p className="text-micro font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto rounded-control border border-border bg-surface-sunken p-2 font-mono text-caption leading-relaxed text-foreground">
        {pretty}
      </pre>
    </div>
  );
}
