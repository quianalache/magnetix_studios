import type { ReactNode } from "react";
import type { PuckAlignment } from "@/types/pages-funnels-puck";
import { hasText } from "@/lib/pages-funnels/pricing";
import { InlinePlaceholderStyle, placeholderProps } from "@/components/pages-funnels/puck/inline-placeholder";

const alignmentClass: Record<PuckAlignment, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export interface MetricGridItem {
  value: ReactNode;
  /** Strings, or Puck inline-editor nodes in the builder (Wave 3). */
  label: ReactNode;
  supportingText?: ReactNode;
  sourceNote?: string;
}

/** Shared static metric layout. Future metric blocks can reuse this layout
 * without coupling their rendering to Puck registration or editor state. */
export function MetricGrid({
  items,
  columns,
  alignment,
  gap = 24,
  dividers = false,
  editing = false,
}: {
  editing?: boolean;
  items: MetricGridItem[];
  columns: 1 | 2 | 3 | 4;
  alignment: PuckAlignment;
  gap?: number;
  dividers?: boolean;
}) {
  return (
    <>
    <InlinePlaceholderStyle editing={editing} />
    <dl
      className={`grid grid-cols-1 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : columns === 4 ? "lg:grid-cols-4" : columns === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}
      style={{ gap }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={`flex min-w-0 flex-col ${alignmentClass[alignment]} ${dividers ? "border-border-subtle border-b pb-4 last:border-b-0 sm:border-r sm:border-b-0 sm:pr-4 sm:last:border-r-0 lg:border-b-0 lg:pb-0" : ""}`}
        >
          <dt className="text-body order-2 font-medium" {...placeholderProps(editing, "Label")}>{item.label}</dt>
          <dd className="text-title-lg order-1 font-semibold tracking-tight tabular-nums">
            {item.value}
          </dd>
          {editing || hasText(item.supportingText) ? (
            <p className="text-muted-foreground text-body-sm order-3 mt-1" {...placeholderProps(editing, "Supporting text (optional)")}>
              {item.supportingText}
            </p>
          ) : null}
          {item.sourceNote ? (
            <p className="text-muted-foreground text-caption order-4 mt-1">
              {item.sourceNote}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
    </>
  );
}
