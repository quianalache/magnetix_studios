import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { VariableArrowDirection, VariableArrowSource } from "@/lib/energetics/human-design-variables";
import type { ChartDesign, PlanetBoxMode, VariableArrowStyle } from "@/types/chart-design";
import { HD_BODY_LABELS, type CenterKey } from "@/lib/energetics/human-design-data";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";

/**
 * The full Human Design chart layout — Design activation column (left) +
 * the existing, untouched BodyGraph (center) + Personality activation
 * column (right) + the 4 Variable arrows around it. Built 2026-08-10 per
 * her reference screenshots, after the rendering audit, the arrow-rule
 * verification, and the Chart Designs field plumbing that all preceded
 * this — every piece of data here (activations, arrow directions, colors)
 * was already validated/wired before this component existed; this is
 * purely a new layout over real, existing data. No calculation logic
 * lives in this file.
 *
 * Preview-only for now, per her explicit "build the component first, not
 * wired into reading-summary.tsx yet" — rendered at
 * /decoder/[saId]/report/[readingId]/full-chart-preview against a real
 * reading so it can be inspected before that wiring happens.
 *
 * Arrow corner placement (Digestion top-left / Environment bottom-left /
 * Motivation top-right / Perspective bottom-right) matches the real,
 * documented convention found in NatalEngine's own source comments during
 * the arrow-rule verification turn — not invented here.
 *
 * Arrow colors, 2026-08-10: the 2 Design-side arrows (Digestion, Environment
 * — Design Sun/Node) use `designActivationColor`; the 2 Personality-side
 * arrows (Motivation, Perspective — Personality Sun/Node) use
 * `personalityActivationColor` — matching the same column each one's
 * source activation actually lives in, rather than one shared `arrowColor`
 * for all 4. `arrowColor` itself is now unread by this file (see its own
 * note below) but stays on the model/service/API/UI, per her explicit
 * "don't delete it yet."
 *
 * Responsive via a container query (`@container`, native in this app's
 * Tailwind v4 — same pattern already used in ui/card.tsx), not a viewport
 * breakpoint: the 3-column layout only activates once THIS component
 * actually has ~1024px of real width to work with, regardless of the
 * page/card it ends up embedded in. Below that it stacks to a single
 * column (Design boxes, then BodyGraph, then Personality boxes, then a
 * compact 2x2 arrow grid) rather than cramming 3 columns into a narrow
 * card and crushing the BodyGraph — the exact failure mode she flagged.
 * Matters especially for the eventual reading-summary.tsx integration,
 * whose card is nowhere near 1024px wide; a viewport breakpoint would
 * have activated 3-column there anyway and broken exactly what she asked
 * to avoid.
 */

const FALLBACK = {
  personalityActivationColor: "#18181b",
  designActivationColor: "#9a3412",
  arrowColor: "#3f3f46",
  arrowStyle: "solid" as VariableArrowStyle,
  planetBoxColor: "#f4f4f5",
  planetBoxMode: "fullBox" as PlanetBoxMode,
  planetBoxBorderRadius: 6,
  backgroundColor: "#ffffff",
};

/**
 * Planet Boxes — real behavior confirmed 2026-08-10 against the live
 * Bodygraph chart-design tool ("Color Planets Only" / "Color Planets and
 * Gates"). iconOnly: the row itself stays genuinely unfilled (no
 * background at all, matching Bodygraph's own real rendering directly
 * observed, not a placeholder standing in for "no color set") — only the
 * small circular glyph chip gets the Personality/Design activation
 * color, label/value text stays a plain neutral ink. fullBox: the whole
 * row fills with the activation color itself (not planetBoxColor —
 * Bodygraph's own real "Planets and Gates" mode fills with their Design/
 * Personality colors too, not a separate arbitrary box color), text
 * reverses to white, and `planetBoxBorderRadius` rounds the corners
 * (no effect in iconOnly, which has no filled box to round).
 */
const PLAIN_TEXT = "#3f3f46"; // zinc-700 — same neutral ink already used for arrowColor's own default above

/**
 * Phase 4 correctness pass (2026-08-15) — this component's own
 * <HumanDesignChart> call was silently dropping `centersMode`/
 * `centerColors`, so a sub-account with "Enable Traditional Centers
 * Colors" turned on in Chart Designs rendered correctly in the Chart
 * Designs preview and in the exported PDF, but always fell back to flat
 * uniform mode here — on the actual practitioner Readings tab, the chart
 * this component exists to render. Mirrors the identical derivation
 * chart-designs-tab.tsx and reading-pdf-document.tsx already use.
 */
