import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { VariableArrowDirection, VariableArrowSource } from "@/lib/energetics/human-design-variables";
import type { ChartDesign, VariableArrowStyle } from "@/types/chart-design";
import { HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
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
  backgroundColor: "#ffffff",
};

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
        <p className="text-muted-foreground/70">
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
  textColor,
  boxColor,
}: {
  symbol: string;
  label: string;
  value: string;
  textColor: string;
  boxColor: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px]"
      style={{ backgroundColor: boxColor, color: textColor }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true">{symbol}</span>
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
  align,
}: {
  side: "Design" | "Personality";
  activations: HumanDesignProfile["design"] | HumanDesignProfile["personality"];
  color: string;
  boxColor: string;
  align: "left" | "right";
}) {
  return (
    <div className="space-y-1">
      <p
        className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${align === "right" ? "text-right" : ""}`}
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
            textColor={color}
            boxColor={boxColor}
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
  const arrowColor = design?.arrowColor || FALLBACK.arrowColor;
  const arrowStyle = design?.arrowStyle || FALLBACK.arrowStyle;
  const planetBoxColor = design?.planetBoxColor || FALLBACK.planetBoxColor;
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
      <div className="hidden items-center justify-between gap-4 pb-2 @5xl/hdfc:flex">
        <ArrowBadge label="Digestion" source="Design Sun" value={arrows?.digestion} color={arrowColor} style={arrowStyle} align="left" />
        <ArrowBadge label="Motivation" source="Personality Sun" value={arrows?.motivation} color={arrowColor} style={arrowStyle} align="right" />
      </div>

      <div className="grid grid-cols-1 gap-4 @5xl/hdfc:grid-cols-[minmax(180px,240px)_minmax(320px,480px)_minmax(180px,240px)] @5xl/hdfc:items-start">
        <ActivationColumn side="Design" activations={profile.design} color={designActivationColor} boxColor={planetBoxColor} align="left" />

        <HumanDesignChart
          profile={profile}
          className="mx-auto w-full max-w-[420px]"
          definedColor={design?.chartDefinedColor}
          channelsColor={design?.channelsColor}
          gatesColor={design?.gatesColor}
          backgroundColor={backgroundColor}
        />

        <ActivationColumn side="Personality" activations={profile.personality} color={personalityActivationColor} boxColor={planetBoxColor} align="right" />
      </div>

      <div className="hidden items-center justify-between gap-4 pt-2 @5xl/hdfc:flex">
        <ArrowBadge label="Environment" source="Design Node" value={arrows?.environment} color={arrowColor} style={arrowStyle} align="left" />
        <ArrowBadge label="Perspective" source="Personality Node" value={arrows?.perspective} color={arrowColor} style={arrowStyle} align="right" />
      </div>

      {/* Below the 1024px container-query threshold, all 4 arrows collapse into one compact 2x2 grid under the stacked columns/chart, instead of the 2 split top/bottom rows above — same data, no crushing. */}
      <div className="grid grid-cols-2 gap-3 pt-3 @5xl/hdfc:hidden">
        <ArrowBadge label="Digestion" source="Design Sun" value={arrows?.digestion} color={arrowColor} style={arrowStyle} align="left" />
        <ArrowBadge label="Motivation" source="Personality Sun" value={arrows?.motivation} color={arrowColor} style={arrowStyle} align="right" />
        <ArrowBadge label="Environment" source="Design Node" value={arrows?.environment} color={arrowColor} style={arrowStyle} align="left" />
        <ArrowBadge label="Perspective" source="Personality Node" value={arrows?.perspective} color={arrowColor} style={arrowStyle} align="right" />
      </div>
    </div>
  );
}
