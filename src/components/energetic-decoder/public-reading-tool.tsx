"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AttributionVisitLogger } from "@/components/attribution/visit-logger";
import { StandardResult, type EmailOutcome } from "@/components/energetic-decoder/reading-blocks/standard-result";
import { readAttributionFromBrowser } from "@/lib/attribution";
import { READING_PREVIEW_STORAGE_PREFIX } from "@/lib/energetic-decoder/reading-preview-handoff";
import type { PublicEmbedConfig, ReadingPlacement } from "@/types/embed-config";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { ChartDesign } from "@/types/chart-design";
import type { ReadingBlockContext } from "@/types/reading-blocks";

/**
 * The Public Reading Tool — ONE client component behind every way a Reading
 * Tool is used: the direct page (/decoder/{saId}), the external install
 * (iframe), and the native Pages & Funnels block. The form stays a narrow
 * card. After submitting (2026-10-21):
 *
 *   Standard Result     rendered right here, from the shared Reading blocks
 *   Reading Result Page the WHOLE browser tab moves to the custom page
 *                       (an iframe install asks its host page to navigate)
 *
 * Nothing internal (Reading Tool name, block label) is ever rendered here.
 */

interface PlaceSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

interface SubmitResponse {
  ok?: boolean;
  reading?: EnergeticDecoderReading;
  links?: { report: string | null; pdf: string | null; myMagnetixAction: string | null };
  pass?: string | null;
  myMagnetix?: { openUrl: string; maskedEmail: string | null } | null;
  redirect?: string | null;
  previewPageId?: string | null;
  email?: EmailOutcome;
  error?: string;
}

export type ReadingToolMode = "live" | "test" | "preview";

