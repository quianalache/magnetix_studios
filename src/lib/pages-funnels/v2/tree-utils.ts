import type { SectionNode } from "@/types/pages-funnels-v2";

/**
 * Collects every unique, non-null `formId` referenced by `form` elements
 * anywhere in a V2 section tree (Section → Row → Column → Element) — used
 * by callers that need to resolve `LeadForm`s themselves before rendering
 * (the public `/p/[pageId]` route resolves them server-side via the Admin
 * SDK; the editor already has them from its own existing client-side
 * fetch). Kept separate from `migrate.ts`/`tree-view.tsx` so both can reuse
 * one tree-walk instead of re-implementing it.
 */
export function collectFormIds(sections: SectionNode[]): string[] {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        for (const element of column.elements) {
          if (element.type === "form" && element.content.formId) {
            ids.add(element.content.formId);
          }
        }
      }
    }
  }
  return [...ids];
}
