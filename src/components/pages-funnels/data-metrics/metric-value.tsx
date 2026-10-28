import { formatMetricValue } from "@/lib/pages-funnels/data-metrics/formatting";
import type { MetricFormatConfig } from "@/lib/pages-funnels/data-metrics/model";

export function MetricValue({
  value,
  prefix,
  suffix,
  format,
  decimalPlaces,
  useThousandsSeparator,
  currency,
}: {
  value: string;
  prefix?: string;
  suffix?: string;
} & MetricFormatConfig) {
  return (
    <>
      {prefix}
      {formatMetricValue(value, {
        format,
        decimalPlaces,
        useThousandsSeparator,
        currency,
      }) || "—"}
      {suffix}
    </>
  );
}
