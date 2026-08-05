"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EnergeticDecoderResult } from "@/types/energetic-decoder";

/**
 * Phase 1 of the Energetic Decoder build — proves the Gene Keys
 * calculation engine end to end (birth details in, full 12-sphere
 * Hologenetic Profile out). No product/checkout/PDF-on-purchase yet, no
 * theme editor, no Human Design bodygraph — those are later phases. This
 * page is the internal test tool while that's being built out.
 */
export default function EnergeticDecoderPage() {
  const { subAccountId } = useSubAccount();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnergeticDecoderResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/calculate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, birthDate, birthTime, birthPlace }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: EnergeticDecoderResult;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.result) {
        throw new Error(data.error ?? "Something went wrong.");
      }
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
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
          and astrology are coming. This is the calculation test tool —
          selling this as a product to your community is next.
        </p>
      </div>

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
            <Label htmlFor="ed-place">Birth place</Label>
            <Input
              id="ed-place"
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              placeholder="Austin, TX, USA"
              required
            />
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
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Calculating…
            </>
          ) : (
            "Calculate profile"
          )}
        </Button>
      </form>

      {result && (
        <div className="space-y-3">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">
              {result.name}&apos;s Gene Keys Profile
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {result.birthPlace} · {result.timeZone}
            </p>
          </div>
          <div className="divide-y rounded-2xl border bg-card">
            {result.spheres.map((s) => (
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
        </div>
      )}
    </div>
  );
}
