import { PlanMetrics } from "../analyzer/plan-analyzer";

export interface ComparisonResult {
  executionTimeDiffMs: number;
  improvementPercent: number;
  costDiff: number;
  costReductionPercent: number;
}

export function compareMetrics(before: PlanMetrics, after: PlanMetrics): ComparisonResult {
  const executionTimeDiffMs = before.executionTimeMs - after.executionTimeMs;
  const improvementPercent = before.executionTimeMs > 0
    ? Math.max(0, Number(((executionTimeDiffMs / before.executionTimeMs) * 100).toFixed(1)))
    : 0;

  const costDiff = before.totalCost - after.totalCost;
  const costReductionPercent = before.totalCost > 0
    ? Math.max(0, Number(((costDiff / before.totalCost) * 100).toFixed(1)))
    : 0;

  return {
    executionTimeDiffMs,
    improvementPercent,
    costDiff,
    costReductionPercent,
  };
}
