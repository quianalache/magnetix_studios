import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, CHANNELS, type CenterKey } from "@/lib/energetics/human-design-data";
import { CENTER_LAYOUT, GATE_POINT, type CenterLayout, type CenterShape } from "@/lib/energetics/human-design-chart-layout";

/**
 * The actual drawn bodygraph — "that's not a chart" (2026-08-08), then
 * corrected on color the same day per her real-chart knowledge: open/
 * undefined centers are traditionally white, defined centers a plain
 * light gray — NOT branded to the sub-account's accent color, since she
 * wants per-chart color choice to eventually be its own control, not
 * silently tied to the portal's brand accent. Shipped the traditional
 * black/white/gray base first; the real color picker (`definedColor`
 * below) is the fast-follow flagged that day, built as Phase 4 of the
 * Report Builder initiative (2026-08-09).
 *
 * The chart itself always renders on a fixed white surface regardless of
 * the app's own light/dark theme — same as every real chart tool (a
 * printed chart doesn't flip to dark mode), which is also what makes
 * "white means undefined" mean anything: a white center against a white
 * page reads as blank, exactly the traditional convention.
 *
 * Personality activations render black, Design activations render red —
 * the one universally standard convention across every real Human Design
 * chart, unrelated to the center-fill color question above. Only the
 * DEFINED-center fill is customizable — undefined stays white and
 * Personality/Design stay black/red no matter what a sub-account picks.
 */

const DEFAULT_DEFINED_FILL = "#d4d4d8"; // zinc-300 — light gray
const DEFINED_STROKE = "#52525b"; // zinc-600
const UNDEFINED_FILL = "#ffffff";
const UNDEFINED_STROKE = "#a1a1aa"; // zinc-400
const PERSONALITY_TEXT = "#18181b";
const DESIGN_TEXT = "#dc2626";

function shapePoints(shape: CenterShape, cx: number, cy: number, r: number): string {
  switch (shape) {
    case "triangle-up":
      return `${cx},${cy - 0.9 * r} ${cx - r},${cy + r} ${cx + r},${cy + r}`;
    case "triangle-down":
      return `${cx},${cy + 0.9 * r} ${cx - r},${cy - r} ${cx + r},${cy - r}`;
    case "triangle-left":
      return `${cx - 0.9 * r},${cy} ${cx + r},${cy - r} ${cx + r},${cy + r}`;
    case "triangle-right":
      return `${cx + 0.9 * r},${cy} ${cx - r},${cy - r} ${cx - r},${cy + r}`;
    case "triangle-heart":
      return `${cx},${cy - 0.9 * r} ${cx - r},${cy + 0.9 * r} ${cx + 1.1 * r},${cy + r}`;
    case "octagram": {
      const pts: string[] = [];
      for (let s = 0; s < 16; s++) {
        const angle = -Math.PI / 2 + (s * Math.PI) / 8;
        const radius = s % 2 === 0 ? r : 0.72 * r;
        pts.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
      }
      return pts.join(" ");
    }
    default:
      return "";
  }
}

function CenterShapeEl({
  layout,
  defined,
  definedColor,
}: {
  layout: CenterLayout;
  defined: boolean;
  definedColor: string;
}) {
  const commonProps = {
    fill: defined ? definedColor : UNDEFINED_FILL,
    stroke: defined ? DEFINED_STROKE : UNDEFINED_STROKE,
    strokeWidth: 0.5,
  };
  if (layout.shape === "square") {
    const r = layout.size;
    return (
      <rect
        x={layout.x - r}
        y={layout.y - r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.25}
        {...commonProps}
      />
    );
  }
  return <polygon points={shapePoints(layout.shape, layout.x, layout.y, layout.size)} {...commonProps} />;
}

export function HumanDesignChart({
  profile,
  className,
  definedColor = DEFAULT_DEFINED_FILL,
}: {
  profile: HumanDesignProfile;
  className?: string;
  /** Sub-account's chosen defined-center color (Chart design tab) — falls back to the traditional light gray when not set. */
  definedColor?: string;
}) {
  const definedSet = new Set(profile.definedCenters);
  const definedChannelKeys = new Set(profile.definedChannels.map((c) => c.key));
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));

  return (
    <div className={className} style={{ background: "#fff", borderRadius: 12, padding: "6% 4%" }}>
      <svg viewBox="-4 -3 108 102" role="img" aria-label="Human Design bodygraph">
        {/* All 36 possible channels, faint — the full network structure, real gate-to-gate geometry. */}
        {CHANNELS.map((ch) => {
          const a = GATE_POINT[ch.gates[0]];
          const b = GATE_POINT[ch.gates[1]];
          if (!a || !b) return null;
          const isDefined = definedChannelKeys.has(ch.key);
          return (
            <line
              key={ch.key}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={isDefined ? DEFINED_STROKE : DEFAULT_DEFINED_FILL}
              strokeWidth={isDefined ? 1.1 : 0.35}
              strokeOpacity={isDefined ? 0.9 : 0.7}
            />
          );
        })}

        {/* 9 centers */}
        {CENTERS.map((c) => (
          <CenterShapeEl key={c} layout={CENTER_LAYOUT[c]} defined={definedSet.has(c)} definedColor={definedColor} />
        ))}

        {/* Gate numbers — only the activated ones, to keep it readable. A soft
            dot behind each marks it as "on" at a glance before you even read
            the number; Personality black, Design red, offset slightly when both. */}
        {Object.entries(GATE_POINT).map(([gateStr, point]) => {
          const gate = Number(gateStr);
          const inPersonality = personalityGates.has(gate);
          const inDesign = designGates.has(gate);
          if (!inPersonality && !inDesign) return null;
          return (
            <g key={gate}>
              <circle cx={point.x} cy={point.y} r={1.7} fill="#fff" stroke="#e4e4e7" strokeWidth={0.2} />
              {inDesign && (
                <text
                  x={point.x + (inPersonality ? 0.9 : 0)}
                  y={point.y + (inPersonality ? 0.9 : 0) + 1}
                  fontSize="2.6"
                  fontWeight="700"
                  fill={DESIGN_TEXT}
                  textAnchor="middle"
                >
                  {gate}
                </text>
              )}
              {inPersonality && (
                <text
                  x={point.x - (inDesign ? 0.9 : 0)}
                  y={point.y - (inDesign ? 0.9 : 0) + 1}
                  fontSize="2.6"
                  fontWeight="700"
                  fill={PERSONALITY_TEXT}
                  textAnchor="middle"
                >
                  {gate}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
