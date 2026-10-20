"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Download, FileText, Loader2, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { HumanDesignSummary, AstrologySummary } from "@/components/energetic-decoder/reading-summary";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { AttributionVisitLogger } from "@/components/attribution/visit-logger";
import { resolveMandalaColors } from "@/lib/energetics/mandala-spec";
import { resolveAstrologyColors } from "@/lib/energetics/astrology-spec";
import { readAttributionFromBrowser } from "@/lib/attribution";
import { availableViews, EMBED_VIEW_LABEL } from "@/lib/energetic-decoder/embeds";
import type { EmbedResultView, PublicEmbedConfig, ReadingPlacement } from "@/types/embed-config";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import { defaultChartDesignColor, type ChartDesign } from "@/types/chart-design";

/**
 * The Public Reading Tool (Phase 1, 2026-10-19) — ONE client component
 * behind every way an Embed is used: the direct page (/decoder/{saId}),
 * the external install (iframe), and the native Pages & Funnels block. The
 * form stays a narrow card; the result breaks out into a wide area so the
 * existing HumanDesignFullChart gets its real three-column layout
 * (Design | BodyGraph | Personality), and the M1 compact layout on phones.
 * Nothing internal (Embed name, block label) is ever rendered here.
 */

interface PlaceSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

interface SubmitLinks {
  report: string | null;
  pdf: string | null;
  myMagnetix: string | null;
}

/** What happened to the "Your Reading is ready" email (see public-reading-service). */
type EmailOutcome = "sent" | "notSent" | "off" | "preview";

/** The Mandala and Astrology wheel in the wide result area (2026-10-20: up from 560/520). */
const RESULT_WHEEL = "mx-auto w-full max-w-[720px]";

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
  /** Count a visit for attribution (live Embeds on real public placements only). */
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
  const [result, setResult] = useState<{ reading: EnergeticDecoderReading; links: SubmitLinks; email: EmailOutcome } | null>(null);
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
  }, [embedded, result]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (embed.form.consent.enabled && !consent) {
      setError("Please tick the box to continue.");
      return;
    }
    setSubmitting(true);
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
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reading?: EnergeticDecoderReading;
        links?: SubmitLinks;
        email?: EmailOutcome;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.reading) throw new Error(data.error ?? "Something went wrong. Try again.");
      setResult({
        reading: data.reading,
        links: data.links ?? { report: null, pdf: null, myMagnetix: null },
        email: data.email ?? "off",
      });
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={rootRef} data-public-reading-tool className="w-full">
      {logVisit && embedId && mode === "live" && (
        <AttributionVisitLogger subAccountId={saId} pageType="readingTool" pageId={embedId} />
      )}
      {staffMode && <StaffModeBanner mode={mode} />}
      {result ? (
        <ReadingResult
          embed={embed}
          reading={result.reading}
          links={result.links}
          emailOutcome={result.email}
          mode={mode}
          email={staffMode ? null : email}
          accent={accent}
          hdDesign={hdDesign}
          mandalaDesign={mandalaDesign}
          astroDesign={astroDesign}
          onReset={() => setResult(null)}
        />
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
          <strong>Test run</strong> — follows this Embed’s journey and saves a hidden test record. Anything it sends goes only to you.
        </span>
      )}
    </div>
  );
}

