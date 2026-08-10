import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { GATE_WHEEL_ORDER } from "@/lib/energetics/gate-data";

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
 * that's what's drawn, not invented quadrant names.
 *
 * Convention: gate 41 (index 0 of GATE_WHEEL_ORDER) starts at 12 o'clock,
 * proceeding clockwise — an explicit, consistent choice, not a claim that
 * this matches Bodygraph's own exact rotation (which isn't published).
 */

const CX = 50;
const CY = 50;
const RING_R = 44;
const TICK_OUTER = 44;
const TICK_INNER = 38;
const LABEL_R = 33;
const DOT_R = 26;
const GATE_ARC_DEG = 360 / 64;

function angleForGateIndex(i: number): number {
  // 12 o'clock = -90°, clockwise = increasing angle.
  return -90 + i * GATE_ARC_DEG;
}
function toXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

export function MandalaChart({
  profile,
  gateColor,
  backgroundColor,
  className,
}: {
  profile: HumanDesignProfile;
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

        {/* 4 quadrant dividers — "Quadrants 1-4," her real Bodygraph account's own verified naming (numbered, not named). */}
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
          const dotPos = toXY(angle + GATE_ARC_DEG / 2, DOT_R);
          return (
            <g key={gate}>
              <line x1={tickA.x} y1={tickA.y} x2={tickB.x} y2={tickB.y} stroke="#d4d4d8" strokeWidth={0.25} />
              <text x={labelPos.x} y={labelPos.y + 0.8} fontSize={1.8} textAnchor="middle" fill="#71717a">
                {gate}
              </text>
              {(inPersonality || inDesign) && (
                <circle
                  cx={dotPos.x}
                  cy={dotPos.y}
                  r={1.4}
                  fill={gateColor}
                  stroke={inDesign ? "#dc2626" : "#18181b"}
                  strokeWidth={0.35}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