export function PublicReadingTool({
  saId,
  embedId,
  embed,
  accent,
  hdDesign,
  mandalaDesign,
  astroDesign,
  mode = "live",
  placement,
  embedded = false,
  logVisit = false,
  cardClassName = "rounded-2xl border bg-card p-6 shadow-sm sm:p-8",
  headingLevel = 2,
}: {
  saId: string;
  embedId: string | null;
  embed: PublicEmbedConfig;
  accent: string;
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
  mode?: ReadingToolMode;
  placement: ReadingPlacement;
  /** Inside an iframe on another site — reports its height to the host page. */
  embedded?: boolean;
  /** Count a visit for attribution (live Reading Tools on real public placements only). */
  logVisit?: boolean;
  cardClassName?: string;
  /** 1 on the tool's own page; 2 inside a Pages & Funnels page. */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attributionRef = useRef<ReturnType<typeof readAttributionFromBrowser>>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ctx: ReadingBlockContext; pass: string | null; email: EmailOutcome } | null>(null);
  /** A custom Result Page we're sending the visitor to (shown as a fallback link). */
  const [handoff, setHandoff] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const staffMode = mode !== "live";

  // Snapshot campaign attribution once, before anything changes the URL.
  useEffect(() => {
    attributionRef.current = readAttributionFromBrowser();
  }, []);

  // Iframe installs: keep the host page's iframe as tall as the content.
  useEffect(() => {
    if (!embedded || typeof window === "undefined" || window.parent === window) return;
    const el = rootRef.current;
    if (!el) return;
    const post = () =>
      window.parent.postMessage({ type: "magnetix:reading-tool:height", height: Math.ceil(document.documentElement.scrollHeight) }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(el);
    post();
    return () => ro.disconnect();
  }, [embedded, result, handoff]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

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
        const res = await fetch(`/api/decoder/${saId}/geocode?q=${encodeURIComponent(value)}`);
        const data = (await res.json().catch(() => ({}))) as { results?: PlaceSuggestion[] };
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 400);
  }

  /** Move the WHOLE tab to the Result Page — never a result trapped in a small iframe. */
  function goToResultPage(url: string) {
    setHandoff(url);
    if (embedded && window.parent !== window) {
      // The install script on the host page performs the navigation; a
      // top-level navigation from here is a fallback some browsers allow.
      window.parent.postMessage({ type: "magnetix:reading-tool:navigate", url }, "*");
      try {
        window.top!.location.href = url;
      } catch {
        /* the visible "Open your Reading" link below covers this */
      }
      return;
    }
    window.location.assign(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (embed.form.consent.enabled && !consent) {
      setError("Please tick the box to continue.");
      return;
    }
    setSubmitting(true);
    // Preview of a custom Result Page opens in a new tab. Open it now, inside
    // the click, so popup blockers allow it — it's pointed at the preview
    // once the Reading is calculated (or closed if the submit fails).
    let previewTab: Window | null = null;
    if (mode === "preview" && embed.afterSubmit.destination === "customPage") {
      previewTab = window.open("about:blank", "_blank");
    }
    try {
      const res = await fetch(`/api/decoder/${saId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embedId,
          mode,
          name,
          email,
          phone: embed.form.phone === "off" ? "" : phone,
          consent,
          birthDate,
          birthTime,
          birthPlace,
          ...(selectedPlace && selectedPlace.displayName === birthPlace
            ? { lat: selectedPlace.lat, lng: selectedPlace.lng, timeZone: selectedPlace.timeZone }
            : {}),
          placement,
          attribution: attributionRef.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SubmitResponse;
      if (!res.ok || !data.ok || !data.reading) throw new Error(data.error ?? "Something went wrong. Try again.");

      if (data.redirect) {
        goToResultPage(data.redirect);
        return;
      }
      if (data.previewPageId && mode === "preview") {
        // Preview of a custom Result Page: hand the unsaved Reading to the
        // page's draft in a new tab. Nothing is saved anywhere.
        const key = `${READING_PREVIEW_STORAGE_PREFIX}${data.previewPageId}`;
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), reading: data.reading, accent, designs: { hdDesign, mandalaDesign, astroDesign } }));
        } catch {
          /* the preview page explains a missing hand-off */
        }
        const url = `/sa/${saId}/pages-funnels/${data.previewPageId}/new-builder/preview?reading=preview`;
        setHandoff(url);
        if (previewTab && !previewTab.closed) previewTab.location.href = url;
        else window.open(url, "_blank");
        previewTab = null;
        return;
      }

      const ctx: ReadingBlockContext = {
        subAccountId: saId,
        reading: data.reading,
        designs: { hdDesign: hdDesign ?? null, mandalaDesign: mandalaDesign ?? null, astroDesign: astroDesign ?? null },
        accent,
        mode,
        access: {
          pdfHref: data.links?.pdf ?? null,
          reportHref: data.links?.report ?? null,
          myMagnetix: embed.afterSubmit.myMagnetix
            ? {
                actionUrl: data.links?.myMagnetixAction ?? null,
                openUrl: data.myMagnetix?.openUrl ?? "/my/readings",
                maskedEmail: data.myMagnetix?.maskedEmail ?? null,
              }
            : null,
        },
        offers: {},
        sampleLabel: null,
      };
      setResult({ ctx, pass: data.pass ?? null, email: data.email ?? "off" });
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      if (previewTab && !previewTab.closed) previewTab.close();
      setSubmitting(false);
    }
  }

  return (
    <div ref={rootRef} data-public-reading-tool className="w-full">
      {logVisit && embedId && mode === "live" && (
        <AttributionVisitLogger subAccountId={saId} pageType="readingTool" pageId={embedId} />
      )}
      {staffMode && <StaffModeBanner mode={mode} />}
      {handoff ? (
        <div className={`mx-auto w-full max-w-lg text-center ${cardClassName}`} data-result-handoff>
          <p className="public-ink text-lg font-semibold">Your Reading is ready</p>
          <p className="mt-1 text-sm text-muted-foreground">Taking you there now…</p>
          <a
            href={handoff}
            target={mode === "preview" ? "_blank" : "_top"}
            rel={mode === "preview" ? "noreferrer" : undefined}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            Open your Reading
            <ArrowRight className="h-4 w-4" />
          </a>
          {staffMode && (
            <div className="mt-3">
              <button type="button" onClick={() => setHandoff(null)} className="text-xs font-medium text-muted-foreground underline">
                Run it again
              </button>
            </div>
          )}
        </div>
      ) : result ? (
        <div className="space-y-4">
          <StandardResult ctx={result.ctx} embed={embed} pass={result.pass} emailOutcome={result.email} email={staffMode ? null : email} />
          {mode !== "live" && (
            <div className="text-center">
              <button type="button" onClick={() => setResult(null)} className="text-xs font-medium text-muted-foreground underline">
                Run it again
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={`mx-auto w-full max-w-lg ${cardClassName}`}>
          {embed.form.title && <Heading className="public-ink text-2xl font-semibold tracking-tight">{embed.form.title}</Heading>}
          {embed.form.intro && <p className="mt-1 text-sm text-muted-foreground">{embed.form.intro}</p>}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prt-name">Name</Label>
              <Input id="prt-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
            {!staffMode && (
              <div className="space-y-1.5">
                <Label htmlFor="prt-email">Email</Label>
                <Input id="prt-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
            )}
            {embed.form.phone !== "off" && (
              <div className="space-y-1.5">
                <Label htmlFor="prt-phone">Phone{embed.form.phone === "optional" ? " (optional)" : ""}</Label>
                <Input id="prt-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required={embed.form.phone === "required"} autoComplete="tel" />
              </div>
            )}
            <div className="relative space-y-1.5">
              <Label htmlFor="prt-place">Birth place</Label>
              <Input
                id="prt-place"
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
                <Label htmlFor="prt-date">Birth date</Label>
                <Input id="prt-date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prt-time">Birth time</Label>
                <Input id="prt-time" type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} required />
              </div>
            </div>
            {embed.form.consent.enabled && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span>{embed.form.consent.text}</span>
              </label>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting} style={{ backgroundColor: accent }}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Calculating…
                </>
              ) : (
                embed.form.buttonLabel || "Get my reading"
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function StaffModeBanner({ mode }: { mode: ReadingToolMode }) {
  return (
    <div
      role="status"
      className={`mx-auto mb-4 w-full max-w-lg rounded-xl border px-4 py-3 text-sm ${
        mode === "preview" ? "border-sky-500/30 bg-sky-500/10" : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      {mode === "preview" ? (
        <span>
          <strong>Preview</strong> — the real form and calculation. Nothing is saved, sent or counted.
        </span>
      ) : (
        <span>
          <strong>Test run</strong> — follows this Reading Tool’s journey and saves a hidden test record. Anything it sends goes only to you.
        </span>
      )}
    </div>
  );
}
