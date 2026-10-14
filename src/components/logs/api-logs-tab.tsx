"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import type { ApiRequestLogResponse } from "@/types/api";
import {
  CodeBlock,
  fmtTime,
  httpStatusClass,
  LogToolbar,
  ModeBadge,
  type ModeFilter,
} from "./log-shared";

/**
 * Logs → API tab. Lists recent public-API requests (one row per request),
 * newest first, with an expandable detail showing headers + body excerpts.
 */
export function ApiLogsTab() {
  const { subAccountId } = useSubAccount();
  const [logs, setLogs] = useState<ApiRequestLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/logs/api-requests`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        logs?: ApiRequestLogResponse[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load API logs.");
      setLogs(data.logs ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [subAccountId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const visible = useMemo(
    () => (mode === "all" ? logs : logs.filter((l) => l.mode === mode)),
    [logs, mode],
  );

  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-card sm:p-6">
      <LogToolbar
        mode={mode}
        onModeChange={setMode}
        count={visible.length}
        loading={loading}
        onRefresh={refetch}
      />

      {loading && logs.length === 0 ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-control" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-control border border-dashed border-border bg-surface-sunken p-8 text-center">
          <p className="text-body-sm font-semibold">No API requests logged yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Requests made with this sub-account&apos;s{" "}
            <code className="font-mono">lsk_</code> keys appear here. Logs are
            retained for 30 days.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-control border border-border bg-card">
          {visible.map((log) => (
            <ApiLogRow
              key={log.id}
              log={log}
              expanded={expandedId === log.id}
              onToggle={() =>
                setExpandedId((id) => (id === log.id ? null : log.id))
              }
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-caption leading-relaxed text-muted-foreground">
        One row per request hitting <code className="font-mono">/api/v1/*</code>
        . Authorization headers and idempotency keys are redacted at capture
        time; bodies are truncated to 2KB. Use the{" "}
        <code className="font-mono">Request-Id</code> when contacting support.
      </p>
    </section>
  );
}

function ApiLogRow({
  log,
  expanded,
  onToggle,
}: {
  log: ApiRequestLogResponse;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-tint-violet"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="w-12 shrink-0 font-mono text-caption font-semibold uppercase text-muted-foreground">
          {log.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {log.path}
          {log.query ? (
            <span className="text-muted-foreground">?{log.query}</span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-xs font-semibold tabular-nums",
            httpStatusClass(log.responseStatus),
          )}
        >
          {log.responseStatus || "—"}
        </span>
        <span className="hidden w-16 shrink-0 text-right text-caption tabular-nums text-muted-foreground sm:inline">
          {log.latencyMs}ms
        </span>
        <ModeBadge mode={log.mode} />
        <span className="hidden shrink-0 text-caption text-muted-foreground md:inline">
          {fmtTime(log.createdAt)}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border-subtle bg-surface-sunken px-4 py-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-caption sm:grid-cols-3">
            <Meta label="Request ID" value={log.requestId || "—"} mono />
            <Meta label="API key" value={log.keyPrefix || "—"} mono />
            <Meta
              label="Error code"
              value={log.errorCode ?? "—"}
              mono
              danger={!!log.errorCode}
            />
            <Meta label="Latency" value={`${log.latencyMs}ms`} />
            <Meta label="When" value={fmtTime(log.createdAt)} />
          </div>
          <CodeBlock label="Request headers" value={log.requestHeaders} />
          <CodeBlock label="Request body" value={log.requestBody} />
          <CodeBlock label="Response body" value={log.responseBody} />
        </div>
      )}
    </li>
  );
}

function Meta({
  label,
  value,
  mono,
  danger,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "truncate",
          mono && "font-mono",
          danger && "text-status-danger-fg",
        )}
      >
        {value}
      </p>
    </div>
  );
}
