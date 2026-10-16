"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  MoreVertical,
  Trash2,
  Download,
  History,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateOnly } from "@/lib/energetic-decoder/date-only";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LinkReadingContactDialog } from "@/components/energetic-decoder/link-reading-contact-dialog";
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
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { buildDecoderReportUrl, buildDecoderReportDesignUrl } from "@/lib/domains/public-url";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { HumanDesignSummary, SphereList } from "@/components/energetic-decoder/reading-summary";
import { AstrologyReadingView } from "@/components/energetic-decoder/astrology-reading-view";
import { MandalaReadingView } from "@/components/energetic-decoder/mandala-reading-view";
import { TAB_STRIP_CLASS, useActiveTabVisible } from "@/components/energetic-decoder/tab-strip";
import { useDecoderNav } from "@/components/energetic-decoder/decoder-shell";
import { OptionSelect } from "@/components/system/option-select";
import { FREQUENCY_COMING_SOON, FREQUENCY_COMING_SOON_LABEL } from "@/lib/energetics/frequency-availability";

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
 * (and, 2026-10, Astrology its own AstrologyReadingView — the public pages keep AstrologySummary)
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

/** "Oct 5, 2026" — with the time added when two snapshots share a date, so every option is distinguishable. */
function readingHistoryLabel(r: { createdAt: string | null }, all: { createdAt: string | null }[]): string {
  const date = formatReadingDate(r.createdAt);
  if (!r.createdAt || all.filter((x) => formatReadingDate(x.createdAt) === date).length < 2) return date;
  return `${date}, ${new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
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
  showReports,
  onShowReports,
  reportsPanel,
  readingHistory = [],
  onSelectReading,
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
  /** Reports tab (2026-10-07) — when true the Reports panel replaces the chart content. */
  showReports: boolean;
  onShowReports: () => void;
  reportsPanel: ReactNode;
  /**
   * Every reading snapshot of this person, newest first (2026-10-07). The
   * "Reading from" selector only appears when there are two or more — a
   * practitioner convenience, never shown to the client.
   */
  readingHistory?: { id: string; createdAt: string | null }[];
  onSelectReading?: (readingId: string) => void;
  deletingReadingId: string | null;
  onDeleteReading: (r: EnergeticDecoderReading) => void;
}) {
  const profile = reading.humanDesign;
  const hasMandala = !!profile && !!mandalaDesign;

  // Nav shown as 4 peer-looking items (matches the approved mockup), but
  // Mandala stays functionally nested under Human Design (Decision 5,
  // preserved) — clicking it sets currentSystem="hd" AND hdStyleView=
  // "mandala" in one action, not a real 4th ReadingSystem.
  //
  // Reports (2026-10-07) is the last peer tab: the person's generated
  // reports. While it's showing, no system tab is active.
  const onSystem = !showReports;
  // Frequency is Coming soon (frequency-availability.ts): a reading without
  // Frequency shows a greyed tab in its usual place; a reading that already
  // has Frequency keeps its real, read-only tab.
  const frequencyComingSoon = FREQUENCY_COMING_SOON && !availableSystems.some((s) => s.key === "frequency");
  const navItems: { key: string; label: string; onClick: () => void; active: boolean; comingSoon?: boolean }[] = [
    ...(profile ? [{ key: "hd", label: "Human Design", onClick: () => { onSetSystem("hd"); onSetHdStyleView("traditional"); }, active: onSystem && currentSystem === "hd" && hdStyleView === "traditional" }] : []),
    ...(hasMandala ? [{ key: "mandala", label: "Mandala", onClick: () => { onSetSystem("hd"); onSetHdStyleView("mandala"); }, active: onSystem && currentSystem === "hd" && hdStyleView === "mandala" }] : []),
    ...(frequencyComingSoon ? [{ key: "frequency", label: "Frequency", onClick: () => undefined, active: false, comingSoon: true }] : []),
    ...availableSystems
      .filter((s) => s.key !== "hd")
      .map((s) => ({ key: s.key, label: s.label, onClick: () => onSetSystem(s.key), active: onSystem && currentSystem === s.key })),
    { key: "reports", label: "Reports", onClick: onShowReports, active: showReports },
  ];

  // Legacy reading → contact repair: ask the server whether this reading's
  // contact still resolves (a missing doc can't be read client-side).
  // Optional so the workspace also renders outside the provider (static UI checks); inside the app it's always set.
  const isAdmin = useOptionalSubAccount()?.isAdmin ?? false;
  const [contactBroken, setContactBroken] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setContactBroken(false);
    setLinkedContactId(null);
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings/${reading.id}/contact`)
      .then((r) => r.json())
      .then((d: { broken?: boolean }) => {
        if (!cancelled) setContactBroken(d.broken === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [subAccountId, reading.id]);
  const contactHref = `/sa/${subAccountId}/contacts/${linkedContactId ?? reading.contactId}`;

  const tabStripRef = useRef<HTMLDivElement>(null);
  useActiveTabVisible(tabStripRef, navItems.find((n) => n.active)?.key);
  const decoderNav = useDecoderNav();

  const reportDesignLinkFor = (reportId: string) => {
    const url = buildDecoderReportDesignUrl({ subAccount, subAccountId, readingId: reading.id, reportId });
    navigator.clipboard.writeText(url);
    toast.success("Report design link copied.");
  };

  return (
    <div className="min-w-0 space-y-4" data-reading-workspace>
      {/* Legacy repair (Wave 2 follow-up): only when this reading's contact no
          longer exists. Never shown for a healthy link. */}
      {contactBroken && (
        <Alert tone="warning" title="This reading's contact no longer exists">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>It was created before its contact was removed, so &ldquo;View contact&rdquo; can&apos;t open it. Link their current contact — the reading itself won&apos;t change.</span>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                <Link2 className="size-4" />
                Link contact
              </Button>
            )}
          </div>
        </Alert>
      )}
      <LinkReadingContactDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        readingId={reading.id}
        readingName={reading.name}
        onLinked={(id) => {
          setLinkedContactId(id);
          setContactBroken(false);
        }}
      />
      {/* Record breadcrumb (v2): Energetic Decoder › Readings › person. */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
        {decoderNav ? (
          <button type="button" onClick={() => decoderNav.selectTab("home")} className="hover:text-foreground hover:underline">
            Energetic Decoder
          </button>
        ) : (
          <span>Energetic Decoder</span>
        )}
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <button type="button" onClick={onBack} aria-label="Back to Readings" className="hover:text-foreground hover:underline">
          Readings
        </button>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span aria-current="page" className="min-w-0 truncate font-medium text-foreground">
          {reading.name}
        </span>
      </nav>

      {/* Person header — the record header: a white card, the name as the
          page's one serif moment. Phones: identity on top, the controls
          stack underneath at full width; sm+: they sit beside the identity
          when they fit and wrap inside the card when they don't. */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-card p-4 shadow-card sm:p-5" data-reading-header>
        <div className="flex min-w-0 flex-[1_1_26rem] items-center gap-3 sm:gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground sm:size-14">
            {reading.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-display-md leading-tight font-normal tracking-tight text-foreground">{reading.name}</h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {formatDateOnly(reading.birthDate)}
              {reading.birthTime && <> · {formatBirthTime(reading.birthTime)}</>}
              {reading.birthPlace && <> · {reading.birthPlace}</>}
            </p>
            {profile && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-tag-violet-bg px-2 py-0.5 text-caption font-medium text-tag-violet-fg">{profile.type}</span>
                {profile.profile && <span className="rounded-md bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground tabular-nums">{profile.profile}</span>}
                {profile.incarnationCross && <span className="rounded-md bg-tag-gold-bg px-2 py-0.5 text-caption font-medium text-tag-gold-fg">{profile.incarnationCross}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:max-w-full sm:justify-end">
          {readingHistory.length > 1 && onSelectReading && (
            <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto" data-reading-history>
              <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="shrink-0 whitespace-nowrap text-caption text-muted-foreground">Reading from</span>
              <OptionSelect
                value={reading.id}
                onChange={(v) => v && onSelectReading(v)}
                options={readingHistory.map((r, i) => ({ value: r.id, label: `${readingHistoryLabel(r, readingHistory)}${i === 0 ? " (latest)" : ""}` }))}
                aria-label="Reading from"
                size="sm"
                className="min-w-0 flex-1 sm:w-52 sm:flex-none"
              />
            </div>
          )}
          {selectedProfile && (
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none" data-chart-design-control>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: (hdStyleView === "mandala" ? mandalaDesign : hdDesign)?.chartDefinedColor || "#a1a1aa" }}
              />
              <span className="shrink-0 whitespace-nowrap text-caption text-muted-foreground">Chart design</span>
              <OptionSelect
                value={(hdStyleView === "mandala" ? selectedProfile.mandalaChartDesignId : selectedProfile.hdChartDesignId) ?? null}
                onChange={(v) => onSaveDesignOverride(selectedProfile, hdStyleView === "mandala" ? "mandala" : "humanDesign", v)}
                options={chartDesigns
                  .filter((d) => d.system === (hdStyleView === "mandala" ? "mandala" : "humanDesign"))
                  .map((d) => ({ value: d.id, label: d.name }))}
                noneLabel="Default"
                aria-label="Chart design"
                disabled={savingDesignFor === (hdStyleView === "mandala" ? "mandala" : "humanDesign")}
                size="sm"
                className="min-w-0 flex-1 sm:w-40 sm:flex-none"
              />
              {savingDesignFor === (hdStyleView === "mandala" ? "mandala" : "humanDesign") && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
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
              {contactBroken ? (
                <DropdownMenuItem disabled={!isAdmin} onClick={() => setLinkOpen(true)}>
                  <Link2 className="mr-2 h-3.5 w-3.5" />
                  Link contact
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem render={<Link href={contactHref} />}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  View contact
                </DropdownMenuItem>
              )}
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
          {/* No Generate Report here (owner decision, 2026-10-07): reports are generated from the Reports tab. */}
        </div>
      </div>

      {/* System navigation */}
      {navItems.length > 1 && (
        <div ref={tabStripRef} className={cn(TAB_STRIP_CLASS, "gap-1 shadow-[inset_0_-1px_0_var(--border)]")} role="tablist" data-workspace-tabs>
          {navItems.map((n) =>
            n.comingSoon ? (
              <button
                key={n.key}
                type="button"
                role="tab"
                aria-selected={false}
                aria-disabled="true"
                disabled
                title="Frequency is coming soon"
                data-frequency-coming-soon
                className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-muted-foreground/70"
              >
                {n.label}
                <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {FREQUENCY_COMING_SOON_LABEL}
                </span>
              </button>
            ) : (
              <button
                key={n.key}
                type="button"
                role="tab"
                aria-selected={n.active}
                onClick={n.onClick}
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold",
                  n.active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </button>
            ),
          )}
        </div>
      )}

      {showReports && reportsPanel}

      {/* Content */}
      {onSystem && currentSystem === "hd" && hdStyleView === "traditional" && profile && (
        <>
          <HumanDesignFullChart profile={profile} design={hdDesign} />
          <ChartInformation profile={profile} />
          {/* Gates activated / Variables / Skills — real content the compact ChartInformation strip above doesn't cover, kept via the same existing component, chart+basics suppressed to avoid duplicating what's already shown above. */}
          <HumanDesignSummary profile={profile} hdDesign={hdDesign} chartStyle="traditional" hideChartAndBasics />
        </>
      )}

      {onSystem && currentSystem === "hd" && hdStyleView === "mandala" && profile && mandalaDesign && (
        <MandalaReadingView profile={profile} mandalaDesign={mandalaDesign} hdDesign={hdDesign} />
      )}

      {onSystem && currentSystem === "frequency" && (
        <>
          {FREQUENCY_COMING_SOON && (
            <p className="rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground" data-frequency-saved-note>
              Saved Frequency result, shown read-only. Frequency is coming soon, so new readings don’t include it yet.
            </p>
          )}
          <SphereList spheres={reading.spheres} />
        </>
      )}

      {onSystem && currentSystem === "astro" && reading.astrology && <AstrologyReadingView chart={reading.astrology} astroDesign={astroDesign} />}
    </div>
  );
}
