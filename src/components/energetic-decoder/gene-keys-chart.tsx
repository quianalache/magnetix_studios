"use client";

import { useState } from "react";
import type { GeneKeysSphereName, GeneKeysSphereResult } from "@/lib/energetics/gene-keys";
import { PERSONALITY_FILL, DESIGN_FILL } from "@/lib/energetics/human-design-chart-constants";

/**
 * The Frequency / Gene Keys Hologenetic Profile chart — rebuilt 2026-08-15
 * (Phase 5 of the Bodygraph parity audit's revised roadmap). The prior
 * version (built 2026-08-10) drew the 3 sequences as 3 mostly-independent
 * horizontal rows with 2 dashed "bridge" lines between them — accurate as
 * far as it went, but the owner's own read was correct: it doesn't
 * communicate a real profile, just a longer list.
 *
 * OWNER DECISION (2026-08-15, this pass): Magnetix keeps its Gene Keys /
 * Hologenetic Profile system and its "Frequency" product name. This is NOT
 * a rebuild toward Bodygraph's Success Codex — no Success Codex naming
 * (Primary Genius, Leadership, Expansion, Permission, Rebirth, etc.)
 * appears anywhere below. This is a from-scratch Magnetix visualization of
 * Magnetix's own real Gene Keys data, laid out around the actual planetary
 * structure that already existed in gene-keys.ts's own calculation code —
 * not copied from Bodygraph, not copied from genekeys.com's own diagram
 * (which was not accessible to inspect and would be off-limits to copy
 * regardless).
 *
 * THE REAL STRUCTURE THIS DRAWS (derived directly from
 * calculateGeneKeysProfile, not invented): every one of the 12 spheres
 * reduces to one of 6 planetary bodies, at either the Personality (birth
 * moment) or Design (~88 solar days earlier) position — the exact same
 * Personality/Design duality the BodyGraph chart already draws, just
 * applied to Gene Keys' own smaller set of points instead of all 13 HD
 * activations:
 *
 *   Sun     — Life's Work (Pers) · Radiance (Design) · Brand (Pers, the
 *             EXACT same value as Life's Work — same longitude, confirmed
 *             in gene-keys.ts, not a rendering choice)
 *   Earth   — Evolution (Pers) · Purpose (Design)
 *   Venus   — IQ (Pers) · SQ (Design)
 *   Mars    — EQ (Pers) · Vocation (Design)
 *   Jupiter — Pearl (Pers) · Culture (Design)
 *   Moon    — Attraction (Design only — this system has no Personality
 *             Moon sphere)
 *
 * Drawn as 6 spokes around a center, Personality on the outer ring, Design
 * on the inner ring — then the 3 real sequences (Activation, Venus, Pearl,
 * same real order already verified against genekeys.com in the prior
 * build: Life's Work->Evolution->Radiance->Purpose,
 * Attraction->IQ->EQ->SQ, Vocation->Culture->Brand->Pearl) are drawn as 3
 * colored paths connecting their own 4 spheres across those spokes. Two
 * genuinely emergent, non-invented results of drawing it this way:
 *
 *   1. The Activation path visits only the Sun and Earth spokes (all 4 of
 *      its spheres are Sun/Earth positions) — it folds back on itself in
 *      an hourglass, not because that shape was chosen but because that's
 *      what the real data does.
 *   2. The Pearl path's 3rd stop (Brand) lands on the EXACT SAME physical
 *      node as the Activation path's 1st stop (Life's Work) — the one
 *      point in the whole diagram where two sequences share a real,
 *      identical activation, not just a spoke. That convergence is the
 *      clearest single "this is one interconnected profile, not three
 *      separate lists" moment on the chart, and it's load-bearing data,
 *      not decoration.
 *
 * Node color = Personality (#18181b) / Design (#9a3412) — the exact same
 * two constants human-design-chart.tsx already uses, so this chart reads
 * as visually related to the BodyGraph rather than an unrelated style.
 * Sequence identity lives in the PATH color instead (own original picks,
 * unchanged from the prior build: amber/rose/purple) — a node can't be
 * single-sequence-colored since the shared Sun/outer node genuinely
 * belongs to two sequences at once.
 */

const AXIS_ORDER: { body: PlanetAxis; label: string }[] = [
  { body: "earth", label: "Earth" },
  { body: "sun", label: "Sun" },
  { body: "jupiter", label: "Jupiter" },
  { body: "mars", label: "Mars" },
  { body: "venus", label: "Venus" },
  { body: "moon", label: "Moon" },
];

type PlanetAxis = "sun" | "earth" | "venus" | "mars" | "jupiter" | "moon";
type Ring = "personality" | "design";

