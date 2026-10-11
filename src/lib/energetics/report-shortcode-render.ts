import type { ReportCanvasElement, ReportPage } from "@/types/report-blocks";
import { resolveShortcodes, type ShortcodeReadingInput } from "@/lib/energetics/shortcodes";

/**
 * Shortcode parity (2026-10-11) — the ONE place every report surface turns
 * a page's Shortcode elements and inline `{{tokens}}` into reader-facing
 * text: the web viewer (sample preview, generated preview, public report),
 * Preview PDF and the generated-report PDF.
 *
 * Rules, identical everywhere:
 *   - A Shortcode element frozen at generation (`payload.resolvedText`)
 *     always shows that frozen value, so a generated report never changes
 *     after the fact and its web preview and PDF agree.
 *   - Otherwise it resolves live against the given reading input (which
 *     carries the report's Content Set, if any — no fallback to another
 *     set; missing content resolves blank).
 *   - With neither, it renders blank — never the raw `{{token}}` syntax.
 *   - Text elements (and legacy text blocks) resolve inline `{{tokens}}`
 *     with the same resolver. Text with no tokens is unchanged.
 */

export function shortcodeToken(element: Pick<ReportCanvasElement, "payload">): string {
  return String(element.payload?.token ?? "full_name");
}

export function shortcodeElementValue(element: Pick<ReportCanvasElement, "payload">, input?: ShortcodeReadingInput | null): string {
  const frozen = element.payload?.resolvedText;
  if (typeof frozen === "string") return frozen;
  return input ? resolveShortcodes(`{{${shortcodeToken(element)}}}`, input) : "";
}

export function resolveInlineText(text: string, input?: ShortcodeReadingInput | null): string {
  return input ? resolveShortcodes(text, input) : text;
}

/**
 * Pages ready for a renderer that only prints text (the PDF): every
 * Shortcode element becomes a Text element holding its resolved value, and
 * Text elements / text blocks have their inline tokens resolved.
 */
export function resolvePagesForRender(pages: ReportPage[], input?: ShortcodeReadingInput | null): ReportPage[] {
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => (block.type === "text" ? { ...block, html: resolveInlineText(block.html, input) } : block)),
    elements: page.elements?.map((element): ReportCanvasElement => {
      if (element.type === "shortcode") {
        return { ...element, type: "text", payload: { ...element.payload, text: shortcodeElementValue(element, input) } };
      }
      if (element.type === "text") {
        return { ...element, payload: { ...element.payload, text: resolveInlineText(String(element.payload.text ?? ""), input) } };
      }
      return element;
    }),
  }));
}
