"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, FileOutput, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getContact } from "@/lib/firestore/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { EnergeticProfile } from "@/types/energetic-profile";
import type { ReportDesign } from "@/types/report-blocks";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { GeneratedReport } from "@/types/generated-report";
import { HumanDesignReadingWorkspace } from "@/components/energetic-decoder/human-design-reading-workspace";
import { EnergeticDecoderReadingConfiguration } from "@/components/energetic-decoder/reading-configuration";
import { NewReadingDialog, type NewReadingDialogOpenRequest } from "@/components/energetic-decoder/new-reading-dialog";
import { ReadingsLibraryTable } from "@/components/energetic-decoder/readings-library-table";
import { GeneratedReportsPanel } from "@/components/energetic-decoder/generated-reports-panel";
import {
  normalizeLibraryPage,
  normalizeLibrarySort,
  type ReadingsLibraryPage,
  type ReadingsLibraryRow,
  type ReadingsLibrarySort,
} from "@/lib/energetic-decoder/readings-library";

/**
 * Energetic Decoder → Readings (rebuilt 2026-10-07, owner-approved mockups
 * A + B). Two views, both driven by the URL so refresh and Back/Forward
 * work:
 *
 *   Library    ?tab=readings[&q=][&sort=][&page=]
 *              One row per person (Energetic Profile), paged on the server
 *              (readings-library-service.ts). No birth data in the list.
 *   Workspace  ?tab=readings&profileId=…[&readingId=…][&view=…]
 *              The person's latest reading in HumanDesignReadingWorkspace
 *              (unchanged), plus the new Reports tab. `readingId` pins an
 *              older snapshot — chosen in the header's "Reading from"
 *              selector, which only appears when the person has 2+
 *              readings — or opens a legacy reading that has no Profile
 *              (`readingId` alone). `view` is the workspace tab:
 *              hd | mandala | frequency | astro | reports.
 *
 * This whole workspace is the PRACTITIONER's backend view. The person a
 * chart belongs to never sees it; what a client can see is decided
 * separately (MyMagnetix / explicit report delivery).
 *
 * The Contact page's "View Chart" links (`?tab=readings&profileId=`) land
 * straight in the workspace.
 */

type ReadingSystem = "frequency" | "hd" | "astro";
type WorkspaceView = "hd" | "mandala" | "frequency" | "astro" | "reports";
const WORKSPACE_VIEWS: WorkspaceView[] = ["hd", "mandala", "frequency", "astro", "reports"];
const parseView = (v: string | null): WorkspaceView | null => (WORKSPACE_VIEWS.includes(v as WorkspaceView) ? (v as WorkspaceView) : null);

/** The library query string the user last had, so the workspace's back control returns to the same page/search. */
let lastLibraryQuery = "tab=readings";

export function EnergeticDecoderReadingsTab() {
  const searchParams = useSearchParams();
  const profileId = searchParams.get("profileId");
  const readingId = searchParams.get("readingId");

  if (profileId || readingId) {
    // Keyed by the person (or, for a legacy reading with no Profile, that
    // reading) — switching between one person's snapshots via `readingId`
    // keeps the workspace mounted; opening a different person resets it.
    return <ReadingWorkspaceView key={profileId ? `p:${profileId}` : `r:${readingId}`} profileId={profileId} readingId={readingId} />;
  }
  return <ReadingsLibraryView />;
}

function useReadingsUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const build = useCallback(
    (params: Record<string, string | null | undefined>) => {
      const sp = new URLSearchParams();
      sp.set("tab", "readings");
      for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
      return `${pathname}?${sp.toString()}`;
    },
    [pathname],
  );
  return { router, pathname, searchParams, build };
}

function rowHref(build: (p: Record<string, string | null>) => string, row: ReadingsLibraryRow): string {
  return row.kind === "profile" ? build({ profileId: row.id }) : build({ readingId: row.id });
}

// ─────────────────────────────────────────────────────────────── Library