function KeyFacts({ reading }: { reading: EnergeticDecoderReading }) {
  const hd = reading.humanDesign;
  const astro = reading.astrology;
  const sun = astro?.placements.find((p) => p.body === "sun");
  const moon = astro?.placements.find((p) => p.body === "moon");
  // [label, value, wide] — a wide fact (the Incarnation Cross) spans two
  // columns so its full name fits on a line or two instead of being cut off.
  const facts: [string, string, boolean][] = [];
  if (hd) {
    facts.push(["Type", hd.type, false]);
    facts.push(["Strategy", hd.content?.typeStrategy || hd.strategy, false]);
    facts.push(["Authority", hd.authority, false]);
    if (hd.profile) facts.push(["Profile", hd.profile, false]);
    if (hd.definitionLabel) facts.push(["Definition", hd.definitionLabel, false]);
    if (hd.incarnationCross) facts.push(["Incarnation Cross", hd.incarnationCross, true]);
  }
  if (astro) {
    if (sun) facts.push(["Sun", sun.sign, false]);
    if (moon) facts.push(["Moon", moon.sign, false]);
    facts.push(["Rising", astro.angles.ascendant.sign, false]);
  }
  if (facts.length === 0) return null;
  // Values wrap — never truncated or hover-only — so every fact is readable on a phone.
  return (
    <dl data-key-facts className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-4">
      {facts.map(([label, value, wide]) => (
        <div key={label} className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="text-sm font-semibold text-pretty break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReadingResult({
  embed,
  reading,
  links,
  emailOutcome,
  mode,
  email,
  accent,
  hdDesign,
  mandalaDesign,
  astroDesign,
  onReset,
}: {
  embed: PublicEmbedConfig;
  reading: EnergeticDecoderReading;
  links: SubmitLinks;
  emailOutcome: EmailOutcome;
  mode: ReadingToolMode;
  email: string | null;
  accent: string;
  hdDesign?: ChartDesign | null;
  mandalaDesign?: ChartDesign | null;
  astroDesign?: ChartDesign | null;
  onReset: () => void;
}) {
  const show = embed.afterSubmit.show;
  const views = useMemo(
    () => availableViews(embed.views, { humanDesign: !!reading.humanDesign, astrology: !!reading.astrology }),
    [embed.views, reading.humanDesign, reading.astrology],
  );
  const [view, setView] = useState<EmbedResultView | null>(views[0] ?? null);
  const nextStep = embed.afterSubmit.nextStep;

  const deliveryNotes: string[] = [];
  if (mode === "preview") {
    // Preview saves and sends nothing — describe what a real submission does.
    const real = [embed.afterSubmit.myMagnetix && "saved to MyMagnetix", embed.afterSubmit.email && "emailed a link"].filter(Boolean);
    if (real.length) deliveryNotes.push(`Preview — a real visitor’s Reading would be ${real.join(" and ")}.`);
  } else {
    if (embed.afterSubmit.myMagnetix) deliveryNotes.push("Your Reading is saved in MyMagnetix — sign in with your email to see it anytime.");
    // Only claim the email went out when the send actually succeeded.
    if (emailOutcome === "sent") deliveryNotes.push(email ? `We’ve emailed a link to ${email}.` : "We’ve emailed you a link.");
    // The Reading Report button is always shown for a saved Reading, so
    // "below" holds in every display mode, Confirmation only included.
    else if (emailOutcome === "notSent")
      deliveryNotes.push("We couldn’t send your email just now — open your Reading Report below anytime.");
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div className="space-y-1">
          <p className="font-medium">{embed.afterSubmit.confirmationMessage}</p>
          {deliveryNotes.map((n) => (
            <p key={n} className="text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      </div>

      {show !== "confirmation" && views.length > 0 && (
        <>
          {views.length > 1 && (
            <div role="tablist" aria-label="Reading views" className="mx-auto flex w-full max-w-md rounded-full border bg-card p-1">
              {views.map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                    view === v ? "text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={view === v ? { backgroundColor: accent } : undefined}
                >
                  {EMBED_VIEW_LABEL[v]}
                </button>
              ))}
            </div>
          )}

          {view === "humanDesign" && reading.humanDesign && (
            <div className="space-y-4">
              <HumanDesignFullChart profile={reading.humanDesign} design={hdDesign} narrowLayout="compact" className="border" />
              <KeyFacts reading={{ ...reading, astrology: null }} />
              {show === "full" && (
                <HumanDesignSummary profile={reading.humanDesign} hdDesign={hdDesign} chartStyle="traditional" hideChartAndBasics />
              )}
            </div>
          )}

          {view === "mandala" && reading.humanDesign && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-4">
                <MandalaChart
                  profile={reading.humanDesign}
                  className={RESULT_WHEEL}
                  gateColor={mandalaDesign?.chartDefinedColor ?? defaultChartDesignColor()}
                  backgroundColor={mandalaDesign?.backgroundColor ?? "white"}
                  personalityColor={mandalaDesign?.personalityActivationColor}
                  designColor={mandalaDesign?.designActivationColor}
                  zodiacColor={mandalaDesign?.mandalaZodiacColor}
                  mandalaColors={mandalaDesign ? resolveMandalaColors(mandalaDesign) : undefined}
                  gateRingColor={mandalaDesign?.mandalaGateRingColor}
                  quadrantColor={mandalaDesign?.mandalaQuadrantColor}
                  hdDesign={hdDesign}
                />
              </div>
              <KeyFacts reading={{ ...reading, astrology: null }} />
            </div>
          )}

          {view === "astrology" && reading.astrology && (
            <div className="space-y-4">
              {show === "full" ? (
                <AstrologySummary chart={reading.astrology} astroDesign={astroDesign} wheelClassName={RESULT_WHEEL} />
              ) : (
                <>
                  <div className="rounded-2xl border bg-card p-4">
                    <AstrologyWheelChart chart={reading.astrology} className={RESULT_WHEEL} colors={resolveAstrologyColors(astroDesign)} />
                  </div>
                  <KeyFacts reading={{ ...reading, humanDesign: null }} />
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        {links.report && (
          <a href={links.report} target="_top" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted/50">
            <FileText className="h-4 w-4" />
            View your Reading Report
          </a>
        )}
        {links.pdf && (
          <a href={links.pdf} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted/50">
            <Download className="h-4 w-4" />
            Download PDF
          </a>
        )}
        {links.myMagnetix && nextStep?.href !== "/my/readings" && (
          <a href={links.myMagnetix} target="_top" className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted/50">
            <Sparkles className="h-4 w-4" />
            Open MyMagnetix
          </a>
        )}
        {nextStep && (
          <a
            href={nextStep.href}
            target="_top"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {nextStep.label}
            <ArrowRight className="h-4 w-4" />
          </a>
        )}
      </div>
      {mode === "preview" && (
        <p className="text-center text-xs text-muted-foreground">
          Preview — Reading Report, PDF and MyMagnetix links appear here after a real or test submission.
        </p>
      )}
      {mode !== "live" && (
        <div className="text-center">
          <button type="button" onClick={onReset} className="text-xs font-medium text-muted-foreground underline">
            Run it again
          </button>
        </div>
      )}
    </div>
  );
}
