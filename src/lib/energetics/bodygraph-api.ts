import "server-only";

import type { WallClockBirthInput } from "./gate-wheel";

/**
 * Bodygraph.com's real paid API. Added 2026-08-09 after a full day of
 * exhausting every free alternative (her real HD books, the open-source
 * `free-human-design` library's actual source including its unpublished
 * demo-site JS, Bodygraph's own help center and downloaded custom-property
 * exports): the 6 Variables' calculation rule (which specific value a
 * given person gets, not just the menu of possible values) isn't published
 * anywhere free. Their own API terms explicitly forbid trying to
 * reverse-engineer it from responses either ("Reverse engineer, reconstruct,
 * or attempt to discover underlying algorithms") — checked directly, not
 * assumed — so this calls their API as intended instead: pay for the
 * answer, don't try to back into it.
 *
 * Chiron's ephemeris position (fetchBodygraphChiron, below) was also
 * sourced here originally, same reasoning — until 2026-08-11, when it was
 * replaced in the reading pipeline by a local, free calc (swiss-
 * ephemeris.ts's chironPlacement, verified against this very API's own
 * live values first). fetchBodygraphChiron itself is left in place,
 * untouched and still fully functional, just no longer called from
 * energetic-decoder-service.ts — kept as a fallback path, not deleted.
 *
 * Decision-Making Strategy description (fetchBodygraphVariables, below)
 * dropped the same day, for a different reason: an audit found it was
 * never rendered anywhere, and Bodygraph's own field for it is empty in
 * every real response anyway — see that function's own doc for the detail.
 * fetchBodygraphVariables now returns the 6 Variables + Skills only.
 *
 * Deliberately scoped to ONLY the fields nothing else in this codebase can
 * compute — Type/Authority/Profile/Centers/Gates/Channels/Incarnation
 * Cross/Signature/Not-Self Theme/Node/Lilith/Chiron/every other Astrology
 * placement stay on the free local engine, verified independently already.
 * If this API key is ever removed or the account lapses, every reading
 * still generates correctly — it just goes back to not having
 * Variables/Skills, exactly like before today, not a broken reading.
 */

const BASE_URL = "https://api.bodygraphchart.com";

function apiKey(): string | null {
  return process.env.BODYGRAPH_API_KEY?.trim() || null;
}

/**
 * Real bug, found 2026-08-10: Bodygraph's own returned SVG ships a
 * lowercase `viewbox="0 0 400 693"` attribute instead of the SVG-spec-
 * required camelCase `viewBox`, and no explicit width/height either. SVG
 * attribute names are case-sensitive, so an <img> embedding it has zero
 * intrinsic sizing info and renders squashed/cropped to a sliver of the
 * real chart. Their bug, not ours — normalized once here at the source so
 * every newly-saved reading stores the corrected markup, not just at
 * render time (which also has its own copy of this fix, for readings
 * saved before this existed).
 */
function normalizeSvg(svg: string): string {
  return svg.replace(/<svg([^>]*)>/i, (match, attrs: string) => {
    const viewBoxMatch = /viewbox="([^"]+)"/i.exec(attrs);
    let fixedAttrs = attrs.replace(/viewbox="([^"]+)"/i, 'viewBox="$1"');
    if (viewBoxMatch && !/\bwidth="/i.test(attrs) && !/\bheight="/i.test(attrs)) {
      const [, , w, h] = viewBoxMatch[1].split(/\s+/);
      if (w && h) fixedAttrs += ` width="${w}" height="${h}"`;
    }
    return `<svg${fixedAttrs}>`;
  });
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
 * Fetches the 6 Variables + Skills & Attributes for one person. Best-effort:
 * returns null on any failure (missing key, network error, bad response)
 * rather than throwing, so a reading still saves successfully with
 * everything the free engine already computes even if this call fails or
 * the key is removed later.
 *
 * Used to also return Decision-Making Strategy description — dropped
 * 2026-08-11 after an audit found it was never rendered anywhere (not web,
 * not PDF) AND, checked directly against 3 real live responses, Bodygraph's
 * own `.description` field for it is always an empty string in practice
 * (the real text lives in `.option`/`.id` instead, which nothing here ever
 * read). Even if it had been wired up, the actual content — Type's
 * Strategy + Authority's "how to decide" — is already covered by real,
 * locally-authored text already displayed on every reading: see
 * TYPE_CONTENT[type].strategy and AUTHORITY_CONTENT[authority].description
 * in human-design-content-data.ts.
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

    const skillsRaw = (props.BusinessCompetencesAndQualities as { option?: string } | undefined)?.option;

    return {
      digestion,
      sense,
      designSense,
      motivation,
      perspective,
      environment,
      skills: parseSkills(skillsRaw),
      chartSvg: data.SVG ? normalizeSvg(data.SVG) : undefined,
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
 * Fetches Chiron's position from Bodygraph. NOT called from the reading
 * pipeline as of 2026-08-11 — superseded by swiss-ephemeris.ts's
 * chironPlacement (local, free, verified against this exact endpoint's own
 * live values). `astronomy-engine` still has no minor-planet ephemeris of
 * its own (checked directly, see gate-wheel.ts), which is why Chiron ever
 * needed a separate source in the first place — Swiss Ephemeris's bundled
 * asteroid file fills that gap now instead of this API. Left defined,
 * untouched, and fully working as a fallback path, not deleted. Same
 * best-effort null-on-failure contract as fetchBodygraphVariables above.
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
    return { longitude: chiron.abs_pos, chartSvg: data.SVG ? normalizeSvg(data.SVG) : undefined };
  } catch {
    return null;
  }
}
