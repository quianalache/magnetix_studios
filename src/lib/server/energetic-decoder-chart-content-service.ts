import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { TYPE_CONTENT, AUTHORITY_CONTENT, CENTER_CONTENT } from "@/lib/energetics/human-design-content-data";
import { CENTER_LABELS } from "@/lib/energetics/human-design-data";
import { SIGN_CONTENT, HOUSE_CONTENT, ASPECT_TYPE_CONTENT } from "@/lib/energetics/astrology-content-data";
import type { HdType, HdAuthority } from "@/lib/energetics/human-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";
import type { ZodiacSign, AspectType } from "@/lib/energetics/astrology";

/**
 * Human Design's Type/Authority/Center content and Astrology's Sign/House/
 * Aspect content shipped with real written defaults but no way for a
 * sub-account to rewrite them — the exact gap she caught: Gene Keys gates
 * have a real editor (energetic-decoder-gate-content-service.ts), these
 * didn't. Same pattern here, generalized across both systems instead of
 * duplicating the gate service six times: one Firestore collection,
 * doc ID = "hd:type:Generator" / "astro:house:1" etc., holding just the
 * overridden fields (merge over the shipped default).
 */

export type ChartContentSystem = "hd" | "astro";

export interface ChartContentDefault {
  system: ChartContentSystem;
  category: string;
  key: string;
  label: string;
  fields: Record<string, string>;
}

export interface ResolvedChartContent extends ChartContentDefault {
  id: string;
  isCustom: boolean;
}

/** Doc ID for one content item — colons are valid in Firestore doc IDs, and none of our keys contain one. */
function contentId(system: ChartContentSystem, category: string, key: string): string {
  return `${system}:${category}:${key}`;
}

function buildDefaults(): ChartContentDefault[] {
  const defaults: ChartContentDefault[] = [];

  for (const t of Object.values(TYPE_CONTENT)) {
    defaults.push({
      system: "hd",
      category: "type",
      key: t.type,
      label: t.type,
      fields: { strategy: t.strategy, description: t.description },
    });
  }
  for (const a of Object.values(AUTHORITY_CONTENT)) {
    defaults.push({
      system: "hd",
      category: "authority",
      key: a.authority,
      label: `${a.authority} Authority`,
      fields: { description: a.description },
    });
  }
  for (const c of Object.values(CENTER_CONTENT)) {
    defaults.push({
      system: "hd",
      category: "center",
      key: c.center,
      label: `${CENTER_LABELS[c.center]} Center`,
      fields: { definedText: c.definedText, undefinedText: c.undefinedText },
    });
  }
  for (const s of Object.values(SIGN_CONTENT)) {
    defaults.push({
      system: "astro",
      category: "sign",
      key: s.sign,
      label: s.sign,
      fields: { description: s.description },
    });
  }
  for (const h of Object.values(HOUSE_CONTENT)) {
    defaults.push({
      system: "astro",
      category: "house",
      key: String(h.house),
      label: `House ${h.house}`,
      fields: { theme: h.theme, description: h.description },
    });
  }
  for (const [type, description] of Object.entries(ASPECT_TYPE_CONTENT)) {
    defaults.push({
      system: "astro",
      category: "aspect",
      key: type,
      label: type,
      fields: { description },
    });
  }

  return defaults;
}

/** Every editable item (both systems), resolved to its override or shipped default — powers the Content tab's Human Design / Astrology editors. */
export async function listResolvedChartContent(subAccountId: string): Promise<ResolvedChartContent[]> {
  const defaults = buildDefaults();
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/energeticDecoderChartContent`)
    .get();
  const overrides = new Map<string, Record<string, string>>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const { updatedAt: _updatedAt, ...fields } = data;
    overrides.set(doc.id, fields as Record<string, string>);
  }

  return defaults.map((d) => {
    const id = contentId(d.system, d.category, d.key);
    const override = overrides.get(id);
    return {
      ...d,
      id,
      fields: override ? { ...d.fields, ...override } : d.fields,
      isCustom: !!override,
    };
  });
}

/** Single-item resolve, used at reading-generation time to snapshot the sub-account's actual wording onto the saved reading. */
async function resolveOne(
  subAccountId: string,
  system: ChartContentSystem,
  category: string,
  key: string,
): Promise<Record<string, string>> {
  const id = contentId(system, category, key);
  const def = buildDefaults().find((d) => contentId(d.system, d.category, d.key) === id);
  if (!def) return {};
  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/energeticDecoderChartContent/${id}`)
    .get();
  if (!snap.exists) return def.fields;
  const data = snap.data()!;
  const { updatedAt: _updatedAt, ...fields } = data;
  return { ...def.fields, ...(fields as Record<string, string>) };
}

