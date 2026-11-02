import type { Config } from "@puckeditor/core";
import { POPUP_ALLOWED_BLOCKS } from "@/lib/pages-funnels/popup-content";

const categories = {
  layout: { title: "Layout", components: ["Section", "Row", "Column"] },
  elements: { title: "Elements", components: ["Heading", "Text", "RichText", "Button", "Image", "Video", "Divider", "Spacer", "Accordion", "Icon"] },
  business: { title: "Business", components: ["Form"] },
};

/** A filtered view of the production registry; renderers are never duplicated. */
export function createPopupPuckConfig(base: Config): Config {
  const components = Object.fromEntries(Object.entries(base.components ?? {})
    .filter(([name]) => POPUP_ALLOWED_BLOCKS.has(name))
    .map(([name, component]) => [name, restrictPopupSlots(component)]));
  return { ...base, root: { ...base.root, fields: {} }, categories, components } as Config;
}

/** Keep nested slot insertion as curated as the top-level drawer. */
function restrictPopupSlots(component: unknown) {
  if (!component || typeof component !== "object") return component;
  const source = component as { fields?: Record<string, unknown> };
  if (!source.fields) return component;
  const fields = Object.fromEntries(Object.entries(source.fields).map(([key, field]) => {
    if (!field || typeof field !== "object") return [key, field];
    const candidate = field as { type?: unknown; allow?: unknown };
    if (candidate.type !== "slot") return [key, field];
    const allow = Array.isArray(candidate.allow)
      ? candidate.allow.filter((name): name is string => typeof name === "string" && POPUP_ALLOWED_BLOCKS.has(name))
      : [];
    return [key, { ...candidate, allow }];
  }));
  return { ...component as object, fields };
}
