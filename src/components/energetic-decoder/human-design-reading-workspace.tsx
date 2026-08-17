"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  FileOutput,
  Loader2,
  MoreVertical,
  Trash2,
  Download,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { EnergeticProfile } from "@/types/energetic-profile";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { ReportDesign } from "@/types/report-blocks";
import type { GeneratedReport } from "@/types/generated-report";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { buildDecoderReportUrl, buildDecoderReportDesignUrl } from "@/lib/domains/public-url";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { HumanDesignSummary, SphereList, AstrologySummary } from "@/components/energetic-decoder/reading-summary";

/**
 * The full-width Traditional Human Design reading workspace — approved
 * mockup (2026-08-17): the old "narrow persistent detail pane" (readings-
 * tab.tsx's `lg:grid-cols-[minmax(280px,340px)_1fr]` split) never gave the
 * BodyGraph real room; every chart lived in a ~700-900px column squeezed
 * next to the reading list. This component IS the detail experience once
 * a reading is selected — readings-tab.tsx hides the list pane entirely
 * and renders this full-width instead (see its own comment at the call
 * site), with a single "Readings" breadcrumb/back control to return.
 *
 * Scope, deliberately narrow: only the Traditional Human Design system
 * view gets the new 3-column (Design | BodyGraph | Personality) treatment
 * and the new compact Chart Information strip below it — both built new
 * for this mockup. Mandala/Frequency/Astrology render through this same
 * header/nav chrome (so switching systems doesn't feel like leaving the
 * page) but their own content is the EXACT existing HumanDesignSummary
 * (chartStyle="mandala")/SphereList/AstrologySummary components,
 * unmodified — already self-constrained to a sane max-width
 * (mx-auto w-full max-w-[...]), so giving them more surrounding room is
 * safe, not a redesign.
 *
 * The BodyGraph/Mandala/Astrology-wheel renderers themselves, their
 * gate/channel/center geometry, and every calculation are untouched —
 * this file is presentation/layout only, wiring the exact same real data
 * and Chart Design colors the old detail pane already used.
 */

function formatBirthTime(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function formatReadingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value || "—"}</p>
    </div>
  );
}

/** Chart Information — the approved mockup's compact horizontal treatment, NOT the deeper descriptive "Human Design" card HumanDesignSummary already has elsewhere (that stays, unrelated, see reading-summary.tsx's hideChartAndBasics comment). */
function ChartInformation({ profile }: { profile: HumanDesignProfile }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chart Information</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-8">
        <InfoField label="Type" value={profile.type} />
        <InfoField label="Strategy" value={profile.strategy} />
        <InfoField label="Authority" value={profile.authority} />
        <InfoField label="Profile" value={profile.profile} />
        <InfoField label="Definition" value={profile.definitionLabel} />
        <InfoField label="Incarnation Cross" value={profile.incarnationCross} />
        <InfoField label="Not-Self Theme" value={profile.notSelfTheme} />
        <InfoField label="Signature" value={profile.signature} />
      </div>
    </div>
  );
}

type ReadingSystem = "frequency" | "hd" | "astro";

