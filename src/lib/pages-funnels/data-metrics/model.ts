/** Shared, deliberately small data model for customer-authored metrics.
 *
 * This is manual-first. `provenance` is an internal seam for future AI and
 * connected sources; it is not exposed as a builder control yet.
 */
export type MetricFormat =
  | "text"
  | "number"
  | "compact"
  | "currency"
  | "percentage";

export type MetricProvenance =
  | { type: "manual"; status: "confirmed" | "placeholder" }
  | {
      type: "connected";
      sourceKind: string;
      sourceRef: string;
      lastUpdatedAt?: string;
    };

export interface MetricFormatConfig {
  format?: MetricFormat;
  decimalPlaces?: number;
  useThousandsSeparator?: boolean;
  currency?: string;
}

export interface MetricItemModel extends MetricFormatConfig {
  value: string;
  prefix?: string;
  suffix?: string;
  label: string;
  supportingText?: string;
  sourceNote?: string;
  provenance?: MetricProvenance;
}