const SPHERE_POSITION: Record<GeneKeysSphereName, { axis: PlanetAxis; ring: Ring }> = {
  "Life's Work": { axis: "sun", ring: "personality" },
  Brand: { axis: "sun", ring: "personality" }, // same physical node as Life's Work — see header note
  Radiance: { axis: "sun", ring: "design" },
  Evolution: { axis: "earth", ring: "personality" },
  Purpose: { axis: "earth", ring: "design" },
  IQ: { axis: "venus", ring: "personality" },
  SQ: { axis: "venus", ring: "design" },
  EQ: { axis: "mars", ring: "personality" },
  Vocation: { axis: "mars", ring: "design" },
  Culture: { axis: "jupiter", ring: "design" },
  Pearl: { axis: "jupiter", ring: "personality" },
  Attraction: { axis: "moon", ring: "design" },
};

type SequenceKey = "activation" | "venus" | "pearl";

const SEQUENCES: { key: SequenceKey; label: string; color: string; order: GeneKeysSphereName[] }[] = [
  { key: "activation", label: "Activation Sequence", color: "#b45309", order: ["Life's Work", "Evolution", "Radiance", "Purpose"] },
  { key: "venus", label: "Venus Sequence", color: "#9d3a63", order: ["Attraction", "IQ", "EQ", "SQ"] },
  { key: "pearl", label: "Pearl Sequence", color: "#5E2574", order: ["Vocation", "Culture", "Brand", "Pearl"] },
];

const VIEW = 340;
const CENTER = VIEW / 2;
const OUTER_R = 118;
const INNER_R = 66;
const NODE_R_OUTER = 12;
const NODE_R_INNER = 10;
const SPOKE_COLOR = "#e4e4e7";
const LABEL_COLOR = "#52525b";

function axisAngleRad(axisIndex: number): number {
  return ((-90 + axisIndex * 60) * Math.PI) / 180;
}

function axisIndexOf(body: PlanetAxis): number {
  return AXIS_ORDER.findIndex((a) => a.body === body);
}

function pointOn(radius: number, axisIndex: number): { x: number; y: number } {
  const a = axisAngleRad(axisIndex);
  return { x: CENTER + radius * Math.cos(a), y: CENTER + radius * Math.sin(a) };
}

function nodeKey(axis: PlanetAxis, ring: Ring): string {
  return `${axis}-${ring}`;
}

/** Text anchor + vertical nudge for a label sitting along a given spoke angle, so labels lean away from the center instead of centering blindly over the spoke line. */
function labelAnchor(axisIndex: number): { anchor: "start" | "middle" | "end"; dy: number } {
  const a = axisAngleRad(axisIndex);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
  const dy = sin > 0.35 ? 9 : sin < -0.35 ? -4 : 3;
  return { anchor, dy };
}

