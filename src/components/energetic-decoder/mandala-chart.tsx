import type { HumanDesignProfile, HdActivation } from "@/lib/energetics/human-design";
import { HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
import { GATE_WHEEL_ORDER, WHEEL_START_LONGITUDE_DEG, SIGNS, type ZodiacSign } from "@/lib/energetics/gate-data";
import { PERSONALITY_FILL, DESIGN_FILL, INACTIVE_GATE_TEXT } from "@/lib/energetics/human-design-chart-constants";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import type { ChartDesign, CentersMode } from "@/types/chart-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";

/**
 * The Mandala chart — completed 2026-08-15 (Phase 6 of the Bodygraph
 * parity audit's revised roadmap). The 2026-08-09/10 version had only the
 * innermost skeleton: activation dots and 4 numbered quadrants, on a bare
 * 64-tick ring. This pass adds every layer the audit found missing —
 * zodiac ring, gate ring numbering (kept from before), planet glyphs,
 * Personality/Design distinction (kept), a line-position glyph inspired
 * by the I-Ching's 6-line hexagram structure, and a real embedded
 * BodyGraph at the center — using only data this app already calculates,
 * no second engine, no new astronomy.
 *
 * ZODIAC RING — real degrees, not decorative. Gate positions on this
 * chart come from `GATE_WHEEL_ORDER`, itself anchored at
 * `WHEEL_START_LONGITUDE_DEG` (302° raw tropical ecliptic longitude — see
 * gate-data.ts). The zodiac ring uses the exact same anchor: a real raw
 * ecliptic longitude `d` lands at SVG angle `-90 + ((d - WHEEL_START + 360)
 * % 360)`, which is the same formula the gate ring's own
 * `angleForGateIndex` reduces to when `d` sits exactly on a gate boundary
 * — the two rings are guaranteed to agree, not eyeballed into alignment.
 * Sign names/order come from `SIGNS` (astrology.ts) — same 12 signs, same
 * 0°-Aries convention that chart already uses; the 30°-per-sign boundary
 * math is a fixed, universal convention, not re-derived astronomy.
 *
 * HEXAGRAM / LINE GLYPH — deliberately NOT a reproduction of the
 * traditional King Wen yin/yang hexagram shape for each gate. That shape
 * exists and is public domain, but this build has no verified, authoritative
 * source for the full 64-hexagram line table to check it against, and
 * shipping 64 hand-typed traditional symbols with no way to verify them
 * against a live authoritative reference risked putting real errors in
 * front of clients — worse than a simpler, honest, 100%-accurate
 * alternative. What's drawn instead is real data, not decoration: for
 * each ACTIVATED gate, a small 6-tick vertical stack (the same "six
 * stacked lines" structure a hexagram has) with this profile's own real
 * activated line (1-6, already computed by longitudeToGateLine) picked
 * out — Personality lines black, Design lines rust, both marked if dual.
 *
 * PLANET GLYPHS — `HD_BODY_LABELS`' own symbol field (☉ ☽ ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇
 * ☊ ☋ ⊕), already used elsewhere in this app (human-design-full-chart.tsx's
 * activation columns) — not invented here, reused directly so the same
 * glyph always means the same body everywhere in this app.
 *
 * CENTER BODYGRAPH — the exact same `HumanDesignChart` component the
 * practitioner Readings tab and PDF use, composited via CSS absolute
 * positioning (not a second SVG coordinate system nested through
 * foreignObject — simpler, and avoids foreignObject's real cross-renderer
 * support gaps). Takes the sub-account's actual HD Traditional
 * `hdDesign` — same centersMode/centerColors props the Phase 4
 * correctness pass fixed on the main chart — so this embedded copy can't
 * silently reproduce that bug; there's only one place centersMode is
 * threaded through, not a second hand-copy.
 */

const VIEW = 200;
const CX = 100;
const CY = 100;

const ZODIAC_OUTER = 96;
const ZODIAC_INNER = 86;
const GATE_TICK_OUTER = 86;
const GATE_TICK_INNER = 78;
const GATE_LABEL_R = 71;
const LINE_GLYPH_R = 63;
const DOT_R = 53;
const PLANET_GLYPH_R = 44;
const QUADRANT_OUTER = 96;
const QUADRANT_INNER = 36;
const QUADRANT_LABEL_R = 100;
const CENTER_CHART_PCT = 40; // % of the container's width/height the embedded BodyGraph occupies

const GATE_ARC_DEG = 360 / 64;
const DOT_SIZE = 2.6;

function angleForGateIndex(i: number): number {
  return -90 + i * GATE_ARC_DEG;
}
/** Real raw ecliptic longitude -> this chart's SVG angle, anchored at the same WHEEL_START_LONGITUDE_DEG the gate ring uses — see header note. */
function angleForLongitude(rawLon: number): number {
  const wheelPos = ((rawLon - WHEEL_START_LONGITUDE_DEG) % 360 + 360) % 360;
  return -90 + wheelPos;
}
function toXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function ZodiacRing({ ringColor, textColor }: { ringColor: string; textColor: string }) {
  const segments = SIGNS.map((sign, i) => {
    const startLon = i * 30;
    const endLon = startLon + 30;
    const a0 = angleForLongitude(startLon);
    const a1 = angleForLongitude(endLon);
    const outerStart = toXY(a0, ZODIAC_OUTER);
    const outerEnd = toXY(a1, ZODIAC_OUTER);
    const innerEnd = toXY(a1, ZODIAC_INNER);
    const innerStart = toXY(a0, ZODIAC_INNER);
    const midA = angleForLongitude(startLon + 15);
    const labelPos = toXY(midA, (ZODIAC_OUTER + ZODIAC_INNER) / 2);
    const path = [
      `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
      `A ${ZODIAC_OUTER} ${ZODIAC_OUTER} 0 0 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
      `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
      `A ${ZODIAC_INNER} ${ZODIAC_INNER} 0 0 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
      "Z",
    ].join(" ");
    return (
      <g key={sign}>
        <path d={path} fill={i % 2 === 0 ? `${ringColor}22` : `${ringColor}0d`} stroke={`${ringColor}55`} strokeWidth={0.3} />
        <text
          x={labelPos.x}
          y={labelPos.y}
          fontSize={3.4}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          transform={`rotate(${midA + 90}, ${labelPos.x}, ${labelPos.y})`}
        >
          {signAbbrev(sign)}
        </text>
      </g>
    );
  });
  return <>{segments}</>;
}

function signAbbrev(sign: ZodiacSign): string {
  return sign.slice(0, 3).toUpperCase();
}

/** Small 6-tick vertical hexagram-inspired glyph for one activated gate — see header note on why this represents the real activated line, not the traditional King Wen shape. */
function LineGlyph({ cx, cy, personalityLine, designLine, angleDeg }: { cx: number; cy: number; personalityLine?: number; designLine?: number; angleDeg: number }) {
  const tickH = 1.1;
  const tickW = 5;
  const gap = 1.5;
  const totalH = 6 * tickH + 5 * (gap - tickH);
  const startY = cy - totalH / 2;
  return (
    <g transform={`rotate(${angleDeg + 90}, ${cx}, ${cy})`}>
      {[1, 2, 3, 4, 5, 6].map((line) => {
        // Line 1 at the bottom (traditional reading order), so line `line`
        // sits at index (6-line) counting down from the top of the stack.
        const y = startY + (6 - line) * gap;
        const isPersonality = personalityLine === line;
        const isDesign = designLine === line;
        let fill = "#d4d4d8";
        if (isPersonality && isDesign) fill = "url(#mandalaDualLine)";
        else if (isPersonality) fill = PERSONALITY_FILL;
        else if (isDesign) fill = DESIGN_FILL;
        return <rect key={line} x={cx - tickW / 2} y={y} width={tickW} height={tickH} rx={0.4} fill={fill} />;
      })}
    </g>
  );
}

export function MandalaChart({
  profile,
  gateColor,
  backgroundColor,
  className,
  zodiacColor = "#8b5cf6",
  gateRingColor = "#71717a",
  quadrantColor = "#71717a",
  personalityColor = PERSONALITY_FILL,
  designColor = DESIGN_FILL,
  hdDesign,
  showCenterChart = true,
}: {
  profile: HumanDesignProfile;
  /** Accent ring color around each activated gate's dot — same role as human-design-chart.tsx's `gatesColor`, not the Personality/Design fill itself (that's fixed, universal convention, see ActivationDot below). */
  gateColor: string;
  backgroundColor: string;
  className?: string;
  /** Chart Design overrides, all optional — falls back to this chart's own considered defaults, none copied from Bodygraph. */
  zodiacColor?: string;
  gateRingColor?: string;
  quadrantColor?: string;
  personalityColor?: string;
  designColor?: string;
  /** The sub-account's HD Traditional Chart Design — passed straight into the embedded center BodyGraph so it can't drift from the corrected (Phase 4) centersMode/centerColors behavior the main chart already uses. Center chart omitted entirely if this is absent, same "real field or absent" rule the rest of this app follows. */
  hdDesign?: ChartDesign | null;
  /** Lets a caller that already shows the full BodyGraph elsewhere on the same page (the Readings tab's own Traditional/Mandala switch) skip rendering a second one here — defaults to shown for every other consumer (PDF, Report Builder, public pages), which don't already have a BodyGraph on screen. */
  showCenterChart?: boolean;
}) {
  const personalityGates = new Set(profile.personality.map((a) => a.gate));
  const designGates = new Set(profile.design.map((a) => a.gate));
  const byGatePersonality = new Map<number, HdActivation>(profile.personality.map((a) => [a.gate, a]));
  const byGateDesign = new Map<number, HdActivation>(profile.design.map((a) => [a.gate, a]));
  const bodySymbol = new Map(HD_BODY_LABELS.map((b) => [b.body, b.symbol]));

  const centerColors: Partial<Record<CenterKey, string>> | undefined = hdDesign
    ? {
        head: hdDesign.headCenterColor,
        ajna: hdDesign.ajnaCenterColor,
        throat: hdDesign.throatCenterColor,
        g: hdDesign.gCenterColor,
        heart: hdDesign.heartCenterColor,
        spleen: hdDesign.spleenCenterColor,
        sacral: hdDesign.sacralCenterColor,
        solarplexus: hdDesign.solarPlexusCenterColor,
        root: hdDesign.rootCenterColor,
      }
    : undefined;

  return (
    <div className={className} style={{ background: backgroundColor, borderRadius: 12, padding: "4%", position: "relative" }}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label="Mandala chart">
        <defs>
          {/* Split-color fill for a line active in both Personality and Design — same convention the activation dot below already uses for a dual gate. */}
          <linearGradient id="mandalaDualLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={personalityColor} />
            <stop offset="50%" stopColor={personalityColor} />
            <stop offset="50%" stopColor={designColor} />
            <stop offset="100%" stopColor={designColor} />
          </linearGradient>
        </defs>

        <ZodiacRing ringColor={zodiacColor} textColor={zodiacColor} />

        <circle cx={CX} cy={CY} r={GATE_TICK_OUTER} fill="none" stroke={gateRingColor} strokeOpacity={0.5} strokeWidth={0.4} />
        <circle cx={CX} cy={CY} r={GATE_TICK_INNER} fill="none" stroke={gateRingColor} strokeOpacity={0.25} strokeWidth={0.3} />

        {/* 4 quadrant dividers — "Quadrants 1-4," her real Bodygraph account's own verified naming (numbered, not named). Untouched logic, extended to the new outer radius. */}
        {[0, 1, 2, 3].map((q) => {
          const angle = angleForGateIndex(q * 16);
          const outer = toXY(angle, QUADRANT_OUTER + 2);
          const inner = toXY(angle, QUADRANT_INNER);
          return <line key={q} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={quadrantColor} strokeWidth={0.6} />;
        })}
        {[0, 1, 2, 3].map((q) => {
          const midAngle = angleForGateIndex(q * 16 + 8);
          const pos = toXY(midAngle, QUADRANT_LABEL_R);
          return (
            <text key={q} x={pos.x} y={pos.y + 1} fontSize={4} fontWeight={700} textAnchor="middle" fill={quadrantColor}>
              {q + 1}
            </text>
          );
        })}

        {GATE_WHEEL_ORDER.map((gate, i) => {
          const angle = angleForGateIndex(i);
          const tickA = toXY(angle, GATE_TICK_OUTER);
          const tickB = toXY(angle, GATE_TICK_INNER);
          const labelPos = toXY(angle + GATE_ARC_DEG / 2, GATE_LABEL_R);
          const inPersonality = personalityGates.has(gate);
          const inDesign = designGates.has(gate);
          const activated = inPersonality || inDesign;
          const dotPos = toXY(angle + GATE_ARC_DEG / 2, DOT_R);
          const glyphPos = toXY(angle + GATE_ARC_DEG / 2, LINE_GLYPH_R);
          const planetPos = toXY(angle + GATE_ARC_DEG / 2, PLANET_GLYPH_R);
          const labelColor = activated ? (inDesign && !inPersonality ? designColor : personalityColor) : INACTIVE_GATE_TEXT;
          const pAct = byGatePersonality.get(gate);
          const dAct = byGateDesign.get(gate);

          return (
            <g key={gate}>
              <line x1={tickA.x} y1={tickA.y} x2={tickB.x} y2={tickB.y} stroke={gateRingColor} strokeOpacity={0.3} strokeWidth={0.25} />
              <text
                x={labelPos.x}
                y={labelPos.y + 0.8}
                fontSize={activated ? 3.1 : 2.6}
                fontWeight={activated ? 700 : 400}
                textAnchor="middle"
                fill={labelColor}
              >
                {gate}
              </text>

              {activated && (
                <LineGlyph
                  cx={glyphPos.x}
                  cy={glyphPos.y}
                  personalityLine={pAct?.line}
                  designLine={dAct?.line}
                  angleDeg={angle + GATE_ARC_DEG / 2}
                />
              )}

              {activated && (
                <ActivationDot
                  cx={dotPos.x}
                  cy={dotPos.y}
                  inPersonality={inPersonality}
                  inDesign={inDesign}
                  stroke={gateColor}
                  personalityColor={personalityColor}
                  designColor={designColor}
                />
              )}

              {/* Planet glyph(s) — the real body(ies) that activated this gate, reusing HD_BODY_LABELS' own symbols. Personality above, Design below when both are present, so a dual activation never collapses the two bodies into one illegible overlap. */}
              {pAct && (
                <text x={planetPos.x} y={planetPos.y - (dAct ? 1.6 : 0)} fontSize={4.2} textAnchor="middle" fill={personalityColor}>
                  {bodySymbol.get(pAct.body) ?? ""}
                </text>
              )}
              {dAct && (
                <text x={planetPos.x} y={planetPos.y + (pAct ? 4.4 : 1.6)} fontSize={4.2} textAnchor="middle" fill={designColor}>
                  {bodySymbol.get(dAct.body) ?? ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {showCenterChart && hdDesign !== null && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: `${CENTER_CHART_PCT}%`,
          }}
        >
          <HumanDesignChart
            profile={profile}
            definedColor={hdDesign?.chartDefinedColor}
            channelsColor={hdDesign?.channelsColor}
            gatesColor={hdDesign?.gatesColor}
            backgroundColor="transparent"
            centersMode={hdDesign?.centersMode as CentersMode | undefined}
            centerColors={centerColors}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One activated gate's dot. Personality-only solid black, Design-only
 * solid rust/brown, dual split down the middle (left half Personality,
 * right half Design) via two semicircle paths rather than a blended
 * color — same "never collapse dual to one color" principle already
 * established for the BodyGraph's own dual-gate markers and hanging-gate
 * stubs, adapted to a single small dot since there's no room here for
 * two fully offset circles. `stroke` is the sub-account's customizable
 * accent ring (the `gateColor` prop above) — same role `gatesColor`
 * plays around BodyGraph gate markers, not a brand choice for the fill
 * itself. Colors now take Chart Design overrides (personalityColor/
 * designColor) instead of the hardcoded PERSONALITY_FILL/DESIGN_FILL
 * constants directly — Phase 6 addition, part of expanding Mandala's
 * design controls.
 */
function ActivationDot({
  cx,
  cy,
  inPersonality,
  inDesign,
  stroke,
  personalityColor,
  designColor,
}: {
  cx: number;
  cy: number;
  inPersonality: boolean;
  inDesign: boolean;
  stroke: string;
  personalityColor: string;
  designColor: string;
}) {
  if (inPersonality && inDesign) {
    return (
      <>
        <path d={`M ${cx} ${cy - DOT_SIZE} A ${DOT_SIZE} ${DOT_SIZE} 0 0 0 ${cx} ${cy + DOT_SIZE} Z`} fill={personalityColor} stroke={stroke} strokeWidth={0.3} />
        <path d={`M ${cx} ${cy - DOT_SIZE} A ${DOT_SIZE} ${DOT_SIZE} 0 0 1 ${cx} ${cy + DOT_SIZE} Z`} fill={designColor} stroke={stroke} strokeWidth={0.3} />
      </>
    );
  }
  return <circle cx={cx} cy={cy} r={DOT_SIZE} fill={inPersonality ? personalityColor : designColor} stroke={stroke} strokeWidth={0.3} />;
}