export function HumanDesignReadingWorkspace({
  reading,
  selectedProfile,
  subAccountId,
  subAccount,
  chartDesigns,
  reportDesigns,
  hdDesign,
  mandalaDesign,
  astroDesign,
  savingDesignFor,
  onSaveDesignOverride,
  availableSystems,
  currentSystem,
  onSetSystem,
  hdStyleView,
  onSetHdStyleView,
  onBack,
  generatedReports,
  deletingReportId,
  onPreviewGeneratedReport,
  onDeleteGeneratedReport,
  onOpenGenerateDialog,
  deletingReadingId,
  onDeleteReading,
}: {
  reading: EnergeticDecoderReading;
  selectedProfile: EnergeticProfile | null;
  subAccountId: string;
  subAccount: Parameters<typeof buildDecoderReportUrl>[0]["subAccount"];
  chartDesigns: ChartDesign[];
  reportDesigns: ReportDesign[];
  hdDesign: ChartDesign | null;
  mandalaDesign: ChartDesign | null;
  astroDesign: ChartDesign | null;
  savingDesignFor: ChartDesignSystem | null;
  onSaveDesignOverride: (profile: EnergeticProfile, system: ChartDesignSystem, designId: string | null) => void;
  availableSystems: { key: ReadingSystem; label: string }[];
  currentSystem: ReadingSystem | null;
  onSetSystem: (key: ReadingSystem) => void;
  hdStyleView: "traditional" | "mandala";
  onSetHdStyleView: (v: "traditional" | "mandala") => void;
  onBack: () => void;
  generatedReports: GeneratedReport[];
  deletingReportId: string | null;
  onPreviewGeneratedReport: (r: GeneratedReport) => void;
  onDeleteGeneratedReport: (r: GeneratedReport) => void;
  onOpenGenerateDialog: () => void;
  deletingReadingId: string | null;
  onDeleteReading: (r: EnergeticDecoderReading) => void;
}) {
  const profile = reading.humanDesign;
  const hasMandala = !!profile && !!mandalaDesign;

  // Nav shown as 4 peer-looking items (matches the approved mockup), but
  // Mandala stays functionally nested under Human Design (Decision 5,
  // preserved) — clicking it sets currentSystem="hd" AND hdStyleView=
  // "mandala" in one action, not a real 4th ReadingSystem.
  const navItems: { key: string; label: string; onClick: () => void; active: boolean }[] = [
    ...(profile ? [{ key: "hd", label: "Human Design", onClick: () => { onSetSystem("hd"); onSetHdStyleView("traditional"); }, active: currentSystem === "hd" && hdStyleView === "traditional" }] : []),
    ...(hasMandala ? [{ key: "mandala", label: "Mandala", onClick: () => { onSetSystem("hd"); onSetHdStyleView("mandala"); }, active: currentSystem === "hd" && hdStyleView === "mandala" }] : []),
    ...availableSystems
      .filter((s) => s.key !== "hd")
      .map((s) => ({ key: s.key, label: s.label, onClick: () => onSetSystem(s.key), active: currentSystem === s.key })),
  ];

  const reportDesignLinkFor = (reportId: string) => {
    const url = buildDecoderReportDesignUrl({ subAccount, subAccountId, readingId: reading.id, reportId });
    navigator.clipboard.writeText(url);
    toast.success("Report design link copied.");
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Readings"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm text-muted-foreground">
          <button type="button" onClick={onBack} className="hover:text-foreground hover:underline">
            Readings
          </button>
          <span className="mx-1.5">/</span>
          <span className="font-medium text-foreground">
            {currentSystem === "hd" && hdStyleView === "mandala" ? "Mandala" : navItems.find((n) => n.active)?.label ?? "Reading"}
          </span>
        </p>
      </div>

      {/* Person header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
            {reading.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{reading.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatReadingDate(reading.birthDate)}
              {reading.birthTime && <> · {formatBirthTime(reading.birthTime)}</>}
              {reading.birthPlace && <> · {reading.birthPlace}</>}
            </p>
            {profile && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{profile.type}</span>
                {profile.profile && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{profile.profile}</span>
                )}
                {profile.incarnationCross && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{profile.incarnationCross}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {selectedProfile && (
            <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: (hdStyleView === "mandala" ? mandalaDesign : hdDesign)?.chartDefinedColor || "#a1a1aa" }}
              />
              <span className="text-xs text-muted-foreground">Chart Design:</span>
              <select
                value={(hdStyleView === "mandala" ? selectedProfile.mandalaChartDesignId : selectedProfile.hdChartDesignId) ?? ""}
                onChange={(e) =>
                  onSaveDesignOverride(selectedProfile, hdStyleView === "mandala" ? "mandala" : "humanDesign", e.target.value || null)
                }
                disabled={savingDesignFor === (hdStyleView === "mandala" ? "mandala" : "humanDesign")}
                className="bg-transparent text-xs font-medium disabled:opacity-50"
              >
                <option value="">Default</option>
                {chartDesigns
                  .filter((d) => d.system === (hdStyleView === "mandala" ? "mandala" : "humanDesign"))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
              {savingDesignFor === (hdStyleView === "mandala" ? "mandala" : "humanDesign") && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More Actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  const url = buildDecoderReportUrl({ subAccount, subAccountId, readingId: reading.id });
                  navigator.clipboard.writeText(url);
                  toast.success("Report link copied — this is the actual deliverable, safe to send to the client.");
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Share report
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href={`/api/sub-accounts/${subAccountId}/energetic-decoder/readings/${reading.id}/pdf`} download />}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Download PDF
              </DropdownMenuItem>
              {reportDesigns.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {reportDesigns.map((d) => (
                    <DropdownMenuItem key={d.id} onClick={() => reportDesignLinkFor(d.id)}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy link · {d.title}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href={`/sa/${subAccountId}/contacts/${reading.contactId}`} />}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                View contact
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={deletingReadingId === reading.id}
                onClick={() => onDeleteReading(reading)}
              >
                {deletingReadingId === reading.id ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                )}
                Delete reading
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={onOpenGenerateDialog}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <FileOutput className="h-4 w-4" />
            Generate Report
          </button>
        </div>
      </div>

      {generatedReports.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generated Reports</p>
          <div className="space-y-1.5">
            {generatedReports.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.reportDesignTitleAtGeneration}</p>
                  <p className="text-muted-foreground">{r.generatedAt ? new Date(r.generatedAt).toLocaleString() : "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button type="button" title="Preview" onClick={() => onPreviewGeneratedReport(r)} className="text-muted-foreground hover:text-primary">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports/${r.id}/pdf`}
                    download
                    title="Download PDF"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    title="Delete"
                    disabled={deletingReportId === r.id}
                    onClick={() => onDeleteGeneratedReport(r)}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {deletingReportId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System navigation */}
      {navItems.length > 1 && (
        <div className="flex items-center gap-1 border-b">
          {navItems.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={n.onClick}
              className={cn(
                "border-b-2 px-3 py-2.5 text-sm font-semibold",
                n.active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {currentSystem === "hd" && hdStyleView === "traditional" && profile && (
        <>
          <HumanDesignFullChart profile={profile} design={hdDesign} />
          <ChartInformation profile={profile} />
          {/* Gates activated / Variables / Skills — real content the compact ChartInformation strip above doesn't cover, kept via the same existing component, chart+basics suppressed to avoid duplicating what's already shown above. */}
          <HumanDesignSummary profile={profile} hdDesign={hdDesign} chartStyle="traditional" hideChartAndBasics />
        </>
      )}

      {currentSystem === "hd" && hdStyleView === "mandala" && profile && mandalaDesign && (
        <HumanDesignSummary profile={profile} hdDesign={hdDesign} mandalaDesign={mandalaDesign} chartStyle="mandala" />
      )}

      {currentSystem === "frequency" && <SphereList spheres={reading.spheres} />}

      {currentSystem === "astro" && reading.astrology && <AstrologySummary chart={reading.astrology} astroDesign={astroDesign} />}
    </div>
  );
}
