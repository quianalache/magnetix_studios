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
                <div className="border-t bg-muted/20 px-5 py-3">
                  <SphereList spheres={r.spheres} />
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
