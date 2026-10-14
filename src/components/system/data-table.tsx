import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DataTableShell — the approved index-table frame (Visual Direction 2,
 * Section 4.2; Assets is the reference): a white card that clips its
 * corners, a horizontally scrolling body (tables never push the page
 * sideways), and an optional footer for pagination INSIDE the card.
 *
 * Pair the header row with `DATA_TABLE_HEAD_ROW` (the approved deep-plum
 * band with lavender-white tracked labels), body rows with
 * `DATA_TABLE_ROW`, and cells with `DATA_TABLE_TH` / `DATA_TABLE_TD`.
 */
export function DataTableShell({
  children,
  footer,
  className,
  minWidth,
}: {
  children: ReactNode;
  /** Pagination / "Showing 1–10 of 52" — rendered inside the card. */
  footer?: ReactNode;
  className?: string;
  /** Minimum table width before the body scrolls sideways (e.g. "48rem"). */
  minWidth?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-card border border-border bg-card shadow-card", className)}>
      {/* `relative` contains absolutely-positioned descendants (e.g. sr-only
          header labels) so they scroll with the table instead of widening the page. */}
      <div className="relative overflow-x-auto">
        <table className="w-full text-body-sm" style={minWidth ? { minWidth } : undefined}>
          {children}
        </table>
      </div>
      {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
    </div>
  );
}

/** Approved index-table heading band: deep plum, lavender-white 10.5px tracked labels, one line. */
export const DATA_TABLE_HEAD_ROW =
  "bg-table-head text-left text-th font-semibold tracking-[0.08em] whitespace-nowrap text-table-head-foreground uppercase";
export const DATA_TABLE_TH = "px-4 py-3 font-semibold";
export const DATA_TABLE_ROW = "border-b border-border-subtle transition-colors last:border-0 hover:bg-tint-violet";
export const DATA_TABLE_TD = "px-4 py-2.5 align-middle";
