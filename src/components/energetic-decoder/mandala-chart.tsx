import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { GATE_WHEEL_ORDER } from "@/lib/energetics/gate-data";
import { PERSONALITY_FILL, DESIGN_FILL, INACTIVE_GATE_TEXT } from "@/lib/energetics/human-design-chart-constants";

/**
 * The Mandala chart — real, built 2026-08-09. Previously flagged as a
 * genuine gap (Bodygraph's API doesn't expose it, no way around that), but
 * the underlying data was always free and already verified: the same
 * `GATE_WHEEL_ORDER` this app's gate-line calculation already depends on
 * (independently cross-checked against a second open-source engine, see
 * gate-data.ts) is exactly what a Mandala needs — the 64 gates laid out in
 * their real zodiacal order around a circle, split into 4 quadrants. Her
 * own real Bodygraph account's Chart Content tool confirmed the only
 * actual content here is "Quadrants 1/2/3/4" (numbered, not named) —
 * that's what's drawn, not invented quadrant names. Quadrant divider/
 * number logic and the underlying activation math (personalityGates/
 * designGates, straight from profile.personality/profile.design) are both
 * untouched by the 2026-08-10 visual pass below — same real geometry,
 * same real data, only how it's drawn changed.
 *
 * Convention: gate 41 (index 0 of GATE_WHEEL_ORDER) starts at 12 o'clock,
 * proceeding clockwise — an explicit, consistent choice, not a claim that
 * this matches Bodygraph's own exact rotation (which isn't published).
 *
 * 2026-08-10 visual pass — real gap found comparing against the live
 * Bodygraph reference and the already-fixed BodyGraph dual-activation
 * bug: a gate active in BOTH Personality and Design collapsed to a
 * single Design-colored dot (`stroke={inDesign ? ... : ...}` checked
 * inDesign first, silently dropping the Personality signal whenever both
 * were true) — the exact same "dual activation invisible" problem
 * already caught and fixed on the BodyGraph. Fixed the same way in
 * spirit, adapted to this chart's much smaller per-gate real estate (64
 * tightly-packed dots around one ring, not 9 spread-out centers): instead
 * of two offset circles (no room for that here), a dual gate gets one
 * dot split down the middle, Personality half solid black (left),
 * Design half solid rust/brown (right) — same PERSONALITY_FILL/
 * DESIGN_FILL colors the BodyGraph already established, reused directly
 * via human-design-chart-constants.ts so the two charts read as the same
 * visual language and can't drift apart from hand-copied hex values.
 *
 * Gate-number legibility: previously every one of the 64 numbers,
 * activated or not, rendered in the same small faint gray regardless of
 * activation — real gap, since at typical report/card display sizes
 * (a 100-unit viewBox scaled down to ~300-400px) that gray text reads as
 * a blur and gives no at-a-glance sense of which gates are actually
 * activated without hunting for the small dots. Activated gate numbers
 * now render bold and colored (matching their dot's Personality/Design
 * fill), inactive numbers stay the same subtle gray convention the
 * BodyGraph already uses (INACTIVE_GATE_TEXT) — same activated-vs-
 * inactive visual hierarchy as the BodyGraph, applied here for the first
 * time. Dot size increased slightly (1.4 -> 1.7) for the same real-size
 * legibility reason, verified by rendering at real report width, not
 * assumed from the raw numbers.
 */

const CX = 50;
const CY = 50;
const RING_R = 44;
const TICK_OUTER = 44;
const TICK_INNER = 38;
const LABEL_R = 33;
const DOT_R = 26;
const GATE_ARC_DEG = 360 / 64;
const DOT_SIZE = 1.7;

function angleForGateIndex(i: number): number {
  // 12 o'clock = -90°, clockwise = increasing angle.
  return -90 + i * GATE_ARC_DEG;
}
function toXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

/**
 * One activated gate's dot. Personality-only solid black, Design-only
 * solid rust/brown, dual split down the middle (left half Personality,
 * right half Design) via two semicircle paths rather than a blended
 * color — same "never collapse dual to one color" principle already
 * established for the BodyGraph's own dual-gate markers and hanging-gate
 * stubs, adapted to a single small dot since there's no room here for
 * two fully offset circles. `stroke` is the sub-account's customizable
 * accent ring (the `gateColor` prop below) — same role `gatesColor`
 * plays around BodyGraph gate markers, not a brand choice for the fill
 * itself.
 */
