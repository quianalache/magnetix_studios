/**
 * Stage identity color (Visual Direction 2). Pipeline stages draw from the
 * categorical chart palette; custom stages rotate through it so every stage
 * gets a distinct, on-system color. Shared by the Dashboard pipeline
 * snapshot, the Pipelines overview and the board so a stage reads the same
 * everywhere. Display only — never stored.
 */
const STAGE_CHART_VAR: Record<string, number> = {
  new: 8,
  contacted: 4,
  qualified: 1,
  proposal: 5,
  won: 6,
  lost: 3,
};

export function stageColor(stageId: string, index: number): string {
  const n = STAGE_CHART_VAR[stageId] ?? (index % 8) + 1;
  return `var(--ds-chart-${n})`;
}
