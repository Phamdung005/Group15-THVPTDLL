import { OptimizationCandidate } from "../optimizer/candidateGenerator";
import { calculateCandidateScore, CandidateScore } from "./scorer";
import { BenchmarkMetrics } from "../analyzer/planAnalyzer";

export interface ComparisonResult {
  bestCandidateId: string;
  bestCandidate: OptimizationCandidate;
  scores: Record<string, CandidateScore>;
  reason: string;
  isAlreadyOptimal: boolean;
}

/**
 * So sánh kết quả Benchmark thực nghiệm của toàn bộ Candidate để chọn ra phương án tối ưu nhất.
 * Xử lý rõ ràng trường hợp "Query Already Optimal" nếu không có candidate nào cải thiện đáng kể (> 5%).
 */
export function compareCandidates(
  baseline: BenchmarkMetrics,
  candidates: OptimizationCandidate[]
): ComparisonResult {
  const scores: Record<string, CandidateScore> = {};

  // Đánh giá mức độ hiệu năng nền tảng (Base Efficiency Rating):
  // Nếu câu truy vấn gốc vốn dĩ đã cực nhanh (< 20ms và không đọc đĩa), mốc gốc là 85 điểm.
  // Nếu câu truy vấn gốc chậm hoặc tốn I/O, mốc gốc là 25 điểm.
  const isBaselineFast = baseline.executionTimeMs < 20 && baseline.sharedReadBlocks === 0;
  const baselineBaseScore = isBaselineFast ? 85 : 25;

  let bestCandidateId = "cand-baseline";
  let maxScore = baselineBaseScore;

  for (const cand of candidates) {
    if (!cand.benchmark) continue;
    const scoreObj = calculateCandidateScore(baseline, cand.benchmark, cand);
    scores[cand.id] = scoreObj;

    if (cand.id === "cand-baseline") {
      cand.score = baselineBaseScore;
    } else {
      // Điểm của Candidate = Baseline Base Score + Cải thiện ròng (Net Score)
      const candFinalScore = Math.min(
        100,
        Math.max(5, Number((baselineBaseScore + scoreObj.totalScore).toFixed(1)))
      );
      cand.score = candFinalScore;

      // Candidate chỉ thắng khi điểm thực tế cao hơn điểm của Baseline VÀ cao hơn các candidate trước
      // Đồng thời thời gian thực thi KHÔNG được chậm hơn Baseline
      if (candFinalScore > maxScore && scoreObj.timeImprovementPercent >= 0) {
        maxScore = candFinalScore;
        bestCandidateId = cand.id;
      }
    }
  }

  // Nếu không có candidate nào vượt qua điểm Baseline, chọn Baseline
  const isAlreadyOptimal = bestCandidateId === "cand-baseline";
  const bestCandidate = candidates.find((c) => c.id === bestCandidateId) || candidates[0];

  candidates.forEach((c) => {
    c.isBest = c.id === bestCandidateId;
  });

  const reason = isAlreadyOptimal
    ? "Truy vấn đã đạt hiệu năng tối ưu sẵn trên CSDL (Query Already Optimal). Cấu hình hiện tại đạt điểm cao nhất, các phương án khác không đem lại cải thiện rõ rệt."
    : `Phương án \`${bestCandidate.name}\` đạt điểm hiệu năng cao nhất (${bestCandidate.score}/100) với mức giảm thời gian ${scores[bestCandidateId]?.timeImprovementPercent}% và giảm đọc bộ nhớ ${scores[bestCandidateId]?.readReductionPercent}%.`;

  return {
    bestCandidateId,
    bestCandidate,
    scores,
    reason,
    isAlreadyOptimal,
  };
}


