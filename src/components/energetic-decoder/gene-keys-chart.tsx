import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";

/**
 * The Frequency / Gene Keys visual chart — real, built 2026-08-10, first
 * visual counterpart to the existing text-only SphereList. Draws purely
 * from the already-calculated `spheres` array (gene-keys.ts's
 * calculateGeneKeysProfile) — no new math, no Bodygraph, nothing scraped
 * from a third party. Same "own SVG/React layout, drawn locally" precedent
 * mandala-chart.tsx already set for Human Design's Mandala.
 *
 * Grouping into 3 rows of 4 spheres:
 *  - The first 4 spheres (Life's Work, Evolution, Radiance, Purpose) are
 *    verifiably the real Activation Sequence — gene-keys.ts's own
 *    `GeneKeysProfile.activationSequence` is literally `spheres.slice(0, 4)`,
 *    not an assumption made here.
 *  - Spheres 5-8 (Attraction, IQ, EQ, SQ) and 9-12 (Vocation, Brand,
 *    Culture, Pearl) are the Venus and Pearl Sequences respectively — this
 *    is the well-documented, widely-consistent Gene Keys convention (each
 *    of the 3 Sequences is its own group of 4 spheres), not something
 *    pulled from any proprietary tool. Order within each row is kept
 *    exactly as gene-keys.ts already produces it — not reordered to match
 *    any external chart, so it can never drift from the text list above it.
 *  - Each row draws its 4 spheres as a straight connected chain (3 lines
 *    between 4 nodes) rather than a closed loop back to the first sphere —
 *    every Gene Keys source describes each Sequence as "4 Spheres, 3
 *    Pathways," i.e. a chain, not a cycle.
 *
 * Colors are original picks for this app, not copied from genekeys.com or
 * any other tool: warm amber for Activation (the spark/core), muted rose
 * for Venus (relationships), the app's own established brand purple
 * (#5E2574, already used as the default wheelAccentColor elsewhere) for
 * Pearl — a deliberate callback tying the chart to Magnetix's own palette,
 * not an arbitrary third color.
 *
 * viewBox-scaled and container-width-driven (no fixed pixel size) for the
 * same two reasons the BodyGraph/Mandala charts already are: real
 * responsiveness today, and a straightforward future port to react-pdf's
 * own Svg primitives (same technique reading-pdf-document.tsx already uses
 * for the BodyGraph and Mandala) whenever the Frequency PDF section is
 * built — not built in this pass.
 */

type SequenceKey = "activation" | "venus" | "pearl";

const SEQUENCES: { key: SequenceKey; label: string; color: string; start: number }[] = [
  { key: "activation", label: "Activation Sequence", color: "#b45309", start: 0 },
  { key: "venus", label: "Venus Sequence", color: "#9d3a63", start: 4 },
  { key: "pearl", label: "Pearl Sequence", color: "#5E2574", start: 8 },
];

const VIEW_W = 200;
const ROW_H = 38;
const ROW_GAP = 8;
const ROW_TOP_PAD = 2;
const NODE_XS = [30, 80, 130, 180];
const NODE_R = 8;
const LINE_COLOR = "#d4d4d8";
const NAME_COLOR = "#71717a";
const GATE_TEXT_COLOR = "#ffffff";

function rowTop(i: number): number {
  return ROW_TOP_PAD + i * (ROW_H + ROW_GAP);
}

function GeneKeysRow({ label, color, spheres, top }: { label: string; color: string; spheres: GeneKeysSphereResult[]; top: number }) {
  const centerY = top + 20;
  return (
    <g>
      <text x={10} y={top + 7} fontSize={6} fontWeight={700} letterSpacing={0.4} fill={color}>
        {label.toUpperCase()}
      </text>

      {/* Connecting pathways — drawn first so the node circles paint over the overlapped ends, same layering convention CompleteChannelHalf/HangingGateStub already use elsewhere in this app. */}
      {spheres.slice(1).map((s, i) => (
        <line
          key={`${s.sphere}-line`}
          x1={NODE_XS[i]}
          y1={centerY}
          x2={NODE_XS[i + 1]}
          y2={centerY}
          stroke={LINE_COLOR}
          strokeWidth={1}
        />
      ))}

      {spheres.map((s, i) => (
        <g key={s.sphere}>
          <circle cx={NODE_XS[i]} cy={centerY} r={NODE_R} fill={color} />
          <text x={NODE_XS[i]} y={centerY + 2.2} fontSize={6} fontWeight={700} textAnchor="middle" fill={GATE_TEXT_COLOR}>
            {s.gate}.{s.line}
          </text>
          <text x={NODE_XS[i]} y={centerY + NODE_R + 8} fontSize={5.5} textAnchor="middle" fill={NAME_COLOR}>
            {s.sphere}
          </text>
        </g>
      ))}
    </g>
  );
}

export function GeneKeysChart({ spheres, className }: { spheres: GeneKeysSphereResult[]; className?: string }) {
  const rows = SEQUENCES.map((seq) => ({ ...seq, spheres: spheres.slice(seq.start, seq.start + 4) })).filter(
    (r) => r.spheres.length > 0,
  );
  if (rows.length === 0) return null;

  const height = ROW_TOP_PAD + rows.length * ROW_H + (rows.length - 1) * ROW_GAP + ROW_TOP_PAD;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${VIEW_W} ${height}`} role="img" aria-label="Frequency / Gene Keys hologenetic profile chart" className="w-full">
        {rows.map((r, i) => (
          <GeneKeysRow key={r.key} label={r.label} color={r.color} spheres={r.spheres} top={rowTop(i)} />
        ))}
      </svg>
    </div>
  );
}
