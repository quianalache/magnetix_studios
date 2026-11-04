import { RESPONSIVE_BREAKPOINTS } from "@/lib/pages-funnels/puck/style";

/**
 * Per-device column order for a Row (Wave 3). Each device can show the Row's
 * columns in reverse order — the classic "image first on mobile" fix —
 * independently of the others (devices are exact, non-overlapping ranges, so
 * reversing on mobile never affects tablet or desktop). `true` = reversed;
 * missing = the authored order.
 *
 * Rendered as a small scoped stylesheet (same approach as the shared
 * responsive styles) that sets CSS `order` on the Row's own direct grid
 * children only (`#row > .grid > :nth-child(k)`), so a Row nested inside a
 * column of this Row keeps its own order. Editor canvas, Preview and the live
 * page all render this same output; the editor's device frames have real
 * viewport widths, so the media queries apply there too.
 */
export interface ColumnOrderConfig {
  desktop?: boolean;
  tablet?: boolean;
  mobile?: boolean;
}

export const DEFAULT_COLUMN_ORDER: ColumnOrderConfig = {};

/** Rows never hold more than this many columns in practice; covers them all. */
const MAX_COLUMNS = 12;
const SAFE_CSS_ID = /^[a-zA-Z_][\w-]*$/;

export function columnOrderCss(id: string, config: ColumnOrderConfig | undefined): string | null {
  if (!config || !SAFE_CSS_ID.test(id)) return null;
  const { desktopMin, tabletMin, tabletMax, mobileMax } = RESPONSIVE_BREAKPOINTS;
  const rules = Array.from({ length: MAX_COLUMNS }, (_, i) => `#${id}>.grid>:nth-child(${i + 1}){order:-${i + 1}}`).join("");
  let css = "";
  if (config.desktop === true) css += `@media (min-width:${desktopMin}px){${rules}}`;
  if (config.tablet === true) css += `@media (min-width:${tabletMin}px) and (max-width:${tabletMax}px){${rules}}`;
  if (config.mobile === true) css += `@media (max-width:${mobileMax}px){${rules}}`;
  return css || null;
}

/** Strict save-time check. */
export function columnOrderProblem(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "A Row's column order couldn't be read.";
  for (const [key, value] of Object.entries(raw)) {
    if (!["desktop", "tablet", "mobile"].includes(key) || typeof value !== "boolean") {
      return "A Row's column order couldn't be read.";
    }
  }
  return null;
}

/** Walks a Puck tree and checks every Row's column order. */
export function findColumnOrderProblem(data: unknown): string | null {
  const seen = new Set<object>();
  let problem: string | null = null;
  const visit = (value: unknown) => {
    if (problem || !value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) return value.forEach(visit);
    const node = value as { type?: unknown; props?: Record<string, unknown> };
    if (node.type === "Row" && node.props) problem = columnOrderProblem(node.props.columnOrder);
    Object.values(value).forEach(visit);
  };
  visit(data);
  return problem;
}
