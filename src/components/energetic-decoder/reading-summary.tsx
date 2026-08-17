import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";
import type { HumanDesignProfile, LocalSkillEntry } from "@/lib/energetics/human-design";
import { CENTERS, CENTER_LABELS } from "@/lib/energetics/human-design-data";
import { TYPE_CONTENT, AUTHORITY_CONTENT, CENTER_CONTENT } from "@/lib/energetics/human-design-content-data";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import { ASPECT_TYPE_CONTENT } from "@/lib/energetics/astrology-content-data";
import type { HumanDesignReadingContent, AstrologyReadingContent } from "@/types/energetic-decoder";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { AspectGrid } from "@/components/energetic-decoder/aspect-grid";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { GeneKeysChart } from "@/components/energetic-decoder/gene-keys-chart";
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
 * WHICH of each pair applies to a given person is fully solved now, as of
 * 2026-08-10 — real, free, local (human-design-variables.ts), no paid API
 * involved. This vocabulary-only list is only ever shown as a fallback for
 * genuinely ancient readings created before that shipped (see
 * VARIABLE_FIELDS below for the real per-person resolution).
 */
const VARIABLES: { label: string; values: string[] }[] = [
  { label: "Digestion", values: ["Consecutive", "Alternating", "Open", "Closed", "Hot", "Cold", "Calm", "Nervous", "High", "Low", "Direct", "InDirect"] },
  { label: "Sense", values: ["Security", "Uncertainty", "Action", "Meditation", "Judgment", "Acceptance"] },
  { label: "Design Sense", values: ["Smell", "Taste", "Outer Vision", "Inner Vision", "Feeling", "Touch"] },
  { label: "Motivation", values: ["Fear", "Hope", "Desire", "Need", "Guilt", "Innocence"] },
  { label: "Perspective", values: ["Survival", "Possibility", "Power", "Wanting", "Probability", "Personal"] },
  { label: "Environment", values: ["Caves", "Markets", "Kitchens", "Mountains", "Valleys", "Shores"] },
];

/** Real, calculated per-reading — fully local since 2026-08-10 (values) / 2026-08-11 (descriptions), no paid API. Falls back to the vocabulary-only list above only for readings created before local Variable calculation shipped. */
type VariableFieldKey = "digestion" | "sense" | "designSense" | "motivation" | "perspective" | "environment";
const VARIABLE_FIELDS: { label: string; key: VariableFieldKey }[] = [
  { label: "Digestion", key: "digestion" },
  { label: "Sense", key: "sense" },
  { label: "Design Sense", key: "designSense" },
  { label: "Motivation", key: "motivation" },
  { label: "Perspective", key: "perspective" },
  { label: "Environment", key: "environment" },
];

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

/**
 * One layer of the local Skills & Attributes section (Core Strengths /
 * Signature Talents / Natural Gifts) — see human-design-skills-service.ts
 * for how each layer's entries are chosen and composed. Renders nothing
 * when a person has no entries for a layer (a chart with zero defined
 * Channels, for instance, would have no Signature Talents).
 */
