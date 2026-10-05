import type { CSSProperties } from "react";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { VariableArrowDirection, VariableArrowSource } from "@/lib/energetics/human-design-variables";
import type { ChartDesign, PlanetBoxMode, VariableArrowStyle } from "@/types/chart-design";
import { HD_BODY_LABELS, type CenterKey } from "@/lib/energetics/human-design-data";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { HD_FILL, humanDesignFillGeometry } from "@/lib/energetics/chart-design-preview-fit";

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
        className="flex items-center justify-between gap-2 border px-2 py-2 text-xs"
        style={{ backgroundColor: boxColor, borderColor: activationColor, color: textColor, borderRadius }}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true">{symbol}</span>
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{value}</span>
      </div>
    );
  }
  // iconOnly — row stays genuinely unfilled; only the glyph gets a colored chip.
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs" style={{ color: PLAIN_TEXT }}>
      <span className="flex min-w-0 items-center gap-1.5">
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
  rowGap,
}: {
  side: "Design" | "Personality";
  activations: HumanDesignProfile["design"] | HumanDesignProfile["personality"];
  color: string;
  boxColor: string;
  mode: PlanetBoxMode;
  borderRadius: number;
  align: "left" | "right";
  /** Fill layout only: rows start at the top and spread evenly with this gap (see humanDesignFillGeometry). */
  rowGap?: number;
}) {
  const fill = rowGap !== undefined;
  return (
    // pt-11 correction-pass-2, 2026-08-17: lines this column's own "DESIGN"/
    // "PERSONALITY" header up with roughly where the BodyGraph itself
    // visually starts (below the Variables cluster in the center column,
    // see its own comment) — real production screenshot showed both
    // columns starting at the grid's top edge while the chart started
    // noticeably lower, reading as two unrelated pieces instead of one
    // chart composition.
    // (Not in the fill layout, where the Variables sit beside the head and the rails start at the top.)
    <div data-hd-rail className={fill ? "flex flex-col" : "space-y-2.5 pt-11"} style={fill ? { rowGap } : undefined}>
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
  fill,
}: {
  profile: HumanDesignProfile;
  /**
   * Chart Design editor only: lay the chart out to fill a canvas of this
   * height at the given (container) width, unscaled — rails at their fixed
   * readable size, the BodyGraph sized independently from the space left in
   * the center column, the Variables beside the head. Every other consumer
   * (Readings, public report/decoder, stacked layouts) omits it.
   */
  fill?: { height: number };
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

  const variablesLeft = (
    <div className="space-y-1">
      <ArrowBadge label="Digestion" source="Design Sun" value={arrows?.digestion} color={arrowColor} style={arrowStyle} align="left" />
      <ArrowBadge label="Environment" source="Design Node" value={arrows?.environment} color={arrowColor} style={arrowStyle} align="left" />
    </div>
  );
  const variablesRight = (
    <div className="space-y-1">
      <ArrowBadge label="Perspective" source="Personality Node" value={arrows?.perspective} color={arrowColor} style={arrowStyle} align="right" />
      <ArrowBadge label="Motivation" source="Personality Sun" value={arrows?.motivation} color={arrowColor} style={arrowStyle} align="right" />
    </div>
  );
  const bodygraph = (className: string) => (
    <HumanDesignChart
      profile={profile}
      className={className}
      definedColor={design?.chartDefinedColor}
      channelsColor={design?.channelsColor}
      gatesColor={design?.gatesColor}
      personalityColor={personalityActivationColor}
      designColor={designActivationColor}
      backgroundColor={backgroundColor}
      centersMode={design?.centersMode}
      centerColors={centerColorsFromDesign(design)}
    />
  );
  const rail = (side: "Design" | "Personality", rowGap?: number) => (
    <ActivationColumn
      side={side}
      activations={side === "Design" ? profile.design : profile.personality}
      color={side === "Design" ? designActivationColor : personalityActivationColor}
      boxColor={planetBoxColor}
      mode={planetBoxMode}
      borderRadius={planetBoxBorderRadius}
      align={side === "Design" ? "left" : "right"}
      rowGap={rowGap}
    />
  );

  if (fill) {
    const geometry = humanDesignFillGeometry(fill.height);
    return (
      /*
       * Decoupled fill layout (2026-10): [Design rail | BodyGraph | Personality
       * rail] across the whole canvas, nothing scaled. The rails stay 170px
       * with 12px text; the BodyGraph column is a size container and the
       * BodyGraph takes the largest 200:320 box whose drawing fits it (its
       * blank viewBox margin may overhang into the padding/gaps), top-aligned
       * so the four Variables sit in the empty space either side of the head (the head spans ~39–61% of the
       * BodyGraph's width). The SVG's own 6%/4% inner padding is dropped
       * here (p-0!) — the canvas padding already frames it.
       */
      <div
        data-hd-fill
        className={`rounded-2xl ${className ?? ""}`}
        style={{ backgroundColor, height: geometry.height, padding: HD_FILL.padding }}
      >
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `${HD_FILL.railWidth}px minmax(0,1fr) ${HD_FILL.railWidth}px`,
            columnGap: HD_FILL.columnGap,
          }}
        >
          {rail("Design", geometry.railRowGap)}
          <div data-hd-center className="relative min-h-0 min-w-0" style={{ containerType: "size" }}>
            <div
              data-hd-bodygraph
              className="relative [&_svg]:block"
              style={
                {
                  // Largest 200:320 box whose DRAWING fits the column; only the SVG's blank viewBox margin overhangs it.
                  "--hd-bg-w": `min(calc(100cqw / ${1 - 2 * HD_FILL.bleedX}), calc(100cqh / ${1 - HD_FILL.bleedTop - HD_FILL.bleedBottom} * ${HD_FILL.bodygraphAspect}))`,
                  width: "var(--hd-bg-w)",
                  marginLeft: "calc((100cqw - var(--hd-bg-w)) / 2)",
                  marginTop: `calc(var(--hd-bg-w) * ${-HD_FILL.bleedTop / HD_FILL.bodygraphAspect})`,
                } as CSSProperties
              }
            >
              {/* The Variables in the BodyGraph's own top corners, either side of the head (it spans ~39–61% of the width). */}
              <div
                data-hd-variables
                className="absolute z-10 flex items-start justify-between gap-4"
                style={{ top: `${HD_FILL.bleedTop * 100}%`, left: `${HD_FILL.bleedX * 100}%`, right: `${HD_FILL.bleedX * 100}%` }}
              >
                {variablesLeft}
                {variablesRight}
              </div>
              {bodygraph("w-full p-0!")}
            </div>
          </div>
          {rail("Personality", geometry.railRowGap)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`@container/hdfc rounded-2xl p-4 ${className ?? ""}`}
      style={{ backgroundColor }}
    >
      {/*
       * Compact full-chart geometry (2026-10). Option B took the layout from
       * 260 | 480 (BodyGraph capped at 360) | 260 with 24px gaps to
       * 200 | 360 | 200 with 16px gaps. This pass gives more of the width to
       * the BodyGraph itself, so the gate numbers inside the centers read
       * larger: 170px rails (a planet row needs ~135px with 8px side
       * padding, so full names never truncate) | 440px center (BodyGraph +
       * Variables) | 170px rails, 12px gaps, centered; three columns from
       * 804px of inner width (836px with this box's 16px padding). Used by
       * Readings and the public report/decoder; the Chart Design editor
       * uses the fill layout above when its preview is wide enough, and
       * otherwise scales this layout from CHART_PREVIEW_NATURAL_WIDTH.
       * Stacked (narrow) layouts keep the BodyGraph's 360px cap. The
       * BodyGraph SVG itself (human-design-chart.tsx) and the PDF layout
       * are unchanged.
       */}
      <div className="grid grid-cols-1 gap-6 @min-[804px]/hdfc:grid-cols-[170px_440px_170px] @min-[804px]/hdfc:items-start @min-[804px]/hdfc:justify-center @min-[804px]/hdfc:gap-x-3">
        {rail("Design")}

        <div className="mx-auto w-full max-w-[360px] @min-[804px]/hdfc:max-w-[440px]">
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
          <div data-hd-variables className="mb-1 flex items-start justify-between gap-4">
            {variablesLeft}
            {variablesRight}
          </div>

          {bodygraph("w-full")}
        </div>

        {rail("Personality")}
      </div>
    </div>
  );
}
