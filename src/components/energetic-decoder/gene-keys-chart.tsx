import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";

/**
 * The Frequency / Gene Keys visual chart — real, built 2026-08-10. Draws
 * purely from the already-calculated `spheres` array (gene-keys.ts's
 * calculateGeneKeysProfile) — no new math, no Bodygraph, nothing scraped
 * from a third party. Same "own SVG/React layout, drawn locally" precedent
 * mandala-chart.tsx already set for Human Design's Mandala.
 *
 * 2026-08-10 structure pass — verified against genekeys.com's own pages
 * (Pearl Sequence page, "How to Read Your Profile," the Venus Sequence
 * course intro, and its planetary-correlation docs), not a blog or
 * assumption:
 *
 *  - Activation Sequence (spheres.slice(0, 4), confirmed by gene-keys.ts's
 *    own `activationSequence` field): Life's Work -> Evolution -> Radiance
 *    -> Purpose. Unchanged.
 *  - Venus Sequence's 4 *exclusive* spheres, in order: Attraction -> IQ ->
 *    EQ -> SQ. Unchanged. (genekeys.com itself describes Venus as having
 *    "6 spheres" — but the first and last of those 6 are Purpose and
 *    Vocation, reused from the neighboring sequences, not new values; see
 *    the bridges below.)
 *  - Pearl Sequence, in genekeys.com's own stated order ("the Vocation,
 *    Culture, Brand and Pearl"): Vocation -> Culture -> Brand -> Pearl.
 *    Was Vocation/Brand/Culture/Pearl before this pass — an arbitrary
 *    array order, not a deliberate one; fixed at the source in
 *    gene-keys.ts so this chart, the text list, and any future consumer
 *    all inherit the same real order automatically.
 *  - Two real bridges, not invented for visual effect: Purpose is
 *    genekeys.com's own stated opening member of the Venus Sequence (same
 *    Design Earth value as Activation's Purpose, not recalculated), and
 *    Vocation/"Core Wound" is the shared closing member of Venus and
 *    opening member of Pearl (same Design Mars value). Drawn as dashed
 *    curves — visually distinct from the solid within-sequence pathway
 *    lines — so the chart reads as one continuous Golden Path rather than
 *    3 disconnected rows, without overstating a specific curve shape as
 *    "the" official one (genekeys.com doesn't publish exact bridge
 *    geometry, just the fact that these two spheres are shared).
 *
 * Colors are original picks for this app, not copied from genekeys.com or
 * any other tool: warm amber for Activation (the spark/core), muted rose
 * for Venus (relationships), the app's own established brand purple
 * (#5E2574, already used as the default wheelAccentColor elsewhere) for
 * Pearl.
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
// Wide enough to give the Purpose->Attraction and SQ->Vocation bridge
// curves real clearance between one row's sphere-name labels and the next
// row's sequence-title label — a tight gap (this used to be 8) made the
// bridge curves cut through that text. Not a value from any external
// source, just enough room for our own labels to stay clean.
const ROW_GAP = 22;
const ROW_TOP_PAD = 2;
const NODE_XS = [30, 80, 130, 180];
const NODE_R = 8;
const LINE_COLOR = "#d4d4d8";
const BRIDGE_COLOR = "#a1a1aa";
const NAME_COLOR = "#71717a";
const GATE_TEXT_COLOR = "#ffffff";

function rowTop(i: number): number {
  return ROW_TOP_PAD + i * (ROW_H + ROW_GAP);
}
function rowCenterY(i: number): number {
  return rowTop(i) + 20;
}

function GeneKeysRow({ label, color, spheres, top }: { label: string; color: string; spheres: GeneKeysSphereResult[]; top: number }) {
  const centerY = top + 20;
  return (
    <g>
      <text x={10} y={top + 7} fontSize={6} fontWeight={700} letterSpacing={0.4} fill={color}>
        {label.toUpperCase()}
      </text>

      {/* Within-sequence pathways — drawn first so the node circles paint over the overlapped ends, same layering convention CompleteChannelHalf/HangingGateStub already use elsewhere in this app. */}
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

/** A real Golden Path bridge (Purpose->Attraction or SQ->Vocation), not a within-sequence pathway — dashed and drawn as a smooth curve so it reads as structurally different from the solid chain lines, and so it visually clears both rows' label text rather than cutting a straight line through it. */
function GoldenPathBridge({ fromRow, toRow }: { fromRow: number; toRow: number }) {
  const x1 = NODE_XS[NODE_XS.length - 1];
  const y1 = rowCenterY(fromRow);
  const x2 = NODE_XS[0];
  const y2 = rowCenterY(toRow);
  const midY = (y1 + y2) / 2;
  return <path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} fill="none" stroke={BRIDGE_COLOR} strokeWidth={1} strokeDasharray="3 2.5" />;
}

export function GeneKeysChart({ spheres, className }: { spheres: GeneKeysSphereResult[]; className?: string }) {
  const rowsAll = SEQUENCES.map((seq, i) => ({ ...seq, index: i, spheres: spheres.slice(seq.start, seq.start + 4) }));
  const rows = rowsAll.filter((r) => r.spheres.length > 0);
  if (rows.length === 0) return null;

  // Measured off the last actually-rendered row's own real position
  // (rowTop uses each row's fixed SEQUENCES index, not its position within
  // the filtered `rows` array) rather than `rows.length`, so this stays
  // correct even if a row were ever skipped instead of being the last one.
  const height = rowTop(rows[rows.length - 1].index) + ROW_H + ROW_TOP_PAD;

  // Bridges only draw between rows that are both actually present and
  // adjacent in the real Golden Path (Activation->Venus via Purpose,
  // Venus->Pearl via Vocation) — guards a reading with a partial/missing
  // sphere set from drawing a bridge to a row that isn't there.
  const activationRow = rows.find((r) => r.key === "activation");
  const venusRow = rows.find((r) => r.key === "venus");
  const pearlRow = rows.find((r) => r.key === "pearl");

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${VIEW_W} ${height}`} role="img" aria-label="Frequency / Gene Keys Golden Path chart" className="w-full">
        {activationRow && venusRow && activationRow.spheres.length === 4 && (
          <GoldenPathBridge fromRow={activationRow.index} toRow={venusRow.index} />
        )}
        {venusRow && pearlRow && venusRow.spheres.length === 4 && <GoldenPathBridge fromRow={venusRow.index} toRow={pearlRow.index} />}
        {rows.map((r) => (
          <GeneKeysRow key={r.key} label={r.label} color={r.color} spheres={r.spheres} top={rowTop(r.index)} />
        ))}
      </svg>
    </div>
  );
}
