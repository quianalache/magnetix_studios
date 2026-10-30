import type { ComponentConfig, CustomField, Fields } from "@puckeditor/core";
import type { PuckAlignment, StyleConfig } from "@/types/pages-funnels-puck";
import { DEFAULT_STYLE_CONFIG } from "@/lib/pages-funnels/puck/style";
import { METRIC_ACCENT_OPTIONS, type MetricAccent } from "@/lib/pages-funnels/data-metrics/accent";
import {
  CHART_TYPE_OPTIONS,
  formatChartValue,
  isPartToWhole,
  isSequential,
  type ChartHeight,
  type ChartSort,
  type ChartType,
} from "@/lib/pages-funnels/data-metrics/chart";
import { toFiniteNumber } from "@/lib/pages-funnels/data-metrics/validation";
import type { RingSize, ProgressThickness } from "@/lib/pages-funnels/data-metrics/progress";
import { AnimatedCounterRender } from "@/components/pages-funnels/data-metrics/animated-counter";
import { ProgressBarRender } from "@/components/pages-funnels/data-metrics/progress-bar";
import { ProgressRingRender } from "@/components/pages-funnels/data-metrics/progress-ring";
import { ChartRender } from "@/components/pages-funnels/data-metrics/chart";
import type { ProgressValueDisplay } from "@/components/pages-funnels/data-metrics/progress-text";
import type { EnterAnimationMode } from "@/components/pages-funnels/data-metrics/use-enter-animation";
import { MetricNumberInput } from "@/components/pages-funnels/puck/metric-number-field";

/**
 * Data & Metrics Capability Wave 1 (2026-10-30): Animated Counter, Progress
 * Bar, Progress Ring and Chart. Manual values only — no connected data, no
 * AI. New blocks start empty (the builder shows an empty state) so nothing
 * invented ever reaches a visitor. Fields appear only when they apply
 * (`resolveFields`), so the common settings stay short.
 */

type NumberFormat = "number" | "compact" | "currency" | "percentage";

interface FormatProps {
  format: NumberFormat;
  decimalPlaces: number;
  useThousandsSeparator: boolean;
  currency: string;
}

export type AnimatedCounterBlockProps = FormatProps & {
  startValue?: number;
  endValue?: number;
  prefix: string;
  suffix: string;
  label: string;
  supportingText: string;
  animation: EnterAnimationMode;
  durationSeconds?: number;
  alignment: PuckAlignment;
  accent: MetricAccent;
  style: StyleConfig;
};

export type ProgressBarBlockProps = FormatProps & {
  currentValue?: number;
  targetValue?: number;
  label: string;
  supportingText: string;
  valueDisplay: ProgressValueDisplay;
  showPercentage: boolean;
  thickness: ProgressThickness;
  direction: "ltr" | "rtl";
  alignment: PuckAlignment;
  accent: MetricAccent;
  animate: boolean;
  style: StyleConfig;
};

export type ProgressRingBlockProps = FormatProps & {
  currentValue?: number;
  targetValue?: number;
  centerDisplay: "percentage" | "value" | "none";
  label: string;
  supportingText: string;
  size: RingSize;
  thickness: ProgressThickness;
  alignment: "left" | "center";
  accent: MetricAccent;
  animate: boolean;
  style: StyleConfig;
};

export type ChartBlockProps = FormatProps & {
  chartType: ChartType;
  title: string;
  description: string;
  rows: { label?: string; value?: number }[];
  sort: ChartSort;
  showValues: boolean;
  showLegend: boolean;
  donutCenter: "total" | "custom" | "none";
  centerText: string;
  centerLabel: string;
  height: ChartHeight;
  style: StyleConfig;
};

const ON_OFF = [
  { label: "On", value: true },
  { label: "Off", value: false },
];
const SHOW_HIDE = [
  { label: "Show", value: true },
  { label: "Hide", value: false },
];

const formatFields = {
  format: {
    type: "select" as const,
    label: "Number format",
    options: [
      { label: "Number (1,234)", value: "number" },
      { label: "Compact (1.2K, 3.4M)", value: "compact" },
      { label: "Currency ($1,234)", value: "currency" },
      { label: "Percentage (12%)", value: "percentage" },
    ],
  },
  currency: { type: "text" as const, label: "Currency code (e.g. USD, EUR, GBP)" },
  decimalPlaces: { type: "number" as const, label: "Decimal places", min: 0, max: 6 },
  useThousandsSeparator: { type: "radio" as const, label: "Thousands separator", options: ON_OFF },
};

const formatDefaults: FormatProps = {
  format: "number",
  decimalPlaces: 0,
  useThousandsSeparator: true,
  currency: "USD",
};

const accentField = { type: "select" as const, label: "Color", options: METRIC_ACCENT_OPTIONS };
const thicknessField = {
  type: "select" as const,
  label: "Thickness",
  options: [
    { label: "Thin", value: "thin" },
    { label: "Medium", value: "medium" },
    { label: "Thick", value: "thick" },
  ],
};

