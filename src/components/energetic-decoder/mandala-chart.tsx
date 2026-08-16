import type { HumanDesignProfile, HdActivation } from "@/lib/energetics/human-design";
import { HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
import { GATE_WHEEL_ORDER, WHEEL_START_LONGITUDE_DEG, SIGNS, type ZodiacSign } from "@/lib/energetics/gate-data";
import { PERSONALITY_FILL, DESIGN_FILL, INACTIVE_GATE_TEXT } from "@/lib/energetics/human-design-chart-constants";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import type { ChartDesign, CentersMode } from "@/types/chart-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";

/**
 * The Mandala chart — visual composition rebuild, 2026-08-16, against a
 * direct side-by-side study of a real Bodygraph Mandala screenshot (not
 * the written audit alone). The 2026-08-15 version had every required
 * data layer but read as independent rings of tiny dots/glyphs on an
 * almost-white field, with a small center BodyGraph floating in a large
 * dead zone. Same data, same calculations, same props — this pass is
 * pure visual composition:
 *
 *  - Color is now structural, not decorative: the quadrant band, zodiac
 *    band, and every activated gate sector get real, bold fills derived
 *    from the sub-account's own configured Chart Design colors
 *    (deriveShade() below rotates hue/lightness off ONE configured
 *    color per band type — never a hardcoded second palette, never
 *    Bodygraph's actual hues).
 *  - Each of the 64 gates is a real radial wedge (GATE_SECTOR_OUTER to
 *    GATE_SECTOR_INNER), not a tick + a floating dot. An activated
 *    gate's wedge is filled with Personality/Design color (split down
 *    the wedge's own angular center when both are active); its gate
 *    number, line-glyph, and planet glyph all render INSIDE that same
 *    wedge instead of on 3 separate concentric "ghost rings."
 *  - GATE_SECTOR_INNER is pulled in much closer to center, and the
 *    embedded BodyGraph is rendered far larger (CENTER_CHART_PCT), so
 *    the two structures visually converge instead of leaving a dead
 *    gap between them.
 *
 * ZODIAC RING — unchanged math, still real degrees: gate positions come
 * from `GATE_WHEEL_ORDER`, anchored at `WHEEL_START_LONGITUDE_DEG` (see
 * gate-data.ts); the zodiac ring uses the same anchor via
 * `angleForLongitude` so the two rings are guaranteed to agree.
 *
 * HEXAGRAM / LINE GLYPH — still deliberately NOT the traditional King
 * Wen yin/yang shape (no verified authoritative 64-row source to check
 * hand-typed symbols against — see the original 2026-08-15 note this
 * carries forward). Still a real 6-tick stack showing this profile's own
 * activated line, now rendered in white against the wedge's own color
 * instead of a second color layered on top of it.
 *
 * PLANET GLYPHS — still `HD_BODY_LABELS`' own symbol field, reused as-is.
 *
 * CENTER BODYGRAPH — still the exact same `HumanDesignChart` component
 * the Readings tab and PDF use, same hdDesign/centersMode threading (the
 * Phase 4 correctness fix). Only its rendered size changed.
 *
 * Not copied from Bodygraph: its specific palette, its badge/number
 * styling, any proprietary decorative artwork. What's studied and
 * reproduced is the INFORMATION HIERARCHY (band → band → sector →
 * center) and the principle that color should carry real meaning.
 */

// ---- Color utilities — derive a small, related palette from ONE
// configured hex color per band type, so "use bold color" doesn't mean
// "hardcode a second palette." Pure, no dependencies. ----

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [113, 113, 122]; // neutral gray fallback for an unparsable value
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}
/** One configured accent -> a related shade (hue rotation + lightness/saturation nudge). Offset 0/0/0 returns the color unchanged. */
function deriveShade(hex: string, hueOffsetDeg: number, lightnessDelta = 0, saturationDelta = 0): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const h2 = (h + hueOffsetDeg + 360) % 360;
  const s2 = Math.min(1, Math.max(0.18, s + saturationDelta));
  const l2 = Math.min(0.86, Math.max(0.14, l + lightnessDelta));
  return rgbToHex(...hslToRgb(h2, s2, l2));
}
/** Perceived luminance (ITU-R BT.601) — decides white vs. dark ink for legible text on a given fill. */
function isDarkFill(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}

const VIEW = 200;
const CX = 100;
const CY = 100;

const QUADRANT_OUTER = 98;
const QUADRANT_INNER = 89;
const QUADRANT_LABEL_R = (QUADRANT_OUTER + QUADRANT_INNER) / 2;

const ZODIAC_OUTER = 89;
const ZODIAC_INNER = 73;

const GATE_SECTOR_OUTER = 73;
const GATE_SECTOR_INNER = 23;
const GATE_LABEL_R = 68.5;
const LINE_GLYPH_R = 52;
const PLANET_GLYPH_R = 32;

