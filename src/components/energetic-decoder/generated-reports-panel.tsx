"use client";

import { Calendar, FileOutput, FileText, Info, Loader2, Lock, MoreVertical, Palette, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GeneratedReport } from "@/types/generated-report";

/**
 * Reading workspace → Reports tab (2026-10-07, owner-approved mockup B).
 * Lists the generated reports for the person on screen — every reading of
 * their Profile — newest first. Not Report Builder: nothing here edits a
 * template, and there is no regenerate. One action per report: View PDF,
 * which opens the existing generated-report PDF route (rendered from the
 * report's frozen snapshot when opened). Delete stays available in the
 * row menu because the workspace already offered it.
 *
 * Access: generated reports have no client-access field today, and their
 * PDF/preview routes require a sub-account login — so every report is
 * Internal, and that is what each row says. There is deliberately no
 * grant/remove toggle until a real access record + MyMagnetix delivery
 * path exist.
 */

export function generatedReportPdfHref(subAccountId: string, reportId: string): string {
  return `/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports/${reportId}/pdf`;
}

function formatDate(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

/** The chart styles frozen into the report when it was generated — "Default" when it used the sub-account default, "—" for reports generated before styles were recorded. */
export function chartDesignLabel(report: GeneratedReport): string {
  const styles = report.snapshot?.chartStyles;
  if (!styles) return "—";
  return styles.setName || "Default";
}

export function GeneratedReportsPanel({
  subAccountId,
  reports,
  loading,
  readingDates,
  onGenerate,
  onDelete,
  deletingReportId,
}: {
  subAccountId: string;
  reports: GeneratedReport[];
  loading: boolean;
  /** readingId → that reading's createdAt, to say which snapshot a report came from. */
  readingDates: Map<string, string | null>;
  onGenerate: () => void;
  onDelete: (report: GeneratedReport) => void;
  deletingReportId: string | null;
}) {
  const sorted = [...reports].sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""));
  const multipleReadings = new Set(sorted.map((r) => r.readingId)).size > 1 || readingDates.size > 1;

  return (
    <div className="space-y-4" data-reports-panel>
      <div className="rounded-2xl border bg-background p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-primary">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">Generated Reports</h3>
              <p className="text-sm text-muted-foreground">PDFs created for this person from your report templates.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <FileOutput className="h-4 w-4" />
            Generate Report
          </button>
        </div>

        {loading && sorted.length === 0 ? (
          <div className="mt-4 flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading reports…
          </div>
        ) : sorted.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center" data-reports-empty>
            <p className="text-sm font-semibold">No reports generated yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Use Generate Report to create a PDF from one of your Report Builder templates.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5" data-reports-list>
            {sorted.map((r) => {
              const generated = formatDate(r.generatedAt);
              const readingDate = readingDates.get(r.readingId);
              return (
                <li
                  key={r.id}
                  data-report-id={r.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border px-4 py-3 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto_auto_auto] md:gap-x-4"
                >
                  <div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-primary">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" data-report-title title="Report Builder template">
                        {r.reportDesignTitleAtGeneration || "Untitled report"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {multipleReadings && readingDate
                          ? `From the ${formatDate(readingDate).date} reading`
                          : "From this reading"}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start gap-2" data-report-generated>
                    <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 text-xs">
                      <p className="font-medium tabular-nums">{generated.date}</p>
                      <p className="text-muted-foreground tabular-nums">{generated.time}</p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start gap-2" data-report-chart-design>
                    <Palette className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 text-xs">
                      <p className="text-muted-foreground">Chart design</p>
                      <p className="truncate font-medium">{chartDesignLabel(r)}</p>
                    </div>
                  </div>

                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                    data-report-access="internal"
                    title="Not shared with the client"
                  >
                    <Lock className="h-3 w-3" /> Internal
                  </span>

                  <a
                    href={generatedReportPdfHref(subAccountId, r.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5 md:ml-0"
                    data-report-view-pdf
                  >
                    <FileText className="h-3.5 w-3.5" /> View PDF
                  </a>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="More report actions"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {deletingReportId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" disabled={deletingReportId === r.id} onClick={() => onDelete(r)}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete report
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border bg-card/50 p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
          <Info className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Generating a report doesn&apos;t share it with the client.</p>
          <p className="text-muted-foreground">
            Generated reports stay internal to your team. Giving a client access to a report isn&apos;t available yet.
          </p>
        </div>
      </div>
    </div>
  );
}
