import { BenchmarkMetrics } from "../analyzer/planAnalyzer";
import { OptimizationCandidate } from "../optimizer/candidateGenerator";

export interface CandidateScore {
  candidateId: string;
  timeImprovementPercent: number;
  readReductionPercent: number;
  costReductionPercent: number;
  totalScore: number;
}

/**
 * Chuẩn hóa các chỉ số đo đạc (Normalized Metrics) và tính điểm tổng hợp cho từng Candidate.
 * Công thức:
 * Score = (0.5 * % Giảm Thời Gian) + (0.3 * % Giảm Đọc Đĩa) + (0.2 * % Giảm Cost) - (Phạt overhead số lượng Index)
 */
export function calculateCandidateScore(
  baseline: BenchmarkMetrics,
  candidateBenchmark: BenchmarkMetrics,
  candidate: OptimizationCandidate
): CandidateScore {
  const baseTime = Math.max(0.01, baseline.executionTimeMs);
  const baseReads = Math.max(1, baseline.sharedReadBlocks);
  const baseCost = Math.max(1, baseline.totalCost);

  // 1. Chuẩn hóa tỷ lệ cải thiện (0% đến 100%)
  const timeDiff = Math.max(0, baseTime - candidateBenchmark.executionTimeMs);
  const timeImprovementPercent = Number(((timeDiff / baseTime) * 100).toFixed(1));

  const readDiff = Math.max(0, baseReads - candidateBenchmark.sharedReadBlocks);
  const readReductionPercent = Number(((readDiff / baseReads) * 100).toFixed(1));

  const costDiff = Math.max(0, baseCost - candidateBenchmark.totalCost);
  const costReductionPercent = Number(((costDiff / baseCost) * 100).toFixed(1));

  // 2. Chi phí overhead ghi khi tạo thêm Index (tránh tạo index vô tội vạ)
  const indexCount = candidate.changes.filter((c) => c.type === "CREATE_INDEX").length;
  const indexOverheadPenalty = indexCount * 2.0;

  // 3. Tổng điểm chuẩn hóa
  const totalScore = Number(
    (
      0.5 * timeImprovementPercent +
      0.3 * readReductionPercent +
      0.2 * costReductionPercent -
      indexOverheadPenalty
    ).toFixed(2)
  );

  return {
    candidateId: candidate.id,
    timeImprovementPercent,
    readReductionPercent,
    costReductionPercent,
    totalScore: Math.max(0, totalScore),
  };
}
