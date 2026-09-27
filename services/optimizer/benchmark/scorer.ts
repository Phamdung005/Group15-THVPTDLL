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
  const baseTime = baseline.executionTimeMs;
  const candTime = candidateBenchmark.executionTimeMs;

  // 1. Đối với Baseline: Điểm cải thiện cơ sở là 0
  if (candidate.id === "cand-baseline") {
    return {
      candidateId: candidate.id,
      timeImprovementPercent: 0,
      readReductionPercent: 0,
      costReductionPercent: 0,
      totalScore: 0,
    };
  }

  // 2. Tính % cải thiện thời gian thực thi:
  // Nếu chậm hơn baseline (candTime > baseTime), giá trị là số âm
  let timeImprovementPercent = 0;
  if (baseTime > 0) {
    timeImprovementPercent = Number((((baseTime - candTime) / baseTime) * 100).toFixed(1));
  }

  // 3. Tính % cải thiện đọc đĩa (I/O Blocks):
  // CHỈ tính khi baseline thực sự có đọc đĩa (> 0). Nếu cả hai đều đọc 0 block từ đĩa thì cải thiện là 0%.
  let readReductionPercent = 0;
  if (baseline.sharedReadBlocks > 0) {
    const readDiff = baseline.sharedReadBlocks - candidateBenchmark.sharedReadBlocks;
    readReductionPercent = Number(((readDiff / baseline.sharedReadBlocks) * 100).toFixed(1));
  }

  // 4. Tính % cải thiện chi phí lập kế hoạch (Cost):
  let costReductionPercent = 0;
  if (baseline.totalCost > 0) {
    const costDiff = baseline.totalCost - candidateBenchmark.totalCost;
    costReductionPercent = Number(((costDiff / baseline.totalCost) * 100).toFixed(1));
  }

  // 5. Chi phí phạt khi tạo thêm Index (tránh tạo index thừa không cần thiết):
  // Mỗi index tạo mới bị phạt 1.5 điểm
  const indexCount = candidate.changes.filter((c) => c.type === "CREATE_INDEX").length;
  const indexOverheadPenalty = indexCount * 1.5;

  // 6. Tổng điểm chuẩn hóa:
  // 60% Thời gian, 25% Đọc đĩa I/O, 15% Chi phí planner - Phạt Index
  const totalScore = Number(
    (
      0.6 * timeImprovementPercent +
      0.25 * readReductionPercent +
      0.15 * costReductionPercent -
      indexOverheadPenalty
    ).toFixed(2)
  );

  return {
    candidateId: candidate.id,
    timeImprovementPercent,
    readReductionPercent,
    costReductionPercent,
    totalScore,
  };
}

