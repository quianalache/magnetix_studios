"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, MapPin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import { SphereList, HumanDesignSummary, AstrologySummary } from "@/components/energetic-decoder/reading-summary";

interface PlaceSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

export function PublicDecoderForm({
  saId,
  accent,
  definedColor,
}: {
  saId: string;
  accent: string;
  definedColor?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<EnergeticDecoderReading | null>(null);

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
      try {
        const res = await fetch(
          `/api/decoder/${saId}/geocode?q=${encodeURIComponent(value)}`,
        );
        const data = (await res.json().catch(() => ({}))) as {
          results?: PlaceSuggestion[];
        };
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 400);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/decoder/${saId}/submit`, {
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
        throw new Error(data.error ?? "Something went wrong. Try again.");
      }
      setReading(data.reading);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (reading) {
    // Used to only ever render `reading.spheres` — a sub-account with Human
    // Design or Astrology enabled would calculate and save both, then never
    // show the visitor either one. Fixed 2026-08-08: renders whatever the
    // reading actually included, same shared components the coach's own
    // Readings tab and the persistent report page use.
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Here&apos;s {reading.name}&apos;s reading.</span>
        </div>
        {reading.spheres.length > 0 && <SphereList spheres={reading.spheres} />}
        {reading.humanDesign && <HumanDesignSummary profile={reading.humanDesign} definedColor={definedColor} />}
        {reading.astrology && <AstrologySummary chart={reading.astrology} />}
        <Link
          href={`/decoder/${saId}/report/${reading.id}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-muted/50"
        >
          Save this link — view your full reading anytime
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pd-name">Name</Label>
        <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pd-email">Email</Label>
        <Input
          id="pd-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="relative space-y-1.5">
        <Label htmlFor="pd-place">Birth place</Label>
        <Input
          id="pd-place"
          value={birthPlace}
          onChange={(e) => handlePlaceChange(e.target.value)}
          onFocus={() => setSuggestionsOpen(true)}
          onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
          placeholder="Austin, TX, USA"
          autoComplete="off"
          required
        />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
            {suggestions.map((s) => (
              <button
                key={`${s.lat},${s.lng}`}
                type="button"
                onMouseDown={() => {
                  setBirthPlace(s.displayName);
                  setSelectedPlace(s);
                  setSuggestions([]);
                  setSuggestionsOpen(false);
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{s.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="pd-date">Birth date</Label>
          <Input
            id="pd-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-time">Birth time</Label>
          <Input
            id="pd-time"
            type="time"
            value={birthTime}
            onChange={(e) => setBirthTime(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting} style={{ backgroundColor: accent }}>
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Decoding…
          </>
        ) : (
          "Get my profile"
        )}
      </Button>
    </form>
  );
}