function centerColorsFromDesign(design: ChartDesign | null | undefined): Partial<Record<CenterKey, string>> | undefined {
  if (!design) return undefined;
  return {
    head: design.headCenterColor,
    ajna: design.ajnaCenterColor,
    throat: design.throatCenterColor,
    g: design.gCenterColor,
    heart: design.heartCenterColor,
    spleen: design.spleenCenterColor,
    sacral: design.sacralCenterColor,
    solarplexus: design.solarPlexusCenterColor,
    root: design.rootCenterColor,
  };
}

function ArrowGlyph({
  direction,
  color,
  style,
}: {
  direction: VariableArrowDirection;
  color: string;
  style: VariableArrowStyle;
}) {
  const points = direction === "Left" ? "9,1.5 9,10.5 1.5,6" : "1.5,1.5 1.5,10.5 9,6";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <polygon
        points={points}
        fill={style === "solid" ? color : "none"}
        stroke={color}
        strokeWidth={style === "outline" ? 1.1 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowBadge({
  label,
  source,
  value,
  color,
  style,
  align,
}: {
  label: string;
  source: string;
  value: VariableArrowSource | undefined;
  color: string;
  style: VariableArrowStyle;
  align: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {value ? (
        <ArrowGlyph direction={value.arrow} color={color} style={style} />
      ) : (
        <span className="inline-block h-3 w-3 shrink-0" />
      )}
      <div>
        <p className="font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </p>
        <p className="text-foreground/75">
          {source}
          {value ? ` · ${value.arrow}` : " · —"}
        </p>
      </div>
    </div>
  );
}

function PlanetBox({
  symbol,
  label,
  value,
  activationColor,
  boxColor,
  mode,
  borderRadius,
}: {
  symbol: string;
  label: string;
  value: string;
  activationColor: string;
  boxColor: string;
  mode: PlanetBoxMode;
  borderRadius: number;
}) {
  const hex = boxColor.replace("#", "");
  const rgb = hex.length === 6 ? [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) : null;
  const luminance = rgb ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : 0;
  const textColor = luminance > 0.62 ? "#18181b" : "#ffffff";

  if (mode === "fullBox") {
    return (
      <div
        className="flex items-center justify-between gap-2 border px-2.5 py-2 text-xs"
        style={{ backgroundColor: boxColor, borderColor: activationColor, color: textColor, borderRadius }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true">{symbol}</span>
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{value}</span>
      </div>
    );
  }
  // iconOnly — row stays genuinely unfilled; only the glyph gets a colored chip.
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs" style={{ color: PLAIN_TEXT }}>
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] leading-none text-white"
          style={{ backgroundColor: activationColor }}
        >
          {symbol}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ActivationColumn({
  side,
  activations,
  color,
  boxColor,
  mode,
  borderRadius,
  align,
}: {
  side: "Design" | "Personality";
  activations: HumanDesignProfile["design"] | HumanDesignProfile["personality"];
  color: string;
  boxColor: string;
  mode: PlanetBoxMode;
  borderRadius: number;
  align: "left" | "right";
}) {
  return (
    // pt-11 correction-pass-2, 2026-08-17: lines this column's own "DESIGN"/
    // "PERSONALITY" header up with roughly where the BodyGraph itself
    // visually starts (below the Variables cluster in the center column,
    // see its own comment) — real production screenshot showed both
    // columns starting at the grid's top edge while the chart started
    // noticeably lower, reading as two unrelated pieces instead of one
    // chart composition.
    <div className="space-y-2.5 pt-11">
      <p
        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${align === "right" ? "text-right" : ""}`}
        style={{ color }}
      >
        {side}
      </p>
      {HD_BODY_LABELS.map(({ body, label, symbol }) => {
        const a = activations.find((x) => x.body === body);
        return (
          <PlanetBox
            key={body}
            symbol={symbol}
            label={label}
            value={a ? `${a.gate}.${a.line}` : "—"}
            activationColor={color}
            boxColor={boxColor}
            mode={mode}
            borderRadius={borderRadius}
          />
        );
      })}
    </div>
  );
}

export function HumanDesignFullChart({
  profile,
  design,
  className,
}: {
  profile: HumanDesignProfile;
  /** The sub-account's Human Design Chart Design — falls back to the same defaults chart-design-service.ts seeds a fresh design with, so this always renders correctly even with no design saved yet. */
  design?: ChartDesign | null;
  className?: string;
}) {
  const personalityActivationColor = design?.personalityActivationColor || FALLBACK.personalityActivationColor;
  const designActivationColor = design?.designActivationColor || FALLBACK.designActivationColor;
  const arrowStyle = design?.arrowStyle || FALLBACK.arrowStyle;
  const arrowColor = design?.arrowColor || FALLBACK.arrowColor;
  const planetBoxColor = design?.planetBoxColor || FALLBACK.planetBoxColor;
  const planetBoxMode = design?.planetBoxMode || FALLBACK.planetBoxMode;
  // `??` not `||` — 0 is a real, legitimate "square corners" choice, not a missing value.
  const planetBoxBorderRadius = design?.planetBoxBorderRadius ?? FALLBACK.planetBoxBorderRadius;
  const backgroundColor = design?.backgroundColor || FALLBACK.backgroundColor;

  // Undefined on readings saved before 2026-08-10's arrow plumbing —
  // every ArrowBadge above already renders a real "—" placeholder rather
  // than breaking when a specific arrow is missing.
  const arrows = profile.variableArrows;

  return (
    <div
      className={`@container/hdfc rounded-2xl p-4 ${className ?? ""}`}
      style={{ backgroundColor }}
    >
      {/*
       * Compact full-chart geometry (2026-10, "Option B"). Measured before:
       * 260px rails | 480px center track holding a BodyGraph capped at 360px
       * | 260px rails, 24px gaps — 60px of dead space each side of the
       * BodyGraph and three columns only from 1,024px of inner width. Now:
       * 200px rails (a planet row needs ~140px, so full names never
       * truncate) | 360px center (exactly the BodyGraph + Variables) |
       * 200px rails, 16px gaps, three columns from 792px of inner width
       * (824px with this box's 16px padding — the Chart Design editor lays
       * the chart out at that natural width, CHART_PREVIEW_NATURAL_WIDTH).
       * Wider containers center the composition instead of stretching it.
       * Below 792px it stacks as before. The BodyGraph SVG itself
       * (human-design-chart.tsx) and the PDF layout are unchanged.
       */}
      <div className="grid grid-cols-1 gap-6 @min-[792px]/hdfc:grid-cols-[200px_360px_200px] @min-[792px]/hdfc:items-start @min-[792px]/hdfc:justify-center @min-[792px]/hdfc:gap-x-4">
        <ActivationColumn
          side="Design"
          activations={profile.design}
          color={designActivationColor}
          boxColor={planetBoxColor}
          mode={planetBoxMode}
          borderRadius={planetBoxBorderRadius}
          align="left"
        />

        <div className="mx-auto w-full max-w-[360px]">
          {/*
           * Correction-pass-2, 2026-08-17: the single flex-wrap row of 4
           * badges (her prior fix's own scoping to the chart's own
           * max-w-[640px] was correct — the real remaining problem was
           * the ROW shape itself) wrapped Motivation onto a second line
           * at normal widths, reading as loose header text instead of
           * chart-associated information. Real Bodygraph convention (her
           * reference screenshot): 2 badges stacked at the chart's upper-
           * left (its own Design-side arrows), 2 stacked upper-right
           * (Personality-side) — never a single row. Same real
           * calculated arrows/directions/colors as before, arranged as
           * two fixed 2-item stacks instead of 4 items that could wrap.
           */}
          <div className="mb-1 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <ArrowBadge label="Digestion" source="Design Sun" value={arrows?.digestion} color={arrowColor} style={arrowStyle} align="left" />
              <ArrowBadge label="Environment" source="Design Node" value={arrows?.environment} color={arrowColor} style={arrowStyle} align="left" />
            </div>
            <div className="space-y-1">
              <ArrowBadge label="Perspective" source="Personality Node" value={arrows?.perspective} color={arrowColor} style={arrowStyle} align="right" />
              <ArrowBadge label="Motivation" source="Personality Sun" value={arrows?.motivation} color={arrowColor} style={arrowStyle} align="right" />
            </div>
          </div>

          <HumanDesignChart
            profile={profile}
            className="w-full"
            definedColor={design?.chartDefinedColor}
            channelsColor={design?.channelsColor}
            gatesColor={design?.gatesColor}
            personalityColor={personalityActivationColor}
            designColor={designActivationColor}
            backgroundColor={backgroundColor}
            centersMode={design?.centersMode}
            centerColors={centerColorsFromDesign(design)}
          />
        </div>

        <ActivationColumn
          side="Personality"
          activations={profile.personality}
          color={personalityActivationColor}
          boxColor={planetBoxColor}
          mode={planetBoxMode}
          borderRadius={planetBoxBorderRadius}
          align="right"
        />
      </div>
    </div>
  );
}
