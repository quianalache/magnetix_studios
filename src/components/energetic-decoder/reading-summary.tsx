import { Fragment } from "react";
import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, CENTER_LABELS, HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
import { TYPE_CONTENT, AUTHORITY_CONTENT, CENTER_CONTENT } from "@/lib/energetics/human-design-content-data";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import { ASPECT_TYPE_CONTENT } from "@/lib/energetics/astrology-content-data";
import type { HumanDesignReadingContent, AstrologyReadingContent } from "@/types/energetic-decoder";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import type { ChartDesign } from "@/types/chart-design";

/**
 * A saved reading's full display, for BOTH the admin Readings tab
 * (accordion row) and the public, shareable report page
 * (/decoder/[saId]/report/[readingId]) — extracted 2026-08-08 so the two
 * don't drift, and so the actual client-facing report isn't a second,
 * separately-maintained copy of this JSX.
 *
 * Every text field prefers the reading's own snapshotted `content` (the
 * sub-account's wording at generation time, or the default if they never
 * rewrote it — see energetic-decoder-chart-content-service.ts) and only
 * falls back to the hardcoded default maps for readings saved before that
 * snapshot existed.
 */

/**
 * The 6 Variables (Ra Uru Hu's "Primary Health System") — real, named
 * fields she asked to see even while unsolved (2026-08-09): "let's add
 * the things anyways, even if they're blank... we can always find a way
 * on our end."
 *
 * The possible VALUES below are real — pulled directly from Bodygraph's
 * own Chart Content tool (English language, HD Traditional chart tab,
 * clicked into each field individually — the miss she caught 2026-08-09:
 * these were sitting right there the whole time, just one click deeper
 * than the flat field list this file's earlier audit stopped at).
 *
 * What's still genuinely unsolved: WHICH of each pair applies to a given
 * person. That determination needs sub-line color/tone/base resolution
 * this app doesn't calculate yet, and no public documentation of the
 * exact rule has been found (checked both her real HD books — neither
 * covers it, it's Ra's separate PHS teaching, not in Bodygraph's tool
 * either — every "HD API Data" node in her own downloaded custom-property
 * files pulls from the paid API, not a documented formula).
 */
const VARIABLES: { label: string; values: string[] }[] = [
  { label: "Digestion", values: ["Consecutive", "Alternating", "Open", "Closed", "Hot", "Cold", "Calm", "Nervous", "High", "Low", "Direct", "InDirect"] },
  { label: "Sense", values: ["Security", "Uncertainty", "Action", "Meditation", "Judgment", "Acceptance"] },
  { label: "Design Sense", values: ["Smell", "Taste", "Outer Vision", "Inner Vision", "Feeling", "Touch"] },
  { label: "Motivation", values: ["Fear", "Hope", "Desire", "Need", "Guilt", "Innocence"] },
  { label: "Perspective", values: ["Survival", "Possibility", "Power", "Wanting", "Probability", "Personal"] },
  { label: "Environment", values: ["Caves", "Markets", "Kitchens", "Mountains", "Valleys", "Shores"] },
];

/** Real, calculated per-reading — Bodygraph API connected 2026-08-09 (see bodygraph-api.ts). Falls back to the vocabulary-only list above when a reading has no `variables` (created before the API was connected, or the call failed for that one reading). */
type VariableFieldKey = "digestion" | "sense" | "designSense" | "motivation" | "perspective" | "environment";
const VARIABLE_FIELDS: { label: string; key: VariableFieldKey }[] = [
  { label: "Digestion", key: "digestion" },
  { label: "Sense", key: "sense" },
  { label: "Design Sense", key: "designSense" },
  { label: "Motivation", key: "motivation" },
  { label: "Perspective", key: "perspective" },
  { label: "Environment", key: "environment" },
];

/**
 * Renders Bodygraph's own returned SVG via an <img> data URI rather than
 * `dangerouslySetInnerHTML` — an <img> treats SVG content as a raster-like
 * image (any embedded <script> just doesn't run), so a raw string from a
 * third-party API doesn't get inline DOM/script execution rights the way
 * inlining the markup directly would. Safer default even though this
 * particular source is our own trusted backend call, not user input.
 */
function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatDesignDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

