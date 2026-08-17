"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Eye,
  Download,
  SlidersHorizontal,
  Trash2,
  Pencil,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { EnergeticProfile } from "@/types/energetic-profile";
import type { Contact } from "@/types/contacts";
import { HumanDesignReadingWorkspace } from "@/components/energetic-decoder/human-design-reading-workspace";
import { EnergeticDecoderReadingConfiguration } from "@/components/energetic-decoder/reading-configuration";
import { NewReadingDialog, type NewReadingDialogOpenRequest } from "@/components/energetic-decoder/new-reading-dialog";
import type { ReportDesign } from "@/types/report-blocks";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { GeneratedReport } from "@/types/generated-report";

type ReadingSystem = "frequency" | "hd" | "astro";

interface ProfileGroup {
  profile: EnergeticProfile;
  contact: Contact | null;
  /** Newest first. */
  readings: EnergeticDecoderReading[];
}

function formatReadingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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
 *
 * Phase 3 Task 8 (2026-08-13) — the list pane is now Profile-centered
 * (Contact → Energetic Profile → Reading), not a flat list of Readings.
 * Each Profile is the primary row; its Readings (there can legitimately
 * be more than one — a correction, an updated generation) nest under it,
 * newest shown inline, older ones behind an expand toggle. A Profile with
 * zero Readings still appears (the architecture allows it) with a
 * "Generate" action. The detail pane on the right — everything from
 * "selected" down — is completely untouched: selecting any Reading, at
 * any nesting level, still opens the exact same Reading detail
 * experience that existed before this task.
 *
 * `initialProfileId` (Decision Brief Decision 9, 2026-08-15) — the
 * Contact page's "Energetic Decoding" quick links deep-link here via
 * `?tab=readings&profileId=`. Applied once, after Profiles/Readings have
 * both loaded: selects that Profile's latest Reading (same as clicking
 * its row) and scrolls the row into view. A Profile with zero Readings
 * still resolves — there's just nothing to auto-select, the row itself
 * (with its "Generate" action) is what the deep link lands on.
 */
