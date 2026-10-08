import type { HumanDesignProfile } from "./human-design";
import type { AstrologyChart, AstrologyBodyName } from "./astrology";
import type { ZodiacSign } from "./gate-data";
import type { GeneKeysSphereResult } from "./gene-keys";
import type { CenterKey } from "./human-design-data";

/** Safe, deterministic client-side fixture used only to make the builder canvas reviewable without authentication. */
export const REPORT_BUILDER_FIXTURE_READING = {
  name: "Preview Sample",
  birthDate: "1990-06-15",
  birthPlace: "New York, NY, USA",
  humanDesign: {
    type: "Generator", authority: "Sacral", profile: "3/5", definitionLabel: "Single Definition",
    signature: "Satisfaction", notSelfTheme: "Frustration", strategy: "To Respond", designDateUtc: "1990-03-19T00:00:00.000Z",
    incarnationCross: "Right Angle Cross of Explanation (49/4 | 43/23)", incarnationCrossName: "Explanation", incarnationCrossAngle: "rightAngle",
    activatedGates: [4, 5, 14, 23, 29, 34, 43, 49, 53, 57],
    definedCenters: ["head", "ajna", "throat", "g", "sacral", "root"] as CenterKey[],
    openCenters: ["heart", "spleen", "solarplexus"],
    definedChannels: [],
    personality: [{ body: "sun", gate: 49, line: 2 }], design: [{ body: "sun", gate: 43, line: 5 }],
  } as HumanDesignProfile,
  astrology: fixtureAstrology(),
  spheres: ["Life's Work", "Evolution", "Radiance", "Purpose", "Attraction", "IQ", "EQ", "SQ", "Vocation", "Culture", "Brand", "Pearl"].map((sphere, i) => ({ sphere, gate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12][i], line: (i % 6) + 1, shadow: "Shadow", gift: "Gift", siddhi: "Siddhi" })) as GeneKeysSphereResult[],
};

function fixtureAstrology(): AstrologyChart {
  const bodies: AstrologyBodyName[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "northNode", "southNode", "lilith", "chiron"];
  const signs: ZodiacSign[] = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const placements = bodies.map((body, i) => ({ body, longitude: i * 24, sign: signs[i % 12], degInSign: (i * 24) % 30, house: (i % 12) + 1, retrograde: i % 4 === 0 }));
  return { placements, angles: { ascendant: { longitude: 0, sign: "Aries", degInSign: 0 }, descendant: { longitude: 180, sign: "Libra", degInSign: 0 }, mc: { longitude: 90, sign: "Cancer", degInSign: 0 }, ic: { longitude: 270, sign: "Capricorn", degInSign: 0 } }, houses: { system: "placidus", requestedSystem: "placidus", fallbackReason: null, cusps: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, longitude: i * 30, sign: signs[i], degInSign: 0 })) }, aspects: [{ bodyA: "sun", bodyB: "moon", type: "Trine", orb: 1.2 }] };
}
