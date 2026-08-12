"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, Loader2, MapPin, Plus, Search, ExternalLink, FileOutput, Eye, Download } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import { buildDecoderReportUrl, buildDecoderReportDesignUrl } from "@/lib/domains/public-url";
import { SphereList, HumanDesignSummary, AstrologySummary } from "@/components/energetic-decoder/reading-summary";
import type { ReportDesign } from "@/types/report-blocks";
import type { ChartDesign } from "@/types/chart-design";
import type { GeneratedReport } from "@/types/generated-report";

interface PlaceSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

type ReadingSystem = "frequency" | "hd" | "astro";

/**
 * Real rebuild, 2026-08-10 — the approved workbench mockup (list + a
 * persistent detail pane) never actually got built; this shipped instead
 * as a plain expand-in-place accordion. Found the same day she compared
 * real screenshots against the mockup directly: "none of this shit looks
 * like the way that it should be looking." Same real data/actions as
 * before (search, New reading, Share report, Download PDF, report design
 * link, View contact) — only the layout changed to match what she
 * approved. System sub-tabs inside the detail pane are new: a reading
 * that has more than one system (Frequency/HD/Astrology all at once) now
 * switches between them instead of stacking all three at full length.
 */
export function EnergeticDecoderReadingsTab() {
  const { subAccountId, subAccount } = useSubAccount();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reportDesigns, setReportDesigns] = useState<ReportDesign[]>([]);
  const [chartDesigns, setChartDesigns] = useState<ChartDesign[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [readings, setReadings] = useState<EnergeticDecoderReading[]>([]);
  const [readingsLoading, setReadingsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSystem, setActiveSystem] = useState<ReadingSystem | null>(null);
  const [search, setSearch] = useState("");

  // Generate Report (Phase 2 Build Plan, 2026-08-12) — Reading is today's
  // real source context; the Profile architecture isn't built yet, so this
  // hangs off the reading directly. Deliberately not on the Contact page,
  // per the owner's decision.
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateDesignId, setGenerateDesignId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<GeneratedReport | null>(null);

  async function loadReadings() {
    setReadingsLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings`);
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        readings?: EnergeticDecoderReading[];
      };
      const list = data.readings ?? [];
      setReadings(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } finally {
      setReadingsLoading(false);
    }
  }

  useEffect(() => {
    if (subAccountId) void loadReadings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-designs`)
      .then((r) => r.json())
      .then((d) => setReportDesigns(d.designs ?? []))
      .catch(() => setReportDesigns([]));
  }, [subAccountId]);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs`)
      .then((r) => r.json())
      .then((d) => setChartDesigns(d.designs ?? []))
      .catch(() => setChartDesigns([]));
  }, [subAccountId]);

  const defaultHdDesign = chartDesigns.find((d) => d.system === "humanDesign" && d.isDefault) ?? null;
  const defaultMandalaDesign = chartDesigns.find((d) => d.system === "mandala" && d.isDefault) ?? null;
  const defaultAstroDesign = chartDesigns.find((d) => d.system === "astrology" && d.isDefault) ?? null;

  function handlePlaceChange(value: string) {
    setBirthPlace(value);
    setSelectedPlace(null);
    setSuggestionsOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await fetch(
          `/api/sub-accounts/${subAccountId}/energetic-decoder/geocode?q=${encodeURIComponent(value)}`,
        );
        const data = (await res.json().catch(() => ({}))) as { results?: PlaceSuggestion[] };
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 400);
  }

  function pickSuggestion(s: PlaceSuggestion) {
    setBirthPlace(s.displayName);
    setSelectedPlace(s);
    setSuggestions([]);
    setSuggestionsOpen(false);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function resetForm() {
    setName("");
    setEmail("");
    setBirthDate("");
    setBirthTime("");
    setBirthPlace("");
    setSelectedPlace(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          birthDate,
          birthTime,
          birthPlace,
          ...(selectedPlace && selectedPlace.displayName === birthPlace
            ? { lat: selectedPlace.lat, lng: selectedPlace.lng, timeZone: selectedPlace.timeZone }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reading?: EnergeticDecoderReading;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.reading) {
        throw new Error(data.error ?? "Something went wrong.");
      }
      toast.success(`${data.reading.name}'s reading saved.`);
      resetForm();
      setOpen(false);
      setSelectedId(data.reading.id);
      await loadReadings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = readings.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return r.name.toLowerCase().includes(q) || r.birthPlace.toLowerCase().includes(q);
  });

  const selected = readings.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  const availableSystems: { key: ReadingSystem; label: string }[] = useMemo(() => {
    if (!selected) return [];
    const list: { key: ReadingSystem; label: string }[] = [];
    if (selected.spheres.length > 0) list.push({ key: "frequency", label: "Frequency" });
    if (selected.humanDesign) list.push({ key: "hd", label: "Human Design" });
    if (selected.astrology) list.push({ key: "astro", label: "Astrology" });
    return list;
  }, [selected]);

  const currentSystem = availableSystems.some((s) => s.key === activeSystem)
    ? activeSystem
    : (availableSystems[0]?.key ?? null);

  function selectReading(id: string) {
    setSelectedId(id);
    setActiveSystem(null);
  }

  function openGenerateDialog() {
    setGenerateDesignId("");
    setGeneratedResult(null);
    setGenerateOpen(true);
  }

  /** Reuses the existing GeneratedReport service (list/get/create, Task 2) — no second generation/resolution path. */
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate that report.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Readings</h2>
          <p className="text-sm text-muted-foreground">Your saved client charts.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) resetForm();
          }}
        >
          <DialogTrigger
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New reading
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New reading</DialogTitle>
            </DialogHeader>
            <p className="-mt-2 text-xs text-muted-foreground">
              Generates the profile and saves it as a reading linked to this client&apos;s contact.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-name">Name</Label>
                <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-email">Email</Label>
                <Input
                  id="ed-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="relative space-y-1.5">
                <Label htmlFor="ed-place">Birth place</Label>
                <Input
                  id="ed-place"
                  value={birthPlace}
                  onChange={(e) => handlePlaceChange(e.target.value)}
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                  placeholder="Austin, TX, USA"
                  autoComplete="off"
                  required
                />
                {suggestionsOpen && (suggestions.length > 0 || suggestLoading) && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
                    {suggestLoading && suggestions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                    ) : (
                      suggestions.map((s) => (
                        <button
                          key={`${s.lat},${s.lng}`}
                          type="button"
                          onMouseDown={() => pickSuggestion(s)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                        >
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <span>{s.displayName}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ed-date">Birth date</Label>
                  <Input
                    id="ed-date"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ed-time">Birth time</Label>
                  <Input
                    id="ed-time"
                    type="time"
                    value={birthTime}
                    onChange={(e) => setBirthTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Generate &amp; save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {readingsLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : readings.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
          No readings saved yet — click &ldquo;New reading&rdquo; to generate one.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
          {/* List pane */}
          <div className="flex h-[640px] flex-col overflow-hidden rounded-2xl border bg-card">
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or place…"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex-1 divide-y overflow-y-auto">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectReading(r.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-accent/40",
                    selected?.id === r.id && "bg-accent/60 shadow-[inset_3px_0_0_0_var(--primary)]",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
                    {r.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.birthPlace} · {r.birthDate}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.spheres.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Frequency" />}
                    {r.humanDesign && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Human Design" />}
                    {r.astrology && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" title="Astrology" />}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">No readings match.</p>
              )}
            </div>
          </div>

          {/* Detail pane */}
          <div className="h-[640px] overflow-y-auto rounded-2xl border bg-card">
            {!selected ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Select a reading.</p>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {selected.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-bold">{selected.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selected.birthPlace} · {selected.birthDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        const url = buildDecoderReportUrl({ subAccount, subAccountId, readingId: selected.id });
                        navigator.clipboard.writeText(url);
                        toast.success("Report link copied — this is the actual deliverable, safe to send to the client.");
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Copy className="h-3 w-3" />
                      Share report
                    </button>
                    <a
                      href={`/api/sub-accounts/${subAccountId}/energetic-decoder/readings/${selected.id}/pdf`}
                      download
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Download PDF
                    </a>
                    <button
                      type="button"
                      onClick={openGenerateDialog}
                      className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      <FileOutput className="h-3 w-3" />
                      Generate Report
                    </button>
                    {reportDesigns.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const reportId = e.target.value;
                          if (!reportId) return;
                          const url = buildDecoderReportDesignUrl({ subAccount, subAccountId, readingId: selected.id, reportId });
                          navigator.clipboard.writeText(url);
                          toast.success("Report design link copied.");
                          e.target.value = "";
                        }}
                        className="rounded-md border bg-background px-1.5 py-0.5 text-xs text-primary"
                      >
                        <option value="">Copy report design link…</option>
                        {reportDesigns.map((d) => (
                          <option key={d.id} value={d.id}>{d.title}</option>
                        ))}
                      </select>
                    )}
                    <Link
                      href={`/sa/${subAccountId}/contacts/${selected.contactId}`}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      View contact
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                <div className="p-4">
                  {availableSystems.length > 1 && (
                    <div className="mb-4 inline-flex rounded-lg bg-muted/30 p-1">
                      {availableSystems.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setActiveSystem(s.key)}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-semibold",
                            currentSystem === s.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {currentSystem === "frequency" && <SphereList spheres={selected.spheres} />}
                  {currentSystem === "hd" && selected.humanDesign && (
                    <HumanDesignSummary
                      profile={selected.humanDesign}
                      hdDesign={defaultHdDesign}
                      mandalaDesign={defaultMandalaDesign}
                    />
                  )}
                  {currentSystem === "astro" && selected.astrology && (
                    <AstrologySummary chart={selected.astrology} astroDesign={defaultAstroDesign} />
                  )}
                  {availableSystems.length === 0 && (
                    <p className="py-8 text-center text-xs text-muted-foreground">This reading has no systems yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
          </DialogHeader>
          {!generatedResult ? (
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                Choose a Report Template to generate for {selected?.name}. This creates a real generated-report
                record — a snapshot of this reading&apos;s resolved content, frozen at the moment you generate it.
              </p>
              {reportDesigns.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  No Report Templates yet — build one in Report Builder first.
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
                      <span className="shrink-0 text-xs text-muted-foreground">{d.pages.length} page{d.pages.length === 1 ? "" : "s"}</span>
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
                <span className="font-semibold">{generatedResult.reportDesignTitleAtGeneration}</span> generated for{" "}
                {selected?.name}.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() =>
                    window.open(
                      `/sa/${subAccountId}/energetic-decoder/generated-reports/${generatedResult.id}/preview`,
                      "_blank",
                    )
                  }
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                </Button>
                <Button
                  render={
                    <a
                      href={`/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports/${generatedResult.id}/pdf`}
                      download
                    />
                  }
                  className="flex-1"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
                </Button>
              </div>
              <button
                type="button"
                onClick={openGenerateDialog}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Generate another
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