/** A Data & Metrics number field (empty = not set; see MetricNumberInput). The
 * factory stays in this server-safe module; it only references the client
 * input as a component. */
function metricNumberField(
  label: string,
  options: { hint?: string; suffix?: string; placeholder?: string } = {},
): CustomField<number | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => (
      <MetricNumberInput label={label} value={typeof value === "number" ? value : undefined} onChange={onChange} {...options} />
    ),
  };
}

/** A copy of `fields` without the named keys (progressive disclosure). */
function omit<F extends Record<string, unknown>>(fields: F, keys: (string | false)[]): F {
  const drop = new Set(keys.filter(Boolean) as string[]);
  return Object.fromEntries(Object.entries(fields).filter(([k]) => !drop.has(k))) as F;
}

function formatOmissions(props: Partial<FormatProps>): (string | false)[] {
  return [props.format !== "currency" && "currency", props.format === "compact" && "useThousandsSeparator"];
}

export function createDataMetricsComponents(styleField: Fields[string]) {
  const AnimatedCounter: ComponentConfig<AnimatedCounterBlockProps> = {
    label: "Animated Counter",
    fields: {
      startValue: metricNumberField("Start value", { placeholder: "0" }),
      endValue: metricNumberField("End value", { placeholder: "e.g. 10000" }),
      prefix: { type: "text", label: "Before the number (e.g. $)" },
      suffix: { type: "text", label: "After the number (e.g. +)" },
      label: { type: "text", label: "Label" },
      supportingText: { type: "text", label: "Supporting text (optional)" },
      ...formatFields,
      animation: {
        type: "select",
        label: "Count up",
        options: [
          { label: "When it scrolls into view", value: "onScroll" },
          { label: "As soon as the page loads", value: "onLoad" },
          { label: "Don't animate (show the final number)", value: "none" },
        ],
      },
      durationSeconds: metricNumberField("Count-up length", { suffix: "seconds", hint: "Between 0.5 and 10 seconds." }),
      alignment: {
        type: "radio",
        label: "Alignment",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
          { label: "Right", value: "right" },
        ],
      },
      accent: { ...accentField, label: "Number color" },
      style: styleField as Fields<AnimatedCounterBlockProps>["style"],
    },
    resolveFields: (data, { fields }) =>
      omit(fields, [...formatOmissions(data.props), data.props.animation === "none" && "durationSeconds"]),
    defaultProps: {
      startValue: 0,
      prefix: "",
      suffix: "",
      label: "",
      supportingText: "",
      ...formatDefaults,
      animation: "onScroll",
      durationSeconds: 2,
      alignment: "center",
      accent: "default",
      style: DEFAULT_STYLE_CONFIG,
    },
    render: ({ puck, ...p }) => <AnimatedCounterRender {...p} editing={puck.isEditing} />,
  };

  const ProgressBar: ComponentConfig<ProgressBarBlockProps> = {
    label: "Progress Bar",
    fields: {
      currentValue: metricNumberField("Current value", { placeholder: "e.g. 750" }),
      targetValue: metricNumberField("Target value", { placeholder: "e.g. 1000" }),
      label: { type: "text", label: "Label" },
      supportingText: { type: "text", label: "Supporting text (optional)" },
      valueDisplay: {
        type: "select",
        label: "Show the numbers as",
        options: [
          { label: "Current of target (750 of 1,000)", value: "of" },
          { label: "Amount left (250 to go)", value: "remaining" },
          { label: "Don't show numbers", value: "none" },
        ],
      },
      showPercentage: { type: "radio", label: "Percentage", options: SHOW_HIDE },
      ...formatFields,
      thickness: thicknessField,
      direction: {
        type: "radio",
        label: "Fills from",
        options: [
          { label: "Left", value: "ltr" },
          { label: "Right", value: "rtl" },
        ],
      },
      alignment: {
        type: "radio",
        label: "Text alignment",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
          { label: "Right", value: "right" },
        ],
      },
      accent: { ...accentField, label: "Bar color" },
      animate: { type: "radio", label: "Fill in when it scrolls into view", options: ON_OFF },
      style: styleField as Fields<ProgressBarBlockProps>["style"],
    },
    resolveFields: (data, { fields }) => omit(fields, formatOmissions(data.props)),
    defaultProps: {
      label: "",
      supportingText: "",
      valueDisplay: "of",
      showPercentage: true,
      ...formatDefaults,
      thickness: "medium",
      direction: "ltr",
      alignment: "left",
      accent: "plum",
      animate: true,
      style: DEFAULT_STYLE_CONFIG,
    },
    render: ({ puck, ...p }) => <ProgressBarRender {...p} editing={puck.isEditing} />,
  };

  const ProgressRing: ComponentConfig<ProgressRingBlockProps> = {
    label: "Progress Ring",
    fields: {
      currentValue: metricNumberField("Current value", { placeholder: "e.g. 8" }),
      targetValue: metricNumberField("Target value", { placeholder: "e.g. 12" }),
      centerDisplay: {
        type: "select",
        label: "In the center",
        options: [
          { label: "Percentage (65%)", value: "percentage" },
          { label: "Value (8 of 12)", value: "value" },
          { label: "Nothing", value: "none" },
        ],
      },
      label: { type: "text", label: "Label" },
      supportingText: { type: "text", label: "Supporting text (optional)" },
      ...formatFields,
      size: {
        type: "select",
        label: "Ring size",
        options: [
          { label: "Small", value: "small" },
          { label: "Medium", value: "medium" },
          { label: "Large", value: "large" },
        ],
      },
      thickness: thicknessField,
      alignment: {
        type: "radio",
        label: "Layout",
        options: [
          { label: "Ring beside text", value: "left" },
          { label: "Ring above text", value: "center" },
        ],
      },
      accent: { ...accentField, label: "Ring color" },
      animate: { type: "radio", label: "Fill in when it scrolls into view", options: ON_OFF },
      style: styleField as Fields<ProgressRingBlockProps>["style"],
    },
    resolveFields: (data, { fields }) => omit(fields, formatOmissions(data.props)),
    defaultProps: {
      centerDisplay: "percentage",
      label: "",
      supportingText: "",
      ...formatDefaults,
      size: "medium",
      thickness: "medium",
      alignment: "left",
      accent: "plum",
      animate: true,
      style: DEFAULT_STYLE_CONFIG,
    },
    render: ({ puck, ...p }) => <ProgressRingRender {...p} editing={puck.isEditing} />,
  };

  const Chart: ComponentConfig<ChartBlockProps> = {
    label: "Chart",
    fields: {
      chartType: { type: "select", label: "Chart type", options: CHART_TYPE_OPTIONS },
      title: { type: "text", label: "Title" },
      description: { type: "textarea", label: "Description (optional)" },
      rows: {
        type: "array",
        label: "Data",
        arrayFields: {
          label: { type: "text", label: "Label" },
          value: metricNumberField("Value"),
        },
        defaultItemProps: { label: "" },
        getItemSummary: (item, index) => {
          const value = toFiniteNumber(item?.value);
          const label = item?.label?.trim() || `Row ${(index ?? 0) + 1}`;
          return value == null ? `${label} — add a number` : `${label} — ${formatChartValue(value, {})}`;
        },
      },
      sort: {
        type: "select",
        label: "Order",
        options: [
          { label: "As entered", value: "original" },
          { label: "Largest first", value: "desc" },
          { label: "Smallest first", value: "asc" },
        ],
      },
      ...formatFields,
      showValues: { type: "radio", label: "Value labels", options: SHOW_HIDE },
      showLegend: { type: "radio", label: "Legend", options: SHOW_HIDE },
      donutCenter: {
        type: "select",
        label: "Center of the donut",
        options: [
          { label: "Total of all values", value: "total" },
          { label: "My own text", value: "custom" },
          { label: "Nothing", value: "none" },
        ],
      },
      centerText: { type: "text", label: "Center text" },
      centerLabel: { type: "text", label: "Center caption (e.g. Total visits)" },
      height: {
        type: "select",
        label: "Chart height",
        options: [
          { label: "Small", value: "small" },
          { label: "Medium", value: "medium" },
          { label: "Large", value: "large" },
        ],
      },
      style: styleField as Fields<ChartBlockProps>["style"],
    },
    resolveFields: (data, { fields }) => {
      const t = data.props.chartType;
      const donut = t === "donut";
      return omit(fields, [
        ...formatOmissions(data.props),
        isSequential(t) && "sort",
        isPartToWhole(t) && "showValues",
        !isPartToWhole(t) && "showLegend",
        !donut && "donutCenter",
        (!donut || data.props.donutCenter !== "custom") && "centerText",
        (!donut || data.props.donutCenter === "none") && "centerLabel",
        (isPartToWhole(t) || t === "horizontalBar") && "height",
      ]);
    },
    defaultProps: {
      chartType: "bar",
      title: "",
      description: "",
      rows: [],
      sort: "original",
      ...formatDefaults,
      showValues: true,
      showLegend: true,
      donutCenter: "total",
      centerText: "",
      centerLabel: "",
      height: "medium",
      style: DEFAULT_STYLE_CONFIG,
    },
    render: ({ puck, ...p }) => <ChartRender {...p} editing={puck.isEditing} />,
  };

  return { AnimatedCounter, ProgressBar, ProgressRing, Chart };
}

/** Registry order inside the Data & Metrics category. */
export const DATA_METRICS_BLOCKS = ["Stats", "AnimatedCounter", "ProgressBar", "ProgressRing", "Chart"] as const;