export function EnergeticDecoderReadingsTab({
  initialProfileId,
}: {
  initialProfileId?: string;
} = {}) {
  const { subAccountId, subAccount, agencyId } = useSubAccount();
  const [configOpen, setConfigOpen] = useState(false);
  const [reportDesigns, setReportDesigns] = useState<ReportDesign[]>([]);
  const [chartDesigns, setChartDesigns] = useState<ChartDesign[]>([]);

  const [readings, setReadings] = useState<EnergeticDecoderReading[]>([]);
  const [readingsLoading, setReadingsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSystem, setActiveSystem] = useState<ReadingSystem | null>(null);
  const [search, setSearch] = useState("");
  /**
   * 2026-08-15, Bodygraph gap closure — which Human Design chart style is
   * actually showing (never both stacked, matching Bodygraph's own
   * person-page dropdown). Local view state only, not persisted — Decision
   * 5 keeps Traditional/Mandala firmly under Human Design, not peer
   * systems, so this lives inside the "hd" system view, not as a 4th
   * `ReadingSystem`. Reset to "traditional" whenever a different reading
   * is selected (selectReading below), same reset `activeSystem` already gets.
   */
  const [hdStyleView, setHdStyleView] = useState<"traditional" | "mandala">("traditional");
  /** Which system's design-preset dropdown is mid-save, for a small inline spinner — keyed by ChartDesignSystem so Traditional/Mandala/Astrology don't block each other. */
  const [savingDesignFor, setSavingDesignFor] = useState<ChartDesignSystem | null>(null);

  // Profile-centered grouping (Task 8) — profiles + contacts loaded
  // alongside readings; readings-tab.tsx never writes to either directly,
  // it only reads them and calls the same Task 1/4/5/6 endpoints/dialog.
  const [profiles, setProfiles] = useState<EnergeticProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<NewReadingDialogOpenRequest | null>(null);
  const [generatingForProfileId, setGeneratingForProfileId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  // Decision 9 deep-link (see doc comment above) — row refs to scroll a
  // linked-to Profile into view, and a ref (not state) to apply the
  // deep link exactly once even if `groups` re-derives afterward.
  const profileRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const deepLinkAppliedRef = useRef(false);

  // Generate Report (Phase 2 Build Plan, 2026-08-12) — Reading is today's
  // real source context; the Profile architecture isn't built yet, so this
  // hangs off the reading directly. Deliberately not on the Contact page,
  // per the owner's decision.
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateDesignId, setGenerateDesignId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<GeneratedReport | null>(null);

  // Generated Reports lifecycle (2026-08-12) — find/reopen/delete past
  // generations for the selected reading. Reuses the list endpoint that
  // already existed (Task 2's `listGeneratedReports`) but was never called
  // from any UI; delete is new (service + route added this pass).
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  // Delete Reading (Phase 3 Task 6, 2026-08-13) — blocked server-side
  // while any GeneratedReport references it; the block message already
  // comes back in plain language, no raw IDs to add here.
  const [deletingReadingId, setDeletingReadingId] = useState<string | null>(null);

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

  /** Task 8 — every Profile in the sub-account, including ones with zero Readings yet. */
  async function loadProfiles() {
    setProfilesLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/profiles`);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; profiles?: EnergeticProfile[] };
      setProfiles(data.profiles ?? []);
    } finally {
      setProfilesLoading(false);
    }
  }

  useEffect(() => {
    if (subAccountId) void loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  // Contact-name context for each Profile row — same client-side listener
  // pattern NewReadingDialog already uses for its Contact search.
  useEffect(() => {
    if (!agencyId || !subAccountId) return;
    const unsub = subscribeToContacts(
      { agencyId, subAccountId },
      (list) => setContacts(list),
      () => setContacts([]),
    );
    return () => unsub();
  }, [agencyId, subAccountId]);

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

  /**
   * 2026-08-15, Bodygraph gap closure — resolve which ChartDesign actually
   * renders for a given system, honoring the selected Profile's own
   * override (if any) over the sub-account default. Mirrors
   * `resolveChartDesignForProfile` server-side exactly, just client-side
   * against the already-loaded `chartDesigns` list (no extra fetch) —
   * same rule, same safe fallback: an override pointing at a design that
   * no longer exists in `chartDesigns` (deleted) simply doesn't match
   * `.find()`, so `??` falls through to the current default automatically,
   * never a broken/blank chart.
   */
  function resolveDesign(
    system: ChartDesignSystem,
    overrideId: string | null | undefined,
    fallback: ChartDesign | null,
  ): ChartDesign | null {
    if (!overrideId) return fallback;
    const found = chartDesigns.find((d) => d.id === overrideId && d.system === system);
    return found ?? fallback;
  }

  // Phase 3 Task 4 (2026-08-13) — NewReadingDialog owns the entire "who is
  // this for" workflow and its own success toast; this just re-syncs the
  // list and selects the new reading, same as the old inline form did.
  // Task 8: also refreshes Profiles, since a brand-new-person/new-profile
  // path may have just created one this component doesn't know about yet.
  function handleReadingCreated(reading: EnergeticDecoderReading) {
    setSelectedId(reading.id);
    void loadReadings();
    void loadProfiles();
  }

  function handleProfileUpdated(profile: EnergeticProfile) {
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? profile : p)));
  }

  function handleProfileDeleted(profileId: string) {
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
  }

  // Task 8 — group Readings under their Profile. Every production Reading
  // carries profileId (Task 2 going forward, Task 3's migration for
  // history); `orphanReadings` is a defensive fallback for the
  // architecturally-shouldn't-happen case, never hidden.
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const { groups, orphanReadings } = useMemo(() => {
    const byProfile = new Map<string, EnergeticDecoderReading[]>();
    const orphans: EnergeticDecoderReading[] = [];
    for (const r of readings) {
      if (r.profileId) {
        const list = byProfile.get(r.profileId);
        if (list) list.push(r);
        else byProfile.set(r.profileId, [r]);
      } else {
        orphans.push(r);
      }
    }
    for (const list of byProfile.values()) {
      list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    }
    const list: ProfileGroup[] = profiles.map((p) => ({
      profile: p,
      contact: contactById.get(p.contactId) ?? null,
      readings: byProfile.get(p.id) ?? [],
    }));
    // Most-recently-active Profile first; zero-reading Profiles sort to
    // the end, alphabetically, so real activity always leads the list.
    list.sort((a, b) => {
      const aLatest = a.readings[0]?.createdAt ?? "";
      const bLatest = b.readings[0]?.createdAt ?? "";
      if (aLatest && bLatest) return bLatest.localeCompare(aLatest);
      if (aLatest) return -1;
      if (bLatest) return 1;
      return a.profile.name.localeCompare(b.profile.name);
    });
    return { groups: list, orphanReadings: orphans };
  }, [profiles, readings, contactById]);

  // Decision 9 deep-link — runs once, after both Profiles and Readings
  // have loaded, so the target Profile's Readings (if any) are actually
  // present to select from.
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (!initialProfileId) return;
    if (readingsLoading || profilesLoading) return;
    deepLinkAppliedRef.current = true;
    const group = groups.find((g) => g.profile.id === initialProfileId);
    if (!group) return; // bad/stale id, or a profile in another sub-account — fail quiet, same as an unmatched search
    const latest = group.readings[0];
    if (latest) selectReading(latest.id);
    profileRowRefs.current[group.profile.id]?.scrollIntoView({ block: "center" });
  }, [initialProfileId, groups, readingsLoading, profilesLoading]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.profile.name.toLowerCase().includes(q) ||
        (g.profile.relationshipLabel ?? "").toLowerCase().includes(q) ||
        (g.contact?.name ?? "").toLowerCase().includes(q) ||
        g.profile.birthPlace.toLowerCase().includes(q) ||
        g.readings.some((r) => r.name.toLowerCase().includes(q) || r.birthPlace.toLowerCase().includes(q)),
    );
  }, [groups, search]);

  const filteredOrphans = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orphanReadings;
    return orphanReadings.filter((r) => r.name.toLowerCase().includes(q) || r.birthPlace.toLowerCase().includes(q));
  }, [orphanReadings, search]);

  const selected = readings.find((r) => r.id === selectedId) ?? readings[0] ?? null;
  /** The Profile behind the selected Reading, if any — orphan (pre-migration/architecturally-shouldn't-happen) Readings simply resolve to null, same graceful-degrade as everywhere else Task 8 introduced Profiles. */
  const selectedProfile = selected?.profileId ? (profiles.find((p) => p.id === selected.profileId) ?? null) : null;

  const resolvedHdDesign = resolveDesign("humanDesign", selectedProfile?.hdChartDesignId, defaultHdDesign);
  const resolvedMandalaDesign = resolveDesign("mandala", selectedProfile?.mandalaChartDesignId, defaultMandalaDesign);
  const resolvedAstroDesign = resolveDesign("astrology", selectedProfile?.astrologyChartDesignId, defaultAstroDesign);

  /**
   * 2026-08-15, Bodygraph gap closure — save (or clear, via `designId:
   * null`) this Profile's saved-design override for one system. Uses the
   * PATCH profiles/[profileId] route's design-override-only path (added
   * this pass) — never touches name/birth data, so it can't collide with
   * or partially overwrite an in-progress Edit Profile edit. Updates
   * `profiles` state optimistically-on-success only (not before — a
   * rejected/invalid design id, e.g. one that's cross-tenant or the wrong
   * system, must not silently "stick" in the UI before the server's
   * confirmed it), which is exactly the isolation that keeps this
   * Profile's choice from ever touching another Profile's rendering.
   */
  async function saveDesignOverride(profile: EnergeticProfile, system: ChartDesignSystem, designId: string | null) {
    const field = system === "humanDesign" ? "hdChartDesignId" : system === "mandala" ? "mandalaChartDesignId" : "astrologyChartDesignId";
    setSavingDesignFor(system);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: designId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; profile?: EnergeticProfile; error?: string };
      if (!res.ok || !data.ok || !data.profile) throw new Error(data.error ?? "Couldn't save that design.");
      const updated = data.profile;
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(designId ? "Design applied to this profile." : "Reverted to the default design.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that design.");
    } finally {
      setSavingDesignFor(null);
    }
  }

  /** Task 8 — "Generate" on a zero-Reading Profile row. Same POST /readings + { profileId } call NewReadingDialog's confirm-profile screen already makes — not a second implementation. */
  async function generateReadingForProfile(profile: EnergeticProfile) {
    setGeneratingForProfileId(profile.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reading?: EnergeticDecoderReading;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.reading) throw new Error(data.error ?? "Couldn't generate a reading for this profile.");
      toast.success(`${data.reading.name}'s reading saved.`);
      setSelectedId(data.reading.id);
      await loadReadings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate a reading for this profile.");
    } finally {
      setGeneratingForProfileId(null);
    }
  }

  /** Task 8 — Delete Profile directly from the grouped list (same DELETE endpoint Task 6 built; blocked server-side while any Reading exists). */
  async function deleteProfileRow(profile: EnergeticProfile) {
    if (!window.confirm(`Delete the profile "${profile.name}"? This can't be undone.`)) return;
    setDeletingProfileId(profile.id);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/profiles/${profile.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't delete this profile.");
      setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
      toast.success("Profile deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete this profile.");
    } finally {
      setDeletingProfileId(null);
    }
  }

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
    setHdStyleView("traditional");
  }

  function openGenerateDialog() {
    setGenerateDesignId("");
    setGeneratedResult(null);
    setGenerateOpen(true);
  }

  async function loadGeneratedReports(readingId: string) {
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports?readingId=${readingId}`,
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reports?: GeneratedReport[] };
      const list = data.reports ?? [];
      // Newest first — no orderBy in the underlying query (avoids requiring
      // a new Firestore composite index for a two-`where()` list query).
      list.sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""));
      setGeneratedReports(list);
    } catch {
      setGeneratedReports([]);
    }
  }

  useEffect(() => {
    if (selected?.id) void loadGeneratedReports(selected.id);
    else setGeneratedReports([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function deleteGeneratedReport(report: GeneratedReport) {
    if (
      !window.confirm(
        `Delete this generated "${report.reportDesignTitleAtGeneration}" report? This only removes the generated document — the reading, contact, and template are unaffected.`,
      )
    ) {
      return;
    }
    setDeletingReportId(report.id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/generated-reports/${report.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setGeneratedReports((prev) => prev.filter((r) => r.id !== report.id));
      toast.success("Generated report deleted.");
    } catch {
      toast.error("Couldn't delete that generated report.");
    } finally {
      setDeletingReportId(null);
    }
  }

  /**
   * Phase 3 Task 6 (2026-08-13) — delete this Reading. Server blocks
   * (409) while any GeneratedReport still references it, and the block
   * response is already plain practitioner language ("delete those
   * reports first") — passed straight through, no raw IDs added here.
   * On success the reading drops out of the list and, if it was the
   * selected one, `selected` falls back to the next available reading on
   * its own re-derivation (readings.find(...) ?? readings[0] ?? null) —
   * clearing selectedId explicitly here just makes that deterministic
   * instead of relying on the stale id simply no longer matching. Its
   * Profile group updates on its own too, since `groups` is derived from
   * `readings` + `profiles` state, not tracked separately.
   */
  async function deleteReading(reading: EnergeticDecoderReading) {
    if (!window.confirm(`Delete ${reading.name}'s reading? This can't be undone.`)) return;
    setDeletingReadingId(reading.id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/readings/${reading.id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't delete this reading.");
      setReadings((prev) => prev.filter((r) => r.id !== reading.id));
      setSelectedId((prev) => (prev === reading.id ? null : prev));
      toast.success("Reading deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete this reading.");
    } finally {
      setDeletingReadingId(null);
    }
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
      void loadGeneratedReports(selected.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate that report.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Hidden once a reading is explicitly selected — the workspace
          (below) has its own "Readings" breadcrumb/back control, and the
          approved mockup's header has no room for a second, redundant
          page title. `!selectedId`, not `!selected` — `selected` falls
          back to `readings[0]` when nothing's explicitly chosen (existing
          behavior), so `!selected` would stay permanently false, hiding
          this row forever, once any reading exists at all. */}
      {!selectedId && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Readings</h2>
            <p className="text-sm text-muted-foreground">Your saved client charts.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
              <DialogTrigger
                title="Reading configuration"
                aria-label="Reading configuration"
                className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
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
              onProfileUpdated={handleProfileUpdated}
              onProfileDeleted={handleProfileDeleted}
            />
          </div>
        </div>
      )}

      {readingsLoading || profilesLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : groups.length === 0 && orphanReadings.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
          No profiles or readings saved yet — click &ldquo;New reading&rdquo; to generate one.
        </p>
      ) : selectedId && selected ? (
        /*
         * Full-width Traditional Human Design workspace (2026-08-17,
         * approved mockup) — replaces the old list-pane + narrow detail-
         * pane split entirely once a reading is explicitly selected.
         * Real bug caught here, not assumed: `selected` itself falls back
         * to `readings[0]` when `selectedId` is null (existing behavior,
         * unchanged), so checking `selected` alone would make this branch
         * permanently stuck once any reading exists — "back" (which just
         * clears `selectedId`) would never actually show the list again.
         * `selectedId &&` is the real gate; `selected` (guaranteed
         * non-null here since `readings` is non-empty in this branch,
         * see the guard above) is what gets passed down.
         * The list pane (below, in the other branch) is how you get back here for
         * a different reading, via the workspace's own "Readings"
         * breadcrumb/back control (onBack -> setSelectedId(null)).
         * HumanDesignReadingWorkspace itself decides what to render per
         * system/style (currentSystem/hdStyleView) — Traditional HD gets
         * the new 3-column layout, Mandala/Frequency/Astrology render
         * through the exact same existing components as before, just
         * inside this wider chrome (see that file's own header comment).
         */
        <HumanDesignReadingWorkspace
          reading={selected}
          selectedProfile={selectedProfile}
          subAccountId={subAccountId}
          subAccount={subAccount}
          chartDesigns={chartDesigns}
          reportDesigns={reportDesigns}
          hdDesign={resolvedHdDesign}
          mandalaDesign={resolvedMandalaDesign}
          astroDesign={resolvedAstroDesign}
          savingDesignFor={savingDesignFor}
          onSaveDesignOverride={(profile, system, id) => void saveDesignOverride(profile, system, id)}
          availableSystems={availableSystems}
          currentSystem={currentSystem}
          onSetSystem={setActiveSystem}
          hdStyleView={hdStyleView}
          onSetHdStyleView={setHdStyleView}
          onBack={() => setSelectedId(null)}
          generatedReports={generatedReports}
          deletingReportId={deletingReportId}
          onPreviewGeneratedReport={(r) =>
            window.open(`/sa/${subAccountId}/energetic-decoder/generated-reports/${r.id}/preview`, "_blank")
          }
          onDeleteGeneratedReport={(r) => void deleteGeneratedReport(r)}
          onOpenGenerateDialog={openGenerateDialog}
          deletingReadingId={deletingReadingId}
          onDeleteReading={(r) => void deleteReading(r)}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
          {/* List pane — Profile-centered (Task 8): each Profile is the
              primary row, its Readings nest underneath.

              Phase 4 correctness pass (2026-08-15) — `max-h` instead of a
              flat `h-[640px]`: a 2-profile account no longer renders a
              tall box of empty white space below the list. `lg:sticky
              lg:top-4` is new: now that the detail pane (below) grows to
              its natural height instead of being clipped, a chart can run
              well past 640px tall — keeping the list pinned in the
              viewport while the page scrolls past a tall chart is what
              actually lets you pick a different reading without scrolling
              back up first. Single-column (mobile/tablet) drops both the
              cap and the sticky — same reasoning as the detail pane below,
              a short device viewport makes a pinned list fight the chart
              for space instead of helping. */}
          <div className="flex max-h-[640px] flex-col overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-4">
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, relationship, or contact…"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex-1 divide-y overflow-y-auto">
              {filteredGroups.map((g) => {
                const [latest, ...older] = g.readings;
                const isExpanded = expandedProfileId === g.profile.id;
                return (
                  <div
                    key={g.profile.id}
                    ref={(el) => {
                      profileRowRefs.current[g.profile.id] = el;
                    }}
                  >
                    <div
                      className={cn(
                        "flex w-full items-center gap-1 px-3.5 py-2.5 hover:bg-accent/40",
                        latest && selected?.id === latest.id && "bg-accent/60 shadow-[inset_3px_0_0_0_var(--primary)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => latest && selectReading(latest.id)}
                        disabled={!latest}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
                          {g.profile.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{g.profile.name}</span>
                            {g.profile.relationshipLabel && (
                              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {g.profile.relationshipLabel}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {g.profile.birthPlace} · {g.profile.birthDate}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {g.readings.length === 0
                              ? "No readings yet"
                              : `${g.readings.length} reading${g.readings.length === 1 ? "" : "s"} · latest ${formatReadingDate(latest.createdAt)}`}
                          </span>
                        </span>
                      </button>
                      <span className="flex shrink-0 items-center gap-0.5">
                        {g.readings.length === 0 ? (
                          <button
                            type="button"
                            title="Generate a reading for this profile"
                            disabled={generatingForProfileId === g.profile.id}
                            onClick={() => void generateReadingForProfile(g.profile)}
                            className="rounded-md border px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
                          >
                            {generatingForProfileId === g.profile.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Generate"
                            )}
                          </button>
                        ) : older.length > 0 ? (
                          <button
                            type="button"
                            title={isExpanded ? "Hide older readings" : `Show ${older.length} older reading${older.length === 1 ? "" : "s"}`}
                            onClick={() => setExpandedProfileId(isExpanded ? null : g.profile.id)}
                            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="Edit this profile"
                          disabled={!g.contact}
                          onClick={() => g.contact && setOpenRequest({ contact: g.contact, profile: g.profile, step: "edit-profile" })}
                          className="rounded-md p-1 text-muted-foreground hover:text-primary disabled:opacity-40"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="Delete this profile"
                          disabled={deletingProfileId === g.profile.id}
                          onClick={() => void deleteProfileRow(g.profile)}
                          className="rounded-md p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          {deletingProfileId === g.profile.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </span>
                    </div>
                    {isExpanded && older.length > 0 && (
                      <div className="divide-y bg-muted/20">
                        {older.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => selectReading(r.id)}
                            className={cn(
                              "flex w-full items-center py-2 pl-[52px] pr-3.5 text-left hover:bg-accent/30",
                              selected?.id === r.id && "bg-accent/60 shadow-[inset_3px_0_0_0_var(--primary)]",
                            )}
                          >
                            <span className="truncate text-xs text-muted-foreground">
                              Reading from {formatReadingDate(r.createdAt)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredOrphans.length > 0 && (
                <div>
                  <p className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Unlinked readings
                  </p>
                  {filteredOrphans.map((r) => (
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
                    </button>
                  ))}
                </div>
              )}

              {filteredGroups.length === 0 && filteredOrphans.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">No profiles match.</p>
              )}
            </div>
          </div>

          {/*
            Placeholder pane — real detail rendering moved out to
            HumanDesignReadingWorkspace (2026-08-17), which replaces this
            whole grid entirely once `selected` is truthy (see the ternary
            branch above). Nothing below is reachable with a real
            selection anymore, so this is just the empty state.
          */}
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground lg:self-start">
            Select a reading.
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