/**
 * % of the container's width/height the embedded BodyGraph occupies.
 * Real bug caught 2026-08-16 rendering an actual PDF and looking at it
 * directly, twice: 66% still left a visible dead ring (the BodyGraph's
 * bounding box being large isn't enough — its real glyph content only
 * fills roughly a third to a half of whatever box it's given); 92%
 * overcorrected into overlapping the gate-number rows. 80% is the
 * settled middle, verified by regenerating and re-inspecting the PDF a
 * third time — real glyph content reaches close to GATE_SECTOR_INNER
 * without crossing into the gate labels.
 */
const CENTER_CHART_PCT = 80;

const GATE_ARC_DEG = 360 / 64;

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
/** One angular band (a0->a1) as a filled ring wedge — shared by the quadrant band, zodiac band, and every gate sector. */
function bandPath(a0: number, a1: number, rOuter: number, rInner: number): string {
  const o0 = toXY(a0, rOuter);
  const o1 = toXY(a1, rOuter);
  const i1 = toXY(a1, rInner);
  const i0 = toXY(a0, rInner);
  return [
    `M ${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 0 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function signAbbrev(sign: ZodiacSign): string {
  return sign.slice(0, 3).toUpperCase();
}

/** The bold, colored outer band — 4 quadrants, each a related shade of one configured accent so they read as genuinely distinct without a second hardcoded palette. */
function QuadrantBand({ baseColor }: { baseColor: string }) {
  const HUE_OFFSETS = [0, 28, -28, 52];
  const LIGHT_DELTAS = [0, 0.04, -0.06, 0.08];
  return (
    <>
      {[0, 1, 2, 3].map((q) => {
        const a0 = angleForGateIndex(q * 16);
        const a1 = angleForGateIndex(q * 16 + 16);
        const fill = deriveShade(baseColor, HUE_OFFSETS[q], LIGHT_DELTAS[q]);
        const textColor = isDarkFill(fill) ? "#ffffff" : "#1c1e24";
        const labelPos = toXY(angleForGateIndex(q * 16 + 8), QUADRANT_LABEL_R);
        return (
          <g key={q}>
            <path d={bandPath(a0, a1, QUADRANT_OUTER, QUADRANT_INNER)} fill={fill} stroke="#ffffff" strokeWidth={0.5} />
            <text x={labelPos.x} y={labelPos.y + 2} fontSize={6.5} fontWeight={800} textAnchor="middle" fill={textColor}>
              {q + 1}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** The bold, colored zodiac band — 12 signs, each a related shade of one configured accent, alternating lightness so neighboring signs stay visually distinct. */
function ZodiacRing({ baseColor }: { baseColor: string }) {
  return (
    <>
      {SIGNS.map((sign, i) => {
        const startLon = i * 30;
        const endLon = startLon + 30;
        const a0 = angleForLongitude(startLon);
        const a1 = angleForLongitude(endLon);
        const midA = angleForLongitude(startLon + 15);
        const labelPos = toXY(midA, (ZODIAC_OUTER + ZODIAC_INNER) / 2);
        const hueOffset = -55 + i * (110 / 11);
        const fill = deriveShade(baseColor, hueOffset, i % 2 === 0 ? 0.03 : -0.05);
        const textColor = isDarkFill(fill) ? "#ffffff" : "#1c1e24";
        return (
          <g key={sign}>
            <path d={bandPath(a0, a1, ZODIAC_OUTER, ZODIAC_INNER)} fill={fill} stroke="#ffffff" strokeWidth={0.4} />
            <text
              x={labelPos.x}
              y={labelPos.y}
              fontSize={4.2}
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
      })}
    </>
  );
}

/** Small 6-tick vertical hexagram-inspired glyph for one activated gate's own wedge — white against the wedge's own color fill (was colored-on-colored before, which lost contrast once gates became filled sectors). See header note on why this represents the real activated line, not the traditional King Wen shape. */
function LineGlyph({ cx, cy, personalityLine, designLine, angleDeg }: { cx: number; cy: number; personalityLine?: number; designLine?: number; angleDeg: number }) {
  const tickH = 1.3;
  const tickW = 6;
  const gap = 1.9;
  const totalH = 6 * tickH + 5 * (gap - tickH);
  const startY = cy - totalH / 2;
  return (
    <g transform={`rotate(${angleDeg + 90}, ${cx}, ${cy})`}>
      {[1, 2, 3, 4, 5, 6].map((line) => {
        // Line 1 at the bottom (traditional reading order), so line `line`
        // sits at index (6-line) counting down from the top of the stack.
        const y = startY + (6 - line) * gap;
        const active = personalityLine === line || designLine === line;
        return <rect key={line} x={cx - tickW / 2} y={y} width={tickW} height={tickH} rx={0.4} fill="#ffffff" fillOpacity={active ? 1 : 0.3} />;
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
  /** Accent color for each activated gate wedge's outline/edge — same role human-design-chart.tsx's `gatesColor` plays around BodyGraph gate markers. */
  gateColor: string;
  backgroundColor: string;
  className?: string;
  /** Chart Design overrides, all optional — falls back to this chart's own considered defaults, none copied from Bodygraph. Each is used here as the SEED for a derived multi-shade band (see deriveShade above), not applied as one flat color. */
  zodiacColor?: string;
  gateRingColor?: string;
  quadrantColor?: string;
  personalityColor?: string;
  designColor?: string;
  /** The sub-account's HD Traditional Chart Design — passed straight into the embedded center BodyGraph so it can't drift from the corrected (Phase 4) centersMode/centerColors behavior the main chart already uses. */
  hdDesign?: ChartDesign | null;
  /** Lets a caller that already shows the full BodyGraph elsewhere on the same page (the Readings tab's own Traditional/Mandala switch) skip rendering a second one here — defaults to shown for every other consumer (PDF, Report Builder, public pages). */
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
        <QuadrantBand baseColor={quadrantColor} />
        <ZodiacRing baseColor={zodiacColor} />

        <circle cx={CX} cy={CY} r={GATE_SECTOR_OUTER} fill="none" stroke={gateRingColor} strokeOpacity={0.5} strokeWidth={0.4} />
        <circle cx={CX} cy={CY} r={GATE_SECTOR_INNER} fill="none" stroke={gateRingColor} strokeOpacity={0.35} strokeWidth={0.35} />

        {/* Quadrant dividers, extended the full depth of the gate-sector ring so the 4-quadrant structure organizes the whole radial field, not just the outer band. */}
        {[0, 1, 2, 3].map((q) => {
          const angle = angleForGateIndex(q * 16);
          const outer = toXY(angle, QUADRANT_OUTER + 1);
          const inner = toXY(angle, GATE_SECTOR_INNER);
          return <line key={q} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={quadrantColor} strokeOpacity={0.6} strokeWidth={0.5} />;
        })}

        {GATE_WHEEL_ORDER.map((gate, i) => {
          const angle = angleForGateIndex(i);
          const angleMid = angle + GATE_ARC_DEG / 2;
          const angleEnd = angle + GATE_ARC_DEG;
          const labelPos = toXY(angleMid, GATE_LABEL_R);
          const glyphPos = toXY(angleMid, LINE_GLYPH_R);
          const planetPos = toXY(angleMid, PLANET_GLYPH_R);
          const inPersonality = personalityGates.has(gate);
          const inDesign = designGates.has(gate);
          const activated = inPersonality || inDesign;
          const pAct = byGatePersonality.get(gate);
          const dAct = byGateDesign.get(gate);
          const textColor = activated ? "#ffffff" : INACTIVE_GATE_TEXT;

          return (
            <g key={gate}>
              {/* The gate's own wedge — the real fix for "activation as a floating dot": an activated gate's ENTIRE sector is now filled, split down its own angular center when both Personality and Design are active, so the color itself (not a 2px dot) is the primary activation signal. */}
              {activated ? (
                inPersonality && inDesign ? (
                  <>
                    <path d={bandPath(angle, angleMid, GATE_SECTOR_OUTER, GATE_SECTOR_INNER)} fill={personalityColor} stroke={gateColor} strokeWidth={0.3} />
                    <path d={bandPath(angleMid, angleEnd, GATE_SECTOR_OUTER, GATE_SECTOR_INNER)} fill={designColor} stroke={gateColor} strokeWidth={0.3} />
                  </>
                ) : (
                  <path
                    d={bandPath(angle, angleEnd, GATE_SECTOR_OUTER, GATE_SECTOR_INNER)}
                    fill={inPersonality ? personalityColor : designColor}
                    stroke={gateColor}
                    strokeWidth={0.3}
                  />
                )
              ) : (
                <path d={bandPath(angle, angleEnd, GATE_SECTOR_OUTER, GATE_SECTOR_INNER)} fill={gateRingColor} fillOpacity={0.06} stroke={gateRingColor} strokeOpacity={0.18} strokeWidth={0.2} />
              )}

              <text x={labelPos.x} y={labelPos.y + 0.9} fontSize={activated ? 4.4 : 3.2} fontWeight={activated ? 800 : 500} textAnchor="middle" fill={textColor}>
                {gate}
              </text>

              {activated && (
                <LineGlyph cx={glyphPos.x} cy={glyphPos.y} personalityLine={pAct?.line} designLine={dAct?.line} angleDeg={angleMid} />
              )}

              {/* Planet glyph(s) — the real body(ies) that activated this gate, now living inside this gate's own wedge instead of a separate concentric ring. White for contrast against the wedge's own color. */}
              {pAct && (
                <text x={planetPos.x} y={planetPos.y - (dAct ? 2 : 0)} fontSize={5.4} fontWeight={700} textAnchor="middle" fill="#ffffff">
                  {bodySymbol.get(pAct.body) ?? ""}
                </text>
              )}
              {dAct && (
                <text x={planetPos.x} y={planetPos.y + (pAct ? 5.2 : 2)} fontSize={5.4} fontWeight={700} textAnchor="middle" fill="#ffffff">
                  {bodySymbol.get(dAct.body) ?? ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {showCenterChart && (
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
