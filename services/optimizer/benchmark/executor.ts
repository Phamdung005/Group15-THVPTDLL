import { executePlanAnalyze, PlanMetrics } from "../analyzer/plan-analyzer";

export async function runMultipleBenchmark(sql: string, runs: number = 2): Promise<PlanMetrics> {
  let metrics = await executePlanAnalyze(sql);
  for (let i = 1; i < runs; i++) {
    const next = await executePlanAnalyze(sql);
    metrics.executionTimeMs = Math.min(metrics.executionTimeMs, next.executionTimeMs);
  }
  return metrics;
}
