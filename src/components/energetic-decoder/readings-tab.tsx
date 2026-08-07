"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, MapPin, Plus, Search } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, CENTER_LABELS } from "@/lib/energetics/human-design-data";
import { TYPE_CONTENT, AUTHORITY_CONTENT, CENTER_CONTENT } from "@/lib/energetics/human-design-content-data";

interface PlaceSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

/** Saved client charts + the "New reading" flow, per her explicit ask — this is the practitioner's client history, not a one-off calculator. */
export function EnergeticDecoderReadingsTab() {
  const { subAccountId } = useSubAccount();
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [readings, setReadings] = useState<EnergeticDecoderReading[]>([]);
  const [readingsLoading, setReadingsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function loadReadings() {
    setReadingsLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings`);
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        readings?: EnergeticDecoderReading[];
      };
      setReadings(data.readings ?? []);
    } finally {
      setReadingsLoading(false);
    }
  }

  useEffect(() => {
    if (subAccountId) void loadReadings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or place…"
            className="pl-8"
          />
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) resetForm();
          }}
        >
          <DialogTrigger
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
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
        <div className="divide-y rounded-2xl border bg-card">
          {filtered.map((r) => (
            <div key={r.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.birthPlace} · {r.birthDate}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/sa/${subAccountId}/contacts/${r.contactId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary hover:underline"
                  >
                    View contact
                  </Link>
                  {expandedId === r.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
              {expandedId === r.id && (
                <div className="space-y-4 border-t bg-muted/20 px-5 py-3">
                  {r.spheres.length > 0 && <SphereList spheres={r.spheres} />}
                  {r.humanDesign && <HumanDesignSummary profile={r.humanDesign} />}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">No readings match.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SphereList({ spheres }: { spheres: GeneKeysSphereResult[] }) {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {spheres.map((s) => (
        <div key={s.sphere} className="px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.sphere}</p>
              <p className="text-sm font-semibold">
                Gene Key {s.gate}.{s.line}
              </p>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              <span className="text-rose-500">{s.shadow}</span>
              {" → "}
              <span className="text-emerald-500">{s.gift}</span>
              {" → "}
              <span>☆ {s.siddhi}</span>
            </p>
          </div>
          {(s.showsUp || s.giftText) && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {s.showsUp} {s.giftText}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function HumanDesignSummary({ profile }: { profile: HumanDesignProfile }) {
  const typeInfo = TYPE_CONTENT[profile.type];
  const authorityInfo = AUTHORITY_CONTENT[profile.authority];
  const definedSet = new Set(profile.definedCenters);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Human Design</p>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">{profile.type}</p>
            <p className="text-xs text-muted-foreground">Strategy: {typeInfo.strategy}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{typeInfo.description}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{profile.authority} Authority</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{authorityInfo.description}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>
            Profile: <span className="font-medium text-foreground">{profile.profile ?? "—"}</span>
          </span>
          <span>
            Definition: <span className="font-medium text-foreground">{profile.definitionLabel}</span>
          </span>
          <span>
            Gates activated: <span className="font-medium text-foreground">{profile.activatedGates.length}</span>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Centers</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CENTERS.map((c) => {
            const defined = definedSet.has(c);
            return (
              <div
                key={c}
                className={`rounded-lg border px-2.5 py-2 ${defined ? "border-primary/40 bg-primary/5" : ""}`}
              >
                <p className="flex items-center justify-between gap-1 text-xs font-semibold">
                  {CENTER_LABELS[c]}
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${defined ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {defined ? CENTER_CONTENT[c].definedText : CENTER_CONTENT[c].undefinedText}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {profile.definedChannels.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Defined Channels
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.definedChannels.map((ch) => (
              <span key={ch.key} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                {ch.gates[0]}-{ch.gates[1]}
                {ch.name ? ` · ${ch.name}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