function ActivationDot({
  cx,
  cy,
  inPersonality,
  inDesign,
  stroke,
}: {
  cx: number;
  cy: number;
  inPersonality: boolean;
  inDesign: boolean;
  stroke: string;
}) {
  if (inPersonality && inDesign) {
    return (
      <>
        <path d={`M ${cx} ${cy - DOT_SIZE} A ${DOT_SIZE} ${DOT_SIZE} 0 0 0 ${cx} ${cy + DOT_SIZE} Z`} fill={PERSONALITY_FILL} stroke={stroke} strokeWidth={0.3} />
        <path d={`M ${cx} ${cy - DOT_SIZE} A ${DOT_SIZE} ${DOT_SIZE} 0 0 1 ${cx} ${cy + DOT_SIZE} Z`} fill={DESIGN_FILL} stroke={stroke} strokeWidth={0.3} />
      </>
    );
  }
  return <circle cx={cx} cy={cy} r={DOT_SIZE} fill={inPersonality ? PERSONALITY_FILL : DESIGN_FILL} stroke={stroke} strokeWidth={0.3} />;
}

export function MandalaChart({
  profile,
  gateColor,
  backgroundColor,
  className,
}: {
  profile: HumanDesignProfile;
  /** Accent ring color around each activated gate's dot — same role as human-design-chart.tsx's `gatesColor`, not the Personality/Design fill itself (that's fixed, universal convention, see ActivationDot above). */
  gateColor: string;
  backgroundColor: string;
  className?: string;
}) {
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));

  return (
    <div className={className} style={{ background: backgroundColor, borderRadius: 12, padding: "5%" }}>
      <svg viewBox="0 0 100 100" role="img" aria-label="Mandala chart">
        <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="#a1a1aa" strokeWidth={0.4} />
        <circle cx={CX} cy={CY} r={TICK_INNER} fill="none" stroke="#e4e4e7" strokeWidth={0.3} />

        {/* 4 quadrant dividers — "Quadrants 1-4," her real Bodygraph account's own verified naming (numbered, not named). Untouched. */}
        {[0, 1, 2, 3].map((q) => {
          const angle = angleForGateIndex(q * 16);
          const outer = toXY(angle, RING_R + 2);
          const inner = toXY(angle, TICK_INNER - 6);
          return <line key={q} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#71717a" strokeWidth={0.6} />;
        })}
        {[0, 1, 2, 3].map((q) => {
          const midAngle = angleForGateIndex(q * 16 + 8);
          const pos = toXY(midAngle, RING_R + 5);
          return (
            <text key={q} x={pos.x} y={pos.y + 1} fontSize={2.6} fontWeight={700} textAnchor="middle" fill="#71717a">
              {q + 1}
            </text>
          );
        })}

        {GATE_WHEEL_ORDER.map((gate, i) => {
          const angle = angleForGateIndex(i);
          const tickA = toXY(angle, TICK_OUTER);
          const tickB = toXY(angle, TICK_INNER);
          const labelPos = toXY(angle + GATE_ARC_DEG / 2, LABEL_R);
          const inPersonality = personalityGates.has(gate);
          const inDesign = designGates.has(gate);
          const activated = inPersonality || inDesign;
          const dotPos = toXY(angle + GATE_ARC_DEG / 2, DOT_R);
          const labelColor = activated ? (inDesign && !inPersonality ? DESIGN_FILL : PERSONALITY_FILL) : INACTIVE_GATE_TEXT;
          return (
            <g key={gate}>
              <line x1={tickA.x} y1={tickA.y} x2={tickB.x} y2={tickB.y} stroke="#d4d4d8" strokeWidth={0.25} />
              <text
                x={labelPos.x}
                y={labelPos.y + 0.8}
                fontSize={activated ? 2.2 : 2}
                fontWeight={activated ? 700 : 400}
                textAnchor="middle"
                fill={labelColor}
              >
                {gate}
              </text>
              {activated && <ActivationDot cx={dotPos.x} cy={dotPos.y} inPersonality={inPersonality} inDesign={inDesign} stroke={gateColor} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
