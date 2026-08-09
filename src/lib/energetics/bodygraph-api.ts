import "server-only";

import type { WallClockBirthInput } from "./gate-wheel";

/**
 * Bodygraph.com's real paid API — the one thing this whole free local
 * engine genuinely can't replace. Added 2026-08-09 after a full day of
 * exhausting every free alternative (her real HD books, the open-source
 * `free-human-design` library's actual source including its unpublished
 * demo-site JS, Bodygraph's own help center and downloaded custom-property
 * exports): the 6 Variables' calculation rule (which specific value a
 * given person gets, not just the menu of possible values) and Chiron's
 * ephemeris position aren't published anywhere free. Their own API terms
 * explicitly forbid trying to reverse-engineer it from responses either
 * ("Reverse engineer, reconstruct, or attempt to discover underlying
 * algorithms") — checked directly, not assumed — so this calls their API
 * as intended instead: pay for the answer, don't try to back into it.
 *
 * Deliberately scoped to ONLY the fields nothing else in this codebase can
 * compute — Type/Authority/Profile/Centers/Gates/Channels/Incarnation
 * Cross/Signature/Not-Self Theme/Node/Lilith/every Astrology placement
 * stay on the free local engine, verified independently already. If this
 * API key is ever removed or the account lapses, every reading still
 * generates correctly — it just goes back to not having Variables/Skills/
 * Chiron, exactly like before today, not a broken reading.
 */

const BASE_URL = "https://api.bodygraphchart.com";

function apiKey(): string | null {
  return process.env.BODYGRAPH_API_KEY?.trim() || null;
}

export interface BodygraphVariableField {
  value: string;
  description: string;
}

export interface BodygraphSkill {
  name: string;
  description: string;
}

export interface HumanDesignVariables {
  digestion: BodygraphVariableField;
  sense: BodygraphVariableField;
  designSense: BodygraphVariableField;
  motivation: BodygraphVariableField;
  perspective: BodygraphVariableField;
  environment: BodygraphVariableField;
  decisionMakingStrategyDescription: string;
  skills: BodygraphSkill[];
  /**
   * Bodygraph's own rendered chart image (raw SVG markup) — real, from
   * their renderer, not this app's hand-drawn HumanDesignChart component.
   * Requested via `&design=default` on the same call, so this costs
   * nothing extra. Undefined if the API didn't return one (older
   * account tiers, or the call otherwise succeeded without it) —
   * callers fall back to the local component in that case, same as
   * every other "real or absent, never fabricated" field here.
   */
  chartSvg?: string;
}

function field(props: Record<string, unknown> | undefined, key: string): BodygraphVariableField | null {
  const obj = props?.[key] as { id?: string; description?: string } | undefined;
  if (!obj?.id) return null;
  return { value: obj.id, description: obj.description ?? "" };
}

/**
 * "Supervision - Detail, Fundamentals...<br>Execution - ...<br>..." →
 * [{ name: "Supervision", description: "Detail, Fundamentals..." }, ...].
 * Bodygraph's own delivery format for this field — parsed here rather than
 * stored raw so the UI doesn't need to know about their HTML shape.
 */
function parseSkills(raw: string | undefined): BodygraphSkill[] {
  if (!raw) return [];
  return raw
    .split(/<br\s*\/?>/i)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split(" - ");
      return { name: name.trim(), description: rest.join(" - ").trim() };
    });
}

/**
 * Fetches the 6 Variables + Decision-Making Strategy description + Skills
 * & Attributes for one person. Best-effort: returns null on any failure
 * (missing key, network error, bad response) rather than throwing, so a
 * reading still saves successfully with everything the free engine already
 * computes even if this call fails or the key is removed later.
 */
export async function fetchBodygraphVariables(
  input: WallClockBirthInput,
): Promise<HumanDesignVariables | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const url = new URL(`${BASE_URL}/v221006/hd-data`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("date", `${input.date} ${input.time}`);
    url.searchParams.set("timezone", input.timeZone);
    // Requests the real rendered chart SVG alongside the data — same call,
    // no extra cost. "default" always resolves to a real design (verified
    // 2026-08-09 by testing it directly against the live API), so this
    // doesn't depend on any Chart Design being separately configured.
    url.searchParams.set("design", "default");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { Properties?: Record<string, unknown>; SVG?: string };
    const props = data.Properties;
    if (!props) return null;

    const digestion = field(props, "Digestion");
    const sense = field(props, "Sense");
    const designSense = field(props, "DesignSense");
    const motivation = field(props, "Motivation");
    const perspective = field(props, "Perspective");
    const environment = field(props, "Environment");
    if (!digestion || !sense || !designSense || !motivation || !perspective || !environment) return null;

    const decisionMaking = props.DecisionMakingStrategy as { description?: string } | undefined;
    const skillsRaw = (props.BusinessCompetencesAndQualities as { option?: string } | undefined)?.option;

    return {
      digestion,
      sense,
      designSense,
      motivation,
      perspective,
      environment,
      decisionMakingStrategyDescription: decisionMaking?.description ?? "",
      skills: parseSkills(skillsRaw),
      chartSvg: data.SVG || undefined,
    };
  } catch {
    return null;
  }
}

export interface BodygraphChiron {
  /** Absolute ecliptic longitude, degrees 0-360 — same convention every other body in this codebase uses, so it drops straight into the existing sign/house/aspect pipeline (astrology.ts) instead of needing its own display logic. */
  longitude: number;
  /** Bodygraph's own rendered natal wheel SVG — same "real design=default, no extra cost" approach as the HD chart above. */
  chartSvg?: string;
}

/**
 * Fetches only Chiron's position — `astronomy-engine` has no minor-planet
 * ephemeris at all (checked directly, see gate-wheel.ts), so this is the
 * one Astrology body without a free local calculation. Same best-effort
 * null-on-failure contract as fetchBodygraphVariables above.
 */
export async function fetchBodygraphChiron(input: {
  date: string;
  time: string;
  timeZone: string;
  lat: number;
  lng: number;
}): Promise<BodygraphChiron | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const url = new URL(`${BASE_URL}/v240815/astro-data`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("date", `${input.date} ${input.time}`);
    url.searchParams.set("timezone", input.timeZone);
    url.searchParams.set("latitude", String(input.lat));
    url.searchParams.set("longitude", String(input.lng));
    url.searchParams.set("design", "default");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { Planets?: Record<string, { abs_pos?: number }>; SVG?: string };
    const chiron = data.Planets?.Chiron;
    if (typeof chiron?.abs_pos !== "number") return null;
    return { longitude: chiron.abs_pos, chartSvg: data.SVG || undefined };
  } catch {
    return null;
  }
}
