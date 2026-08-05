"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Loader2, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EnergeticDecoderThemeCard } from "@/components/energetic-decoder/theme-card";
import { EnergeticDecoderEmbedShareCard } from "@/components/energetic-decoder/embed-share-card";
import type {
  EnergeticDecoderReading,
  EnergeticDecoderResult,
} from "@/types/energetic-decoder";
import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";

interface PlaceSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

/**
 * Structured after researching bodygraph.com (2026-08-05): its "dashboard"
 * is a practitioner business tool (saved client charts, chart branding, an
 * embeddable lead-capture tool), not a personal dashboard for whoever gets
 * a reading. This page is that practitioner side — a form that SAVES a
 * reading (matching/creating the Contact by email, so it shows up on
 * their profile too — see ContactEnergeticReadings) plus a list of every
 * reading generated so far. No sales-stats dashboard, per her call. Chart
 * design tool and the public embeddable tool are next.
 */
export default function EnergeticDecoderPage() {
  const { subAccountId } = useSubAccount();
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
  const [justSaved, setJustSaved] = useState<EnergeticDecoderResult | null>(null);

  const [readings, setReadings] = useState<EnergeticDecoderReading[]>([]);
  const [readingsLoading, setReadingsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Debounced live search as the visitor types — free Nominatim API, no
  // Google Places key needed. selectedPlace is cleared on every keystroke
  // so the submit handler only sends pre-resolved coords when the text
  // still matches an actual picked suggestion.
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
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          results?: PlaceSuggestion[];
        };
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setJustSaved(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/readings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            birthDate,
            birthTime,
            birthPlace,
            ...(selectedPlace && selectedPlace.displayName === birthPlace
              ? {
                  lat: selectedPlace.lat,
                  lng: selectedPlace.lng,
                  timeZone: selectedPlace.timeZone,
                }
              : {}),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reading?: EnergeticDecoderReading;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.reading) {
        throw new Error(data.error ?? "Something went wrong.");
      }
      setJustSaved({
        name: data.reading.name,
        birthPlace: data.reading.birthPlace,
        timeZone: data.reading.timeZone,
        spheres: data.reading.spheres,
      });
      setName("");
      setEmail("");
      setBirthDate("");
      setBirthTime("");
      setBirthPlace("");
      setSelectedPlace(null);
      await loadReadings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Energetic Decoder
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Gene Keys, Human Design, and astrology chart readings — pick
          whichever system(s) you offer. Gene Keys is live; Human Design
          and astrology are coming. Every reading here is saved and linked
          to that person&apos;s Contact record.
        </p>
      </div>

      <EnergeticDecoderThemeCard />
      <EnergeticDecoderEmbedShareCard subAccountId={subAccountId} />

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border bg-card p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ed-name">Name</Label>
            <Input
              id="ed-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
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
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Searching…
                  </p>
                ) : (
                  suggestions.map((s) => (
                    <button
                      key={`${s.lat},${s.lng}`}
                      type="button"
                      // onMouseDown (not onClick) fires before the input's
                      // onBlur, so the pick registers before the dropdown closes.
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
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Generate & save reading"
          )}
        </Button>
      </form>

      {justSaved && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <h2 className="text-sm font-semibold">
              Saved — {justSaved.name}&apos;s Gene Keys Profile
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {justSaved.birthPlace} · {justSaved.timeZone}
            </p>
          </div>
          <SphereList spheres={justSaved.spheres} />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Saved readings</h2>
        {readingsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : readings.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
            No readings saved yet — generate one above.
          </p>
        ) : (
          <div className="divide-y rounded-2xl border bg-card">
            {readings.map((r) => (
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
          </div>
        )}
      </div>
    </div>
  );
}

function SphereList({ spheres }: { spheres: GeneKeysSphereResult[] }) {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {spheres.map((s) => (
        <div
          key={s.sphere}
          className="flex items-center justify-between gap-4 px-5 py-3"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {s.sphere}
            </p>
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
      ))}
    </div>
  );
}
