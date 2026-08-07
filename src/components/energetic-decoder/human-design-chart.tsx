import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, CHANNELS, type CenterKey } from "@/lib/energetics/human-design-data";
import { CENTER_LAYOUT, GATE_POINT, type CenterLayout, type CenterShape } from "@/lib/energetics/human-design-chart-layout";

/**
 * The actual drawn bodygraph — "that's not a chart" (2026-08-08). Real
 * layout, real gate positions, real channel geometry (see
 * human-design-chart-layout.ts for sourcing). One deliberate, flagged
 * simplification: authentic Human Design software uses a different fill
 * color per center (9-color palette); this uses one accent color for
 * every DEFINED center instead, tied to the sub-account's own brand
 * accent rather than presenting a guessed 9-color palette as if it were
 * the authoritative one.
 *
 * Personality activations render dark/black, Design activations render
 * red — that split (not the per-center coloring) is the one universally
 * standard convention across every real Human Design chart, so it's the
 * one this keeps.
 */

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

function CenterShapeEl({ layout, defined, accent }: { layout: CenterLayout; defined: boolean; accent: string }) {
  const fill = defined ? accent : "var(--hd-center-empty, #e5e7eb)";
  const stroke = defined ? accent : "var(--hd-center-outline, #9ca3af)";
  const commonProps = {
    fill: defined ? fill : "none",
    stroke,
    strokeWidth: 0.5,
    fillOpacity: defined ? 0.85 : 1,
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
  accent = "#7c3aed",
  className,
}: {
  profile: HumanDesignProfile;
  accent?: string;
  className?: string;
}) {
  const definedSet = new Set(profile.definedCenters);
  const definedChannelKeys = new Set(profile.definedChannels.map((c) => c.key));
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));

  return (
    <svg viewBox="-4 -3 108 102" className={className} role="img" aria-label="Human Design bodygraph">
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
            stroke={isDefined ? accent : "var(--hd-channel-empty, #d1d5db)"}
            strokeWidth={isDefined ? 1.1 : 0.35}
            strokeOpacity={isDefined ? 0.9 : 0.6}
          />
        );
      })}

      {/* 9 centers */}
      {CENTERS.map((c) => (
        <CenterShapeEl key={c} layout={CENTER_LAYOUT[c]} defined={definedSet.has(c)} accent={accent} />
      ))}

      {/* Gate numbers — only the activated ones, to keep it readable. Personality dark, Design red, offset slightly when both. */}
      {Object.entries(GATE_POINT).map(([gateStr, point]) => {
        const gate = Number(gateStr);
        const inPersonality = personalityGates.has(gate);
        const inDesign = designGates.has(gate);
        if (!inPersonality && !inDesign) return null;
        return (
          <g key={gate}>
            {inDesign && (
              <text
                x={point.x + (inPersonality ? 0.9 : 0)}
                y={point.y + (inPersonality ? 0.9 : 0) + 1}
                fontSize="2.6"
                fontWeight="700"
                fill="#dc2626"
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
                fill="var(--hd-personality-text, #18181b)"
                textAnchor="middle"
              >
                {gate}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