export function SphereList({ spheres }: { spheres: GeneKeysSphereResult[] }) {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {spheres.map((s) => (
        <div key={s.sphere} className="px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.sphere}</p>
              <p className="text-sm font-semibold">
                Gate {s.gate}.{s.line}
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

export function HumanDesignSummary({
  profile,
  hdDesign,
  mandalaDesign,
}: {
  profile: HumanDesignProfile & { content?: HumanDesignReadingContent };
  /** The sub-account's default Human Design Chart Design (2026-08-09 rebuild — full color set, not just one field) — falls back to the traditional black/white/gray base when not passed. */
  hdDesign?: ChartDesign | null;
  /** The sub-account's default Mandala Chart Design — the real Mandala chart only renders when this is passed; omitted entirely otherwise rather than showing a fake/empty chart. */
  mandalaDesign?: ChartDesign | null;
}) {
  const content = profile.content;
  const typeStrategy = content?.typeStrategy || TYPE_CONTENT[profile.type].strategy;
  const typeDescription = content?.typeDescription || TYPE_CONTENT[profile.type].description;
  const authorityDescription = content?.authorityDescription || AUTHORITY_CONTENT[profile.authority].description;
  const definedSet = new Set(profile.definedCenters);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bodygraph — Personality <span style={{ color: "#18181b" }}>black</span>, Design <span className="text-rose-600">red</span>
        </p>
        {profile.bodygraphSvg ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image's optimizer can't handle inline SVG data URIs
          <img
            src={svgToDataUri(profile.bodygraphSvg)}
            alt="Human Design bodygraph"
            className="mx-auto w-full max-w-[560px]"
          />
        ) : (
          <HumanDesignChart
            profile={profile}
            className="mx-auto w-full max-w-[560px]"
            definedColor={hdDesign?.chartDefinedColor}
            channelsColor={hdDesign?.channelsColor}
            gatesColor={hdDesign?.gatesColor}
            backgroundColor={hdDesign?.backgroundColor}
          />
        )}
      </div>

      {mandalaDesign && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mandala — real, built 2026-08-09 (not available from Bodygraph&apos;s API, drawn locally)
          </p>
          <MandalaChart
            profile={profile}
            className="mx-auto w-full max-w-[420px]"
            gateColor={mandalaDesign.chartDefinedColor}
            backgroundColor={mandalaDesign.backgroundColor}
          />
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Activations — every planet&apos;s real Gate.Line, both charts
        </p>
        <div className="grid grid-cols-2 gap-x-4 text-xs">
          <p className="mb-1 font-semibold text-rose-600">Design</p>
          <p className="mb-1 font-semibold text-foreground">Personality</p>
          {HD_BODY_LABELS.map(({ body, label, symbol }) => {
            const d = profile.design.find((a) => a.body === body);
            const p = profile.personality.find((a) => a.body === body);
            return (
              <Fragment key={body}>
                <p className="flex items-center justify-between border-b border-dashed py-1 text-muted-foreground">
                  <span>{symbol} {label}</span>
                  <span className="font-medium text-foreground">{d ? `${d.gate}.${d.line}` : "—"}</span>
                </p>
                <p className="flex items-center justify-between border-b border-dashed py-1 text-muted-foreground">
                  <span>{symbol} {label}</span>
                  <span className="font-medium text-foreground">{p ? `${p.gate}.${p.line}` : "—"}</span>
                </p>
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Human Design</p>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">{profile.type}</p>
            <p className="text-xs text-muted-foreground">Strategy: {typeStrategy}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{typeDescription}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{profile.authority} Authority</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{authorityDescription}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>
            Profile: <span className="font-medium text-foreground">{profile.profile ?? "—"}</span>
          </span>
          <span>
            Definition: <span className="font-medium text-foreground">{profile.definitionLabel}</span>
          </span>
          {profile.incarnationCross && (
            <span>
              Incarnation Cross: <span className="font-medium text-foreground">{profile.incarnationCross}</span>
            </span>
          )}
          <span>
            Signature: <span className="font-medium text-foreground">{profile.signature}</span>
          </span>
          <span>
            Not-Self Theme: <span className="font-medium text-foreground">{profile.notSelfTheme}</span>
          </span>
          <span>
            Design date: <span className="font-medium text-foreground">{formatDesignDate(profile.designDateUtc)}</span>
          </span>
        </div>
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-xs text-muted-foreground">
            Gates activated: <span className="font-medium text-foreground">{profile.activatedGates.length}</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {profile.activatedGates.map((g) => (
              <span key={g} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground">
                {g}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 border-t pt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Variables</p>
          {profile.variables ? (
            <div className="space-y-2">
              {VARIABLE_FIELDS.map(({ label, key }) => {
                const v = profile.variables![key];
                return (
                  <div key={label}>
                    <p className="text-xs">
                      <span className="text-muted-foreground">{label}:</span>{" "}
                      <span className="font-medium text-foreground">{v.value}</span>
                    </p>
                    {v.description && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{v.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                {VARIABLES.map((v) => (
                  <span key={v.label}>
                    <span className="text-foreground">{v.label}:</span>{" "}
                    <span className="italic text-muted-foreground/70">{v.values.join(" / ")}</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
                These are the real possible values — which one applies to this specific person isn&apos;t
                calculated for this reading (generated before the Bodygraph API was connected, or the call failed).
              </p>
            </>
          )}
        </div>

        {profile.variables && profile.variables.skills.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Skills &amp; Attributes
            </p>
            <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
              {profile.variables.skills.map((s, i) => (
                <span key={`${s.name}-${i}`}>
                  <span className="font-medium text-foreground">{s.name}</span>
                  {s.description && <span className="text-muted-foreground"> — {s.description}</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Centers</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CENTERS.map((c) => {
            const defined = definedSet.has(c);
            const centerContent = content?.centers[c];
            const text = defined
              ? centerContent?.definedText || CENTER_CONTENT[c].definedText
              : centerContent?.undefinedText || CENTER_CONTENT[c].undefinedText;
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
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{text}</p>
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

export function AstrologySummary({
  chart,
  astroDesign,
}: {
  chart: AstrologyChart & { content?: AstrologyReadingContent };
  /** The sub-account's default Astrology Chart Design (2026-08-09 rebuild) — falls back to the traditional neutral ink when not passed. */
  astroDesign?: ChartDesign | null;
}) {
  const content = chart.content;
  const sun = chart.placements.find((p) => p.body === "sun");
  const moon = chart.placements.find((p) => p.body === "moon");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Natal Chart</p>
        {chart.bodygraphSvg ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URI, next/image's optimizer can't handle inline SVG data URIs
          <img
            src={svgToDataUri(chart.bodygraphSvg)}
            alt="Astrology natal wheel"
            className="mx-auto w-full max-w-[520px]"
          />
        ) : (
          <AstrologyWheelChart
            chart={chart}
            className="mx-auto w-full max-w-[520px]"
            wheelAccentColor={astroDesign?.wheelAccentColor}
            backgroundColor={astroDesign?.backgroundColor}
          />
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Astrology — Western Tropical, {chart.houses.system === "placidus" ? "Placidus" : "Whole Sign"} houses
        </p>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Sun</p>
            <p className="text-sm font-semibold">
              {sun?.sign} {sun?.degInSign.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Moon</p>
            <p className="text-sm font-semibold">
              {moon?.sign} {moon?.degInSign.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Ascendant (House 1)</p>
            <p className="text-sm font-semibold">
              {chart.angles.ascendant.sign} {chart.angles.ascendant.degInSign.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Descendant (House 7)</p>
            <p className="text-sm font-semibold">
              {chart.angles.descendant.sign} {chart.angles.descendant.degInSign.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Midheaven / MC (House 10)</p>
            <p className="text-sm font-semibold">
              {chart.angles.mc.sign} {chart.angles.mc.degInSign.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Imum Coeli / IC (House 4)</p>
            <p className="text-sm font-semibold">
              {chart.angles.ic.sign} {chart.angles.ic.degInSign.toFixed(1)}°
            </p>
          </div>
        </div>
        {chart.houses.fallbackReason && (
          <p className="mt-2 text-[11px] italic text-muted-foreground">{chart.houses.fallbackReason}</p>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Houses</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {chart.houses.cusps.map((c) => (
            <p key={c.house} className="flex items-center justify-between border-b border-dashed py-1 text-muted-foreground">
              <span>House {c.house}</span>
              <span className="font-medium text-foreground">
                {c.sign} {c.degInSign.toFixed(1)}°
              </span>
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Placements</p>
        <div className="divide-y">
          {chart.placements.map((p) => {
            const signText = content?.signs[p.sign];
            return (
              <div key={p.body} className="py-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="w-16 shrink-0 font-medium capitalize">{p.body}</span>
                  <span className="flex-1">
                    {p.sign} {p.degInSign.toFixed(1)}°{p.retrograde ? " ℞" : ""}
                  </span>
                  <span className="text-muted-foreground">House {p.house}</span>
                </div>
                {signText && <p className="mt-0.5 pl-[76px] text-[11px] leading-snug text-muted-foreground">{signText}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {chart.aspects.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Aspects ({chart.aspects.length})
          </p>
          <div className="space-y-1.5">
            {chart.aspects.slice(0, 12).map((a, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium capitalize">{a.bodyA}</span> {a.type.toLowerCase()}{" "}
                <span className="font-medium capitalize">{a.bodyB}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ({a.orb.toFixed(1)}° from exact) — {content?.aspectTypes[a.type] || ASPECT_TYPE_CONTENT[a.type]}
                </span>
              </div>
            ))}
            {chart.aspects.length > 12 && (
              <p className="pt-1 text-[11px] italic text-muted-foreground">
                +{chart.aspects.length - 12} more aspects
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
