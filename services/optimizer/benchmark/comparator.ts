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
  let bestCandidateId = "cand-baseline";
  let maxScore = -1;

  for (const cand of candidates) {
    if (!cand.benchmark) continue;
    const scoreObj = calculateCandidateScore(baseline, cand.benchmark, cand);
    scores[cand.id] = scoreObj;
    cand.score = scoreObj.totalScore;

    // Không xét baseline làm best nếu có candidate khác vượt trội
    if (cand.id !== "cand-baseline" && scoreObj.totalScore > maxScore) {
      maxScore = scoreObj.totalScore;
      bestCandidateId = cand.id;
    }
  }

  // Nếu không có candidate nào vượt quá 5 điểm cải thiện -> Câu truy vấn đã tối ưu sẵn
  const isAlreadyOptimal = maxScore < 5;
  if (isAlreadyOptimal) {
    bestCandidateId = "cand-baseline";
  }

  const bestCandidate = candidates.find((c) => c.id === bestCandidateId) || candidates[0];

  // Đánh dấu isBest chuẩn xác sau khi đã có kết quả benchmark thực nghiệm
  candidates.forEach((c) => {
    c.isBest = c.id === bestCandidateId;
  });

  const reason = isAlreadyOptimal
    ? "Truy vấn đã đạt hiệu năng tối ưu sẵn trên CSDL (Query Already Optimal). Không cần áp dụng thêm thay đổi."
    : `Phương án \`${bestCandidate.name}\` đạt điểm hiệu năng cao nhất (${bestCandidate.score} điểm) với mức giảm thời gian ${scores[bestCandidateId]?.timeImprovementPercent}% và giảm đọc bộ nhớ ${scores[bestCandidateId]?.readReductionPercent}%.`;

  return {
    bestCandidateId,
    bestCandidate,
    scores,
    reason,
    isAlreadyOptimal,
  };
}
