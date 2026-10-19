import { contentEntryId, type ContentEntryValues } from "@/lib/energetic-decoder/content-sets";

/**
 * Content Set per Embed (2026-10-19). A Reading's snapshot is first built
 * from the Default Content Set (today's text, unchanged). When an Embed
 * selects a custom set, every field that set has FILLED IN replaces the
 * Default text in the snapshot; a blank field keeps Default's text, so an
 * automatic/public Reading never shows an empty section. Pure; snapshotted
 * once at creation like everything else on a Reading.
 */

interface OverlayReading {
  spheres: { gate: number; showsUp?: string; giftText?: string }[];
  humanDesign?: {
    type?: string;
    authority?: string;
    /** HumanDesignVariables — read as a plain record of {value, description}. */
    variables?: object;
    content?: {
      typeStrategy: string;
      typeDescription: string;
      authorityDescription: string;
      centers: Record<string, { definedText: string; undefinedText: string }>;
      lines: Record<string, string>;
    };
  } | null;
  astrology?: {
    content?: {
      signs: Record<string, string>;
      houses: Record<string, { theme: string; description: string }>;
      aspectTypes: Record<string, string>;
    };
  } | null;
}

function filled(v: string | undefined): v is string {
  return typeof v === "string" && v.trim() !== "";
}

export function overlayContentSet<T extends OverlayReading>(
  reading: T,
  values: (entryId: string) => ContentEntryValues | undefined,
): T {
  const pick = (entryId: string, field: string, fallback: string): string => {
    const v = values(entryId)?.fields?.[field];
    return filled(v) ? v : fallback;
  };

  const spheres = reading.spheres.map((s) => ({
    ...s,
    showsUp: pick(contentEntryId("freq", "gate", String(s.gate)), "showsUp", s.showsUp ?? ""),
    giftText: pick(contentEntryId("freq", "gate", String(s.gate)), "giftText", s.giftText ?? ""),
  }));

  let humanDesign = reading.humanDesign;
  if (humanDesign) {
    const c = humanDesign.content;
    const content = c
      ? {
          ...c,
          typeStrategy: humanDesign.type ? pick(contentEntryId("hd", "type", humanDesign.type), "strategy", c.typeStrategy) : c.typeStrategy,
          typeDescription: humanDesign.type ? pick(contentEntryId("hd", "type", humanDesign.type), "description", c.typeDescription) : c.typeDescription,
          authorityDescription: humanDesign.authority
            ? pick(contentEntryId("hd", "authority", humanDesign.authority), "description", c.authorityDescription)
            : c.authorityDescription,
          centers: Object.fromEntries(
            Object.entries(c.centers).map(([key, t]) => [
              key,
              {
                definedText: pick(contentEntryId("hd", "center", key), "definedText", t.definedText),
                undefinedText: pick(contentEntryId("hd", "center", key), "undefinedText", t.undefinedText),
              },
            ]),
          ),
          lines: Object.fromEntries(
            Object.entries(c.lines).map(([key, name]) => [key, pick(contentEntryId("hd", "line", key), "name", name)]),
          ),
        }
      : c;
    const variables = humanDesign.variables
      ? Object.fromEntries(
          Object.entries(humanDesign.variables as Record<string, { value: string; description?: string }>).map(([cat, v]) => [
            cat,
            v && typeof v === "object" ? { ...v, description: pick(contentEntryId("hd", cat, v.value), "description", v.description ?? "") } : v,
          ]),
        )
      : humanDesign.variables;
    humanDesign = { ...humanDesign, content, variables } as typeof humanDesign;
  }

  let astrology = reading.astrology;
  if (astrology?.content) {
    const c = astrology.content;
    astrology = {
      ...astrology,
      content: {
        ...c,
        signs: Object.fromEntries(Object.entries(c.signs).map(([k, t]) => [k, pick(contentEntryId("astro", "sign", k), "description", t)])),
        houses: Object.fromEntries(
          Object.entries(c.houses).map(([k, h]) => [
            k,
            {
              theme: pick(contentEntryId("astro", "house", k), "theme", h.theme),
              description: pick(contentEntryId("astro", "house", k), "description", h.description),
            },
          ]),
        ),
        aspectTypes: Object.fromEntries(
          Object.entries(c.aspectTypes).map(([k, t]) => [k, pick(contentEntryId("astro", "aspect", k), "description", t)]),
        ),
      },
    } as typeof astrology;
  }

  return { ...reading, spheres, humanDesign, astrology };
}
