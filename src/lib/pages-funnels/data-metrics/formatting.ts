import type { MetricFormatConfig } from "./model";
import { clampDecimalPlaces, parseMetricNumber } from "./validation";

const compactUnits = ["", "K", "M", "B", "T"] as const;

function formatNumeric(
  value: number,
  options: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat("en-US", options).format(value);
  } catch {
    return String(value);
  }
}

/** Returns the formatted numeric portion, or the original value when the
 * customer intentionally entered free-form proof copy. */
export function formatMetricValue(
  value: string | number | null | undefined,
  config: MetricFormatConfig = {}
): string {
  const raw = value == null ? "" : String(value);
  const number = parseMetricNumber(value);
  if (number == null || !config.format || config.format === "text") return raw;

  const decimalPlaces = clampDecimalPlaces(config.decimalPlaces);
  const fraction = {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  };

  if (config.format === "compact") {
    const absolute = Math.abs(number);
    const unitIndex = Math.min(
      compactUnits.length - 1,
      absolute === 0 ? 0 : Math.floor(Math.log10(absolute) / 3)
    );
    const scaled = number / 1000 ** unitIndex;
    return `${formatNumeric(scaled, fraction)}${compactUnits[unitIndex]}`;
  }

  if (config.format === "currency") {
    return formatNumeric(number, {
      style: "currency",
      currency: config.currency || "USD",
      ...fraction,
    });
  }

  if (config.format === "percentage") {
    return `${formatNumeric(number, {
      useGrouping: config.useThousandsSeparator !== false,
      ...fraction,
    })}%`;
  }

  return formatNumeric(number, {
    useGrouping: config.useThousandsSeparator !== false,
    ...fraction,
  });
}

export function metricItemSummary(value?: string, label?: string): string {
  const left = value?.trim() || "Metric";
  const right = label?.trim();
  return right ? `${left} — ${right}` : left;
}