export function GeneKeysChart({
  spheres,
  className,
  personalityColor = PERSONALITY_FILL,
  designColor = DESIGN_FILL,
  sequenceColors,
}: {
  spheres: GeneKeysSphereResult[];
  className?: string;
  /** Chart Design override — falls back to the same Personality/Design colors the BodyGraph itself uses. */
  personalityColor?: string;
  designColor?: string;
  /** Chart Design override for the 3 sequence path colors, keyed by sequence. Falls back to this chart's own original amber/rose/purple picks. */
  sequenceColors?: Partial<Record<SequenceKey, string>>;
}) {
  const [hovered, setHovered] = useState<SequenceKey | null>(null);
  const bySphere = new Map(spheres.map((s) => [s.sphere, s]));
  if (spheres.length === 0) return null;

  // One rendered node per physical position — Life's Work and Brand collapse
  // onto the same sun/personality node (see header note); every other
  // sphere maps 1:1.
  const nodesByKey = new Map<string, { axis: PlanetAxis; ring: Ring; spheres: GeneKeysSphereResult[] }>();
  for (const s of spheres) {
    const pos = SPHERE_POSITION[s.sphere];
    if (!pos) continue;
    const key = nodeKey(pos.axis, pos.ring);
    const existing = nodesByKey.get(key);
    if (existing) existing.spheres.push(s);
    else nodesByKey.set(key, { axis: pos.axis, ring: pos.ring, spheres: [s] });
  }

  const seqColor = (key: SequenceKey, fallback: string) => sequenceColors?.[key] || fallback;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label="Frequency — Gene Keys Hologenetic Profile" className="w-full">
        {/* Spokes — faint background structure, purely positional, drawn first. */}
        {AXIS_ORDER.map((a, i) => {
          const outer = pointOn(OUTER_R, i);
          return <line key={a.body} x1={CENTER} y1={CENTER} x2={outer.x} y2={outer.y} stroke={SPOKE_COLOR} strokeWidth={1} />;
        })}
        {AXIS_ORDER.map((a, i) => {
          const inner = pointOn(INNER_R, i);
          return <circle key={`ring-${a.body}`} cx={inner.x} cy={inner.y} r={1.4} fill={SPOKE_COLOR} />;
        })}

        {/* The 3 sequence paths — drawn before the nodes so node circles paint cleanly over their ends, same layering convention used throughout this app's other charts. */}
        {SEQUENCES.map((seq) => {
          const pts = seq.order
            .map((name) => {
              const pos = SPHERE_POSITION[name];
              if (!pos || !bySphere.has(name)) return null;
              const r = pos.ring === "personality" ? OUTER_R : INNER_R;
              return pointOn(r, axisIndexOf(pos.axis));
            })
            .filter((p): p is { x: number; y: number } => p !== null);
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
          const isHovered = hovered === seq.key;
          const isDimmed = hovered !== null && !isHovered;
          return (
            <path
              key={seq.key}
              d={d}
              fill="none"
              stroke={seqColor(seq.key, seq.color)}
              strokeWidth={isHovered ? 3 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isDimmed ? 0.25 : 1}
              style={{ transition: "opacity 120ms ease, stroke-width 120ms ease" }}
              onMouseEnter={() => setHovered(seq.key)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {/* Nodes — one per physical position, Personality outer ring / Design inner ring, same color convention as the BodyGraph. */}
        {Array.from(nodesByKey.values()).map((node) => {
          const axisIndex = axisIndexOf(node.axis);
          const r = node.ring === "personality" ? OUTER_R : INNER_R;
          const nodeR = node.ring === "personality" ? NODE_R_OUTER : NODE_R_INNER;
          const pt = pointOn(r, axisIndex);
          const color = node.ring === "personality" ? personalityColor : designColor;
          const { anchor, dy } = labelAnchor(axisIndex);
          // Real bug caught 2026-08-15 rendering an actual PDF and looking
          // at it directly: Design-ring labels used to sit INSIDE their own
          // node (r - 17, toward the shared center), where all 6 axes
          // converge and the labels collided with the node circle and each
          // other. Both rings now offset outward from their own node
          // instead — Design's offset is smaller than Personality's so it
          // never reaches as far as the Personality ring on the same axis.
          const labelR = node.ring === "personality" ? r + 16 : r + 14;
          const labelPt = pointOn(labelR, axisIndex);
          const primary = node.spheres[0];
          const isNodeDimmed =
            hovered !== null &&
            !node.spheres.some((s) => SEQUENCES.find((seq) => seq.key === hovered)?.order.includes(s.sphere));

          return (
            <g key={nodeKey(node.axis, node.ring)} opacity={isNodeDimmed ? 0.35 : 1} style={{ transition: "opacity 120ms ease" }}>
              <circle cx={pt.x} cy={pt.y} r={nodeR} fill={color} stroke="#ffffff" strokeWidth={1.5} />
              <text x={pt.x} y={pt.y + 2.6} fontSize={7.5} fontWeight={700} textAnchor="middle" fill="#ffffff">
                {primary.gate}.{primary.line}
              </text>
              <text x={labelPt.x} y={labelPt.y + dy} fontSize={7.5} fontWeight={600} textAnchor={anchor} fill={LABEL_COLOR}>
                {/*
                 * Real bug caught 2026-08-15 rendering an actual PDF and
                 * looking at it directly: "Life's Work / Brand" (the one
                 * collapsed node with 2 sphere names, see the header
                 * comment) ran ~20 characters wide, well past the canvas
                 * edge at this node's diagonal angle. Showing only the
                 * primary sphere name fixes the clip without losing
                 * information — the collapsed node's own <title> below
                 * still names every sphere it represents, and the
                 * practitioner detail view (SphereList) always lists both
                 * in full regardless.
                 */}
                {primary.sphere}
              </text>
              {node.spheres.length > 1 && (
                <title>{node.spheres.map((s) => s.sphere).join(" / ")}</title>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend — sequence colors + Personality/Design, hoverable to match the chart's own hover-highlight. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
        {SEQUENCES.map((seq) => (
          <button
            key={seq.key}
            type="button"
            onMouseEnter={() => setHovered(seq.key)}
            onMouseLeave={() => setHovered(null)}
            className="flex items-center gap-1.5"
          >
            <span className="inline-block h-2 w-4 rounded-full" style={{ backgroundColor: seqColor(seq.key, seq.color) }} />
            {seq.label}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-border" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: personalityColor }} />
          Personality
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: designColor }} />
          Design
        </span>
      </div>
    </div>
  );
}
