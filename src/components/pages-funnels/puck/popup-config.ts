import type { Config } from "@puckeditor/core";
import { POPUP_ALLOWED_BLOCKS } from "@/lib/pages-funnels/popup-content";

const categories = {
  layout: { title: "Layout", components: ["Section", "Row", "Column"] },
  elements: { title: "Elements", components: ["Heading", "Text", "RichText", "Button", "Image", "Video", "Divider", "Spacer", "Accordion", "Icon"] },
  business: { title: "Business", components: ["Form"] },
};

/** A filtered view of the production registry; renderers are never duplicated. */
export function createPopupPuckConfig(base: Config): Config {
  const components = Object.fromEntries(Object.entries(base.components ?? {}).filter(([name]) => POPUP_ALLOWED_BLOCKS.has(name)));
  return { ...base, categories, components } as Config;
}