function ReadingsLibraryView() {
  const { subAccountId } = useSubAccount();
  const { router, searchParams, build } = useReadingsUrl();

  const q = searchParams.get("q") ?? "";
  const sort = normalizeLibrarySort(searchParams.get("sort"));
  const page = normalizeLibraryPage(searchParams.get("page"));

  const [data, setData] = useState<ReadingsLibraryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);
  const [configOpen, setConfigOpen] = useState(false);
  const [openRequest, setOpenRequest] = useState<NewReadingDialogOpenRequest | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const libraryParams = useCallback(
    (next: { q?: string; sort?: ReadingsLibrarySort; page?: number }) => {
      const nq = next.q ?? q;
      const ns = next.sort ?? sort;
      const np = next.page ?? page;
      return { q: nq || null, sort: ns === "recent" ? null : ns, page: np > 1 ? String(np) : null };
    },
    [q, sort, page],
  );

  useEffect(() => {
    lastLibraryQuery = new URL(build(libraryParams({})), "http://x").search.slice(1);
  }, [build, libraryParams]);

  // Keep the box in sync when Back/Forward changes `q`.
  useEffect(() => setSearchInput(q), [q]);

  // Debounced, server-side search.
  useEffect(() => {
    if (searchInput.trim() === q) return;
    const t = setTimeout(() => router.replace(build(libraryParams({ q: searchInput.trim(), page: 1 })), { scroll: false }), 300);
    return () => clearTimeout(t);
  }, [searchInput, q, router, build, libraryParams]);

  useEffect(() => {
    if (!subAccountId) return;
    const ctrl = new AbortController();
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), sort });
    if (q) sp.set("q", q);
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/library?${sp}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: ReadingsLibraryPage & { ok?: boolean; error?: string }) => {
        if (!d.ok) throw new Error(d.error ?? "Couldn't load readings.");
        setData(d);
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") toast.error("Couldn't load readings.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [subAccountId, q, sort, page, reloadKey]);

  function openRow(row: ReadingsLibraryRow) {
    router.push(rowHref(build, row));
  }

  async function loadProfileAndContact(profileId: string): Promise<{ profile: EnergeticProfile; contact: NonNullable<Awaited<ReturnType<typeof getContact>>> } | null> {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/profiles/${profileId}`);
    const d = (await res.json().catch(() => ({}))) as { profile?: EnergeticProfile };
    if (!d.profile) return null;
    const contact = await getContact(d.profile.contactId).catch(() => null);
    if (!contact) return null;
    return { profile: d.profile, contact };
  }

  async function editRow(row: ReadingsLibraryRow) {
    setBusyRowId(row.id);
    try {
      const loaded = await loadProfileAndContact(row.id);
      if (!loaded) throw new Error("This person's contact couldn't be found.");
      setOpenRequest({ ...loaded, step: "edit-profile" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open this person.");
    } finally {
      setBusyRowId(null);
    }
  }

  async function deleteRow(row: ReadingsLibraryRow) {
    if (!window.confirm(`Delete the profile "${row.name}"? This can't be undone.`)) return;
    setBusyRowId(row.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/profiles/${row.id}`, { method: "DELETE" });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Couldn't delete this profile.");
      toast.success("Profile deleted.");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete this profile.");
    } finally {
      setBusyRowId(null);
    }
  }

  function handleReadingCreated(reading: EnergeticDecoderReading) {
    router.push(reading.profileId ? build({ profileId: reading.profileId }) : build({ readingId: reading.id }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Readings</h2>
          <p className="text-sm text-muted-foreground">Your saved client charts.</p>
        </div>
        {/* Phones: search on its own full-width line, then configuration + New reading. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <div className="relative w-full min-w-0 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or contact…"
              aria-label="Search readings by name or contact"
              className="h-9 pl-8"
            />
          </div>
          <Dialog open={configOpen} onOpenChange={setConfigOpen}>
            <DialogTrigger
              title="Reading configuration — what new readings include"
              aria-label="Reading configuration"
              data-reading-configuration
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Reading configuration</span>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Reading configuration</DialogTitle>
              </DialogHeader>
              <EnergeticDecoderReadingConfiguration />
            </DialogContent>
          </Dialog>
          <NewReadingDialog
            onCreated={handleReadingCreated}
            openRequest={openRequest}
            onOpenRequestHandled={() => setOpenRequest(null)}
            onProfileUpdated={() => setReloadKey((k) => k + 1)}
            onProfileDeleted={() => setReloadKey((k) => k + 1)}
          />
        </div>
      </div>

      <ReadingsLibraryTable
        data={data}
        loading={loading}
        searching={!!q}
        sort={sort}
        hrefFor={(row) => rowHref(build, row)}
        onOpen={openRow}
        onEdit={(row) => void editRow(row)}
        onDelete={(row) => void deleteRow(row)}
        onSortByName={() =>
          router.replace(build(libraryParams({ sort: sort === "name_asc" ? "name_desc" : sort === "name_desc" ? "recent" : "name_asc", page: 1 })), { scroll: false })
        }
        onPage={(n) => router.push(build(libraryParams({ page: n })), { scroll: false })}
        busyRowId={busyRowId}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Workspace

function ReadingWorkspaceView({ profileId, readingId }: { profileId: string | null; readingId: string | null }) {
  const { subAccountId, subAccount } = useSubAccount();
  const { router, pathname, searchParams, build } = useReadingsUrl();

  const [profile, setProfile] = useState<EnergeticProfile | null>(null);
  /** Every reading of this person, newest first (just the one reading for a legacy profile-less reading). */
  const [readings, setReadings] = useState<EnergeticDecoderReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [reportDesigns, setReportDesigns] = useState<ReportDesign[]>([]);
  const [chartDesigns, setChartDesigns] = useState<ChartDesign[]>([]);
  const [savingDesignFor, setSavingDesignFor] = useState<ChartDesignSystem | null>(null);

  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [deletingReadingId, setDeletingReadingId] = useState<string | null>(null);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateDesignId, setGenerateDesignId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<GeneratedReport | null>(null);

  const [openRequest, setOpenRequest] = useState<NewReadingDialogOpenRequest | null>(null);
  const [preparingGenerate, setPreparingGenerate] = useState(false);

  // ── Load the person + their readings. For a Profile the whole snapshot
  // list loads once; `readingId` then only picks among it (no refetch).
  const loadKey = profileId ? `p:${profileId}` : `r:${readingId}`;
  useEffect(() => {
    if (!subAccountId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const base = `/api/sub-accounts/${subAccountId}/energetic-decoder`;
      let nextProfile: EnergeticProfile | null = null;
      let nextReadings: EnergeticDecoderReading[] = [];
      if (profileId) {
        const [p, r] = await Promise.all([
          fetch(`${base}/profiles/${profileId}`).then((res) => res.json()).catch(() => ({})),
          fetch(`${base}/readings?profileId=${encodeURIComponent(profileId)}`).then((res) => res.json()).catch(() => ({})),
        ]);
        nextProfile = (p as { profile?: EnergeticProfile }).profile ?? null;
        nextReadings = (r as { readings?: EnergeticDecoderReading[] }).readings ?? [];
      } else if (readingId) {
        const r = (await fetch(`${base}/readings/${readingId}`).then((res) => res.json()).catch(() => ({}))) as { reading?: EnergeticDecoderReading };
        if (r.reading) {
          nextReadings = [r.reading];
          if (r.reading.profileId) {
            const p = (await fetch(`${base}/profiles/${r.reading.profileId}`).then((res) => res.json()).catch(() => ({}))) as { profile?: EnergeticProfile };
            nextProfile = p.profile ?? null;
          }
        }
      }
      if (cancelled) return;
      setProfile(nextProfile);
      setReadings(nextReadings);
      setNotFound(profileId ? !nextProfile : nextReadings.length === 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // loadKey already encodes profileId/readingId the way this load uses them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId, loadKey, reloadKey]);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`)
      .then((r) => r.json())
      .then((d) => setReportDesigns(d.designs ?? []))
      .catch(() => setReportDesigns([]));
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs`)
      .then((r) => r.json())
      .then((d) => setChartDesigns(d.designs ?? []))
      .catch(() => setChartDesigns([]));
  }, [subAccountId]);

  /** The snapshot on screen: the pinned `readingId` when it belongs to this person, else the latest. */
  const selected = useMemo(
    () => (readingId ? readings.find((r) => r.id === readingId) : undefined) ?? readings[0] ?? null,
    [readings, readingId],
  );

  // ── Reports for this person (every reading of the Profile; just this reading for a legacy one).
  const loadReports = useCallback(async () => {
    if (!subAccountId) return;
    const scope = profile ? `profileId=${encodeURIComponent(profile.id)}` : selected ? `readingId=${encodeURIComponent(selected.id)}` : null;
    if (!scope) {
      setGeneratedReports([]);
      setReportsLoading(false);
      return;
    }
    setReportsLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports?${scope}`);
      const d = (await res.json().catch(() => ({}))) as { reports?: GeneratedReport[] };
      setGeneratedReports(d.reports ?? []);
    } catch {
      setGeneratedReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [subAccountId, profile, selected]);

  useEffect(() => {
    if (!loading) void loadReports();
  }, [loading, loadReports]);

  // ── Workspace tab, mirrored to `?view=` (replace, so tab clicks don't pile up history).
  // Written straight from the click handler with the native History API
  // (Next 15 keeps useSearchParams in sync with it). Synchronous, so it
  // can't be dropped while a router transition is in flight — a router.replace
  // here was occasionally lost right after a reload. Reads the live location,
  // so the HD→Mandala pair of calls the workspace makes resolves to the last.
  const viewParam = searchParams.get("view");
  const [view, setViewState] = useState<WorkspaceView | null>(parseView(viewParam));
  useEffect(() => {
    setViewState(parseView(viewParam));
  }, [viewParam]);
  const setView = useCallback(
    (next: WorkspaceView) => {
      setViewState(next);
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("view") === next) return;
      sp.set("view", next);
      window.history.replaceState(window.history.state, "", `${pathname}?${sp.toString()}`);
    },
    [pathname],
  );

  const availableSystems = useMemo(() => {
    if (!selected) return [] as { key: ReadingSystem; label: string }[];
    const list: { key: ReadingSystem; label: string }[] = [];
    if (selected.humanDesign) list.push({ key: "hd", label: "Human Design" });
    if (selected.spheres.length > 0) list.push({ key: "frequency", label: "Frequency" });
    if (selected.astrology) list.push({ key: "astro", label: "Astrology" });
    return list;
  }, [selected]);

  const showReports = view === "reports";
  const requestedSystem: ReadingSystem | null = view === "mandala" || view === "hd" ? "hd" : view === "frequency" || view === "astro" ? view : null;
  const currentSystem = availableSystems.some((s) => s.key === requestedSystem) ? requestedSystem : (availableSystems[0]?.key ?? null);
  const hdStyleView: "traditional" | "mandala" = view === "mandala" && currentSystem === "hd" ? "mandala" : "traditional";

  // ── Chart design override (unchanged behavior: legacy per-system fields on the Profile).
  const defaultHdDesign = chartDesigns.find((d) => d.system === "humanDesign" && d.isDefault) ?? null;
  const defaultMandalaDesign = chartDesigns.find((d) => d.system === "mandala" && d.isDefault) ?? null;
  const defaultAstroDesign = chartDesigns.find((d) => d.system === "astrology" && d.isDefault) ?? null;
  function resolveDesign(system: ChartDesignSystem, overrideId: string | null | undefined, fallback: ChartDesign | null) {
    if (!overrideId) return fallback;
    return chartDesigns.find((d) => d.id === overrideId && d.system === system) ?? fallback;
  }

  async function saveDesignOverride(p: EnergeticProfile, system: ChartDesignSystem, designId: string | null) {
    const field = system === "humanDesign" ? "hdChartDesignId" : system === "mandala" ? "mandalaChartDesignId" : "astrologyChartDesignId";
    setSavingDesignFor(system);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/profiles/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: designId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; profile?: EnergeticProfile; error?: string };
      if (!res.ok || !data.ok || !data.profile) throw new Error(data.error ?? "Couldn't save that design.");
      setProfile(data.profile);
      toast.success(designId ? "Design applied to this profile." : "Reverted to the default design.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that design.");
    } finally {
      setSavingDesignFor(null);
    }
  }

  function backToLibrary() {
    router.push(`${pathname}?${lastLibraryQuery}`);
  }

  async function deleteReading(reading: EnergeticDecoderReading) {
    if (!window.confirm(`Delete ${reading.name}'s reading? This can't be undone.`)) return;
    setDeletingReadingId(reading.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings/${reading.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't delete this reading.");
      toast.success("Reading deleted.");
      if (profileId) {
        // Back to this person's latest remaining reading (or the no-reading state).
        if (readingId) router.replace(build({ profileId }));
        else setReloadKey((k) => k + 1);
      } else {
        backToLibrary();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete this reading.");
    } finally {
      setDeletingReadingId(null);
    }
  }

  async function deleteGeneratedReport(report: GeneratedReport) {
    if (
      !window.confirm(
        `Delete this generated "${report.reportDesignTitleAtGeneration}" report? This only removes the generated document — the reading, contact, and Report Design are unaffected.`,
      )
    ) {
      return;
    }
    setDeletingReportId(report.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports/${report.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setGeneratedReports((prev) => prev.filter((r) => r.id !== report.id));
      toast.success("Generated report deleted.");
    } catch {
      toast.error("Couldn't delete that generated report.");
    } finally {
      setDeletingReportId(null);
    }
  }

  function openGenerateDialog() {
    setGenerateDesignId("");
    setGeneratedResult(null);
    setGenerateOpen(true);
  }

  /** Same POST the workspace has always used — one generation path. */
  async function generateReport() {
    if (!selected || !generateDesignId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDesignId: generateDesignId, readingId: selected.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; generatedReport?: GeneratedReport; error?: string };
      if (!res.ok || !data.ok || !data.generatedReport) throw new Error(data.error ?? "Couldn't generate that report.");
      setGeneratedResult(data.generatedReport);
      toast.success("Report generated.");
      void loadReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate that report.");
    } finally {
      setGenerating(false);
    }
  }

  /** A Profile with no reading yet — open the existing New Reading dialog on its confirm step (same call as before). */
  async function startFirstReading() {
    if (!profile) return;
    setPreparingGenerate(true);
    try {
      const contact = await getContact(profile.contactId).catch(() => null);
      if (!contact) throw new Error("This person's contact couldn't be found.");
      setOpenRequest({ contact, profile, step: "confirm-profile" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start a reading.");
    } finally {
      setPreparingGenerate(false);
    }
  }

  const readingDates = useMemo(() => new Map(readings.map((r) => [r.id, r.createdAt])), [readings]);
  const readingHistory = useMemo(() => readings.map((r) => ({ id: r.id, createdAt: r.createdAt })), [readings]);

  /** "Reading from" selector — a real navigation (push), so refresh keeps the snapshot and Back returns to the previous one. The newest needs no `readingId`. */
  function selectReading(id: string) {
    if (!profileId) return;
    const isLatest = readings[0]?.id === id;
    router.push(build({ profileId, readingId: isLatest ? null : id, view: searchParams.get("view") }), { scroll: false });
  }

  const hiddenDialog = (
    <div className="hidden">
      <NewReadingDialog
        onCreated={() => {
          if (readingId && profileId) router.replace(build({ profileId }));
          else setReloadKey((k) => k + 1);
        }}
        openRequest={openRequest}
        onOpenRequestHandled={() => setOpenRequest(null)}
        onProfileUpdated={(p) => setProfile(p)}
        onProfileDeleted={() => backToLibrary()}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reading…
      </div>
    );
  }

  if (notFound || (!selected && !profile)) {
    return (
      <div className="space-y-3 rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm font-semibold">This reading couldn&apos;t be found.</p>
        <p className="text-sm text-muted-foreground">It may have been deleted, or it belongs to another workspace.</p>
        <Button variant="outline" onClick={backToLibrary}>
          Back to Readings
        </Button>
      </div>
    );
  }

  if (!selected && profile) {
    return (
      <div className="space-y-4">
        {hiddenDialog}
        <button type="button" onClick={backToLibrary} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          ← Readings
        </button>
        <div className="space-y-3 rounded-2xl border bg-card p-8 text-center" data-no-reading>
          <p className="text-lg font-semibold">{profile.name}</p>
          <p className="text-sm text-muted-foreground">No reading has been generated for this person yet.</p>
          <Button onClick={() => void startFirstReading()} disabled={preparingGenerate}>
            {preparingGenerate ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileOutput className="mr-1.5 h-4 w-4" />}
            Generate reading
          </Button>
        </div>
      </div>
    );
  }

  if (!selected) return null;

  return (
    <div className="space-y-4">
      {hiddenDialog}
      <HumanDesignReadingWorkspace
        reading={selected}
        selectedProfile={profile}
        subAccountId={subAccountId}
        subAccount={subAccount}
        chartDesigns={chartDesigns}
        reportDesigns={reportDesigns}
        hdDesign={resolveDesign("humanDesign", profile?.hdChartDesignId, defaultHdDesign)}
        mandalaDesign={resolveDesign("mandala", profile?.mandalaChartDesignId, defaultMandalaDesign)}
        astroDesign={resolveDesign("astrology", profile?.astrologyChartDesignId, defaultAstroDesign)}
        savingDesignFor={savingDesignFor}
        onSaveDesignOverride={(p, system, id) => void saveDesignOverride(p, system, id)}
        availableSystems={availableSystems}
        currentSystem={currentSystem}
        onSetSystem={(key) => setView(key)}
        hdStyleView={hdStyleView}
        onSetHdStyleView={(v) => setView(v === "mandala" ? "mandala" : "hd")}
        onBack={backToLibrary}
        showReports={showReports}
        onShowReports={() => setView("reports")}
        readingHistory={profileId ? readingHistory : []}
        onSelectReading={selectReading}
        reportsPanel={
          <GeneratedReportsPanel
            subAccountId={subAccountId}
            reports={generatedReports}
            loading={reportsLoading}
            readingDates={readingDates}
            reportDesigns={reportDesigns}
            onGenerate={openGenerateDialog}
            onDelete={(r) => void deleteGeneratedReport(r)}
            deletingReportId={deletingReportId}
          />
        }
        onOpenGenerateDialog={openGenerateDialog}
        deletingReadingId={deletingReadingId}
        onDeleteReading={(r) => void deleteReading(r)}
      />

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
          </DialogHeader>
          {!generatedResult ? (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Choose a Report Design to generate for {selected.name}. This creates a generated report — a
                snapshot of this reading&apos;s content, frozen at the moment you generate it. It stays internal to
                your team.
              </p>
              {reportDesigns.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  No Report Designs yet — create one in Report Builder first.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {reportDesigns.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setGenerateDesignId(d.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-3.5 py-2 text-left text-sm",
                        generateDesignId === d.id ? "border-primary bg-primary/5 text-primary" : "hover:border-primary",
                      )}
                    >
                      <span className="truncate">{d.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {d.pages.length} page{d.pages.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <Button onClick={generateReport} disabled={!generateDesignId || generating} className="w-full">
                {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {generating ? "Generating…" : "Generate"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-sm">
                <span className="font-semibold">{generatedResult.reportDesignTitleAtGeneration}</span> generated for {selected.name}.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(`/sa/${subAccountId}/energetic-decoder/generated-reports/${generatedResult.id}/preview`, "_blank")}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                </Button>
                <Button
                  render={<a href={`/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports/${generatedResult.id}/pdf`} download />}
                  className="flex-1"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
                </Button>
              </div>
              <button type="button" onClick={openGenerateDialog} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
                Generate another
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