function SkillLayerList({ title, entries }: { title: string; entries: LocalSkillEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</p>
      <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
        {entries.map((entry, i) => (
          <span key={`${entry.headline}-${i}`}>
            <span className="font-medium text-foreground">{entry.headline}</span>
            {entry.meta && <span className="text-muted-foreground/60"> ({entry.meta})</span>}
            {entry.description && <span className="text-muted-foreground"> — {entry.description}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Sequence grouping for the detail list below the chart — same 3 real
 * sequences/order gene-keys-chart.tsx draws (Life's Work->Evolution->
 * Radiance->Purpose, Attraction->IQ->EQ->SQ,
 * Vocation->Culture->Brand->Pearl), so the list reads as an extension of
 * the chart above it instead of a second, differently-ordered view of the
 * same 12 spheres. Purely a presentation grouping — no calculation, no
 * interpretive text invented here; every shadow/gift/siddhi/showsUp/
 * giftText value below still comes straight from the same `spheres` array
 * the chart reads (calculation, visualization and interpretive content
 * stay separable — this component only lays out what it's given).
 */
const DETAIL_SEQUENCES: { label: string; color: string; order: GeneKeysSphereResult["sphere"][] }[] = [
  { label: "Activation Sequence", color: "#b45309", order: ["Life's Work", "Evolution", "Radiance", "Purpose"] },
  { label: "Venus Sequence", color: "#9d3a63", order: ["Attraction", "IQ", "EQ", "SQ"] },
  { label: "Pearl Sequence", color: "#5E2574", order: ["Vocation", "Culture", "Brand", "Pearl"] },
];

export function SphereList({ spheres }: { spheres: GeneKeysSphereResult[] }) {
  const bySphere = new Map(spheres.map((s) => [s.sphere, s]));
  // Any sphere the fixed sequence order above doesn't account for (should
  // never happen against the real 12 — defensive only) still renders,
  // appended after the 3 grouped sections, so nothing silently disappears.
  const grouped = new Set(DETAIL_SEQUENCES.flatMap((g) => g.order));
  const ungrouped = spheres.filter((s) => !grouped.has(s.sphere));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Frequency — Hologenetic Profile</p>
        <GeneKeysChart spheres={spheres} className="mx-auto w-full max-w-[560px]" />
      </div>
      {DETAIL_SEQUENCES.map((group) => {
        const rows = group.order.map((name) => bySphere.get(name)).filter((s): s is GeneKeysSphereResult => !!s);
        if (rows.length === 0) return null;
        return (
          <div key={group.label} className="overflow-hidden rounded-2xl border bg-card">
            <p
              className="border-b px-5 py-2 text-xs font-semibold uppercase tracking-wide"
              style={{ color: group.color, backgroundColor: `${group.color}14` }}
            >
              {group.label}
            </p>
            <div className="divide-y">
              {rows.map((s) => (
                <SphereRow key={s.sphere} sphere={s} />
              ))}
            </div>
          </div>
        );
      })}
      {ungrouped.length > 0 && (
        <div className="divide-y rounded-2xl border bg-card">
          {ungrouped.map((s) => (
            <SphereRow key={s.sphere} sphere={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SphereRow({ sphere: s }: { sphere: GeneKeysSphereResult }) {
  return (
    <div className="px-5 py-3">
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
  );
}

export function HumanDesignSummary({
  profile,
  hdDesign,
  mandalaDesign,
  chartStyle = "both",
  hideChartAndBasics = false,
}: {
  profile: HumanDesignProfile & { content?: HumanDesignReadingContent };
  /** The sub-account's default Human Design Chart Design (2026-08-09 rebuild — full color set, not just one field) — falls back to the traditional black/white/gray base when not passed. */
  hdDesign?: ChartDesign | null;
  /** The sub-account's default Mandala Chart Design — the real Mandala chart only renders when this is passed; omitted entirely otherwise rather than showing a fake/empty chart. */
  mandalaDesign?: ChartDesign | null;
  /**
   * Which chart(s) to actually show — 2026-08-15, Bodygraph gap closure
   * (Decision Brief Decision 5's follow-up: a real style switcher, not
   * just the correct Human Design → Traditional/Mandala hierarchy).
   * Defaults to "both" — every existing caller (the public report page,
   * the report-design preview) that doesn't pass this keeps its exact
   * current stacked-both-charts behavior, zero regression. Only the
   * Readings tab passes "traditional" or "mandala" explicitly, to show
   * one at a time with a real switch control above this component. The
   * data block below (Type/Authority/Gates/Variables/etc.) is
   * chart-agnostic and always renders regardless of this prop — it's the
   * same underlying reading data either way, not tied to one chart style.
   */
  chartStyle?: "both" | "traditional" | "mandala";
  /**
   * 2026-08-17, Readings workspace rebuild — the new
   * HumanDesignReadingWorkspace (Traditional view only) renders its own
   * chart (widened HumanDesignFullChart) and its own compact Chart
   * Information strip, matching the approved mockup. Passing true here
   * skips both of those blocks so they don't render twice, while
   * Centers/Defined Channels/Variables/Skills below are untouched and
   * still render. Defaults to false — every other caller (public report
   * page, public decoder form, the Mandala/"both" views inside this same
   * component) keeps its exact existing output, zero regression.
   */
  hideChartAndBasics?: boolean;
}) {
  const content = profile.content;
  const typeStrategy = content?.typeStrategy || TYPE_CONTENT[profile.type].strategy;
  const typeDescription = content?.typeDescription || TYPE_CONTENT[profile.type].description;
  const authorityDescription = content?.authorityDescription || AUTHORITY_CONTENT[profile.authority].description;
  const definedSet = new Set(profile.definedCenters);

  return (
    <div className="space-y-4">
      {/*
        Unified full chart — replaces the old separate Bodygraph-image-or-
        local-chart card plus the redundant "Activations" table below it
        (2026-08-10). Design/Personality columns + the BodyGraph + all 4
        Variable arrows are all one component now; profile.design/
        profile.personality's Gate.Line data (previously duplicated into a
        standalone table) already renders inside HumanDesignFullChart's own
        columns, so that table would just be showing the same numbers
        twice.

        Originally just deliberately didn't fall back to Bodygraph's own
        rendered image (profile.bodygraphSvg) the way the old card did —
        her explicit ask: "make our local full chart the primary
        presentation... stop using the external rendered image as the main
        Human Design chart in this view." As of 2026-08-11 there's no
        integration left to fall back to either way: bodygraph-api.ts is
        deleted, the field itself is gone from HumanDesignProfile, this
        card was always local-only in practice, just now also in the type.

        No outer "rounded-2xl border bg-card p-4" wrapper the way every
        other section here has — HumanDesignFullChart already supplies its
        own rounded corners + background (needed for its own light/dark-
        independent white chart surface), so wrapping it in a second card
        would double the padding and nest two round-cornered boxes for no
        reason.
      */}
      {!hideChartAndBasics && (chartStyle === "both" || chartStyle === "traditional") && (
        <div>
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Human Design — Design (left) · BodyGraph · Personality (right)
          </p>
          <HumanDesignFullChart profile={profile} design={hdDesign} />
        </div>
      )}

      {(chartStyle === "both" || chartStyle === "mandala") && mandalaDesign && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mandala — real, built 2026-08-09 (not available from Bodygraph&apos;s API, drawn locally)
          </p>
          <MandalaChart
            profile={profile}
            className="mx-auto w-full max-w-[420px]"
            gateColor={mandalaDesign.chartDefinedColor}
            backgroundColor={mandalaDesign.backgroundColor}
            personalityColor={mandalaDesign.personalityActivationColor}
            designColor={mandalaDesign.designActivationColor}
            zodiacColor={mandalaDesign.mandalaZodiacColor}
            gateRingColor={mandalaDesign.mandalaGateRingColor}
            quadrantColor={mandalaDesign.mandalaQuadrantColor}
            hdDesign={hdDesign}
          />
        </div>
      )}

      {!hideChartAndBasics && (
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
        </div>
      )}

      {/*
        Gates activated / Variables / Skills — real, unique content this
        component's compact-strip replacement (HumanDesignReadingWorkspace's
        ChartInformation, 2026-08-17) doesn't cover, so this stays visible
        even when hideChartAndBasics hides the block above it (which only
        duplicated Type/Authority/Profile/Definition/etc., already shown
        there).
      */}
      <div className="rounded-2xl border bg-card p-4">
        <div>
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
                calculated for this reading (generated before local Variable calculation shipped, 2026-08-10).
              </p>
            </>
          )}
        </div>

        {profile.skills && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Skills &amp; Attributes
            </p>
            {profile.skills.framingLine && (
              <p className="mb-2 text-[11px] italic leading-relaxed text-muted-foreground">{profile.skills.framingLine}</p>
            )}
            <SkillLayerList title="Core Strengths" entries={profile.skills.coreStrengths} />
            <SkillLayerList title="Signature Talents" entries={profile.skills.signatureTalents} />
            <SkillLayerList title="Natural Gifts" entries={profile.skills.naturalGifts} />
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
        {/*
          Local AstrologyWheelChart is the primary presentation now
          (2026-08-11) — same move already made for Human Design's
          BodyGraph above: "make our local chart the primary presentation,
          stop using the external rendered image as the main chart in this
          view." Deliberately does NOT fall back to chart.bodygraphSvg
          (Bodygraph's own rendered image) the way this used to. That field
          is basically never populated for new readings anyway — Chiron,
          the only reason it was ever fetched, now comes from a local calc
          (swiss-ephemeris.ts), not a Bodygraph API call — but even on an
          old reading that still has a stored value, this view now always
          renders the local wheel. bodygraphSvg itself is untouched
          elsewhere (astrology.ts, energetic-decoder-service.ts) — this is
          a display choice in this one file, not a removal of the field.
        */}
        <AstrologyWheelChart
          chart={chart}
          className="mx-auto w-full max-w-[520px]"
          wheelAccentColor={astroDesign?.wheelAccentColor}
          backgroundColor={astroDesign?.backgroundColor}
        />
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
            Aspect Grid
          </p>
          <AspectGrid placements={chart.placements} aspects={chart.aspects} accentColor={astroDesign?.wheelAccentColor} />
        </div>
      )}

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