export function resolveTypeContent(subAccountId: string, type: HdType) {
  return resolveOne(subAccountId, "hd", "type", type) as Promise<{ strategy: string; description: string }>;
}
export function resolveAuthorityContent(subAccountId: string, authority: HdAuthority) {
  return resolveOne(subAccountId, "hd", "authority", authority) as Promise<{ description: string }>;
}
export function resolveCenterContent(subAccountId: string, center: CenterKey) {
  return resolveOne(subAccountId, "hd", "center", center) as Promise<{
    definedText: string;
    undefinedText: string;
  }>;
}
export function resolveSignContent(subAccountId: string, sign: ZodiacSign) {
  return resolveOne(subAccountId, "astro", "sign", sign) as Promise<{ description: string }>;
}
export function resolveHouseContent(subAccountId: string, house: number) {
  return resolveOne(subAccountId, "astro", "house", String(house)) as Promise<{
    theme: string;
    description: string;
  }>;
}
export function resolveAspectContent(subAccountId: string, aspect: AspectType) {
  return resolveOne(subAccountId, "astro", "aspect", aspect) as Promise<{ description: string }>;
}

/**
 * Resolves everything a reading needs to snapshot in one query (12 signs +
 * 12 houses + 5 aspects + 9 centers + the one matching Type/Authority) —
 * cheaper than the ~40 individual doc reads calling resolveTypeContent/
 * resolveCenterContent/etc separately would cost, since listResolvedChartContent
 * already fetches the whole override collection at once.
 */
export async function resolveReadingContent(
  subAccountId: string,
  opts: { type?: HdType; authority?: HdAuthority } = {},
): Promise<{
  humanDesign: {
    typeStrategy: string;
    typeDescription: string;
    authorityDescription: string;
    centers: Record<string, { definedText: string; undefinedText: string }>;
  };
  astrology: {
    signs: Record<string, string>;
    houses: Record<string, { theme: string; description: string }>;
    aspectTypes: Record<string, string>;
  };
}> {
  const items = await listResolvedChartContent(subAccountId);
  const byId = new Map(items.map((i) => [i.id, i]));

  const centers: Record<string, { definedText: string; undefinedText: string }> = {};
  for (const c of Object.keys(CENTER_LABELS) as CenterKey[]) {
    const item = byId.get(contentId("hd", "center", c));
    centers[c] = {
      definedText: item?.fields.definedText ?? "",
      undefinedText: item?.fields.undefinedText ?? "",
    };
  }

  const typeItem = opts.type ? byId.get(contentId("hd", "type", opts.type)) : undefined;
  const authorityItem = opts.authority ? byId.get(contentId("hd", "authority", opts.authority)) : undefined;

  const signs: Record<string, string> = {};
  const houses: Record<string, { theme: string; description: string }> = {};
  const aspectTypes: Record<string, string> = {};
  for (const item of items) {
    if (item.system === "astro" && item.category === "sign") signs[item.key] = item.fields.description ?? "";
    if (item.system === "astro" && item.category === "house") {
      houses[item.key] = { theme: item.fields.theme ?? "", description: item.fields.description ?? "" };
    }
    if (item.system === "astro" && item.category === "aspect") aspectTypes[item.key] = item.fields.description ?? "";
  }

  return {
    humanDesign: {
      typeStrategy: typeItem?.fields.strategy ?? "",
      typeDescription: typeItem?.fields.description ?? "",
      authorityDescription: authorityItem?.fields.description ?? "",
      centers,
    },
    astrology: { signs, houses, aspectTypes },
  };
}

export async function saveChartContentOverride(
  subAccountId: string,
  id: string,
  fields: Record<string, string>,
): Promise<void> {
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/energeticDecoderChartContent/${id}`)
    .set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function resetChartContentOverride(subAccountId: string, id: string): Promise<void> {
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/energeticDecoderChartContent/${id}`)
    .delete();
}
