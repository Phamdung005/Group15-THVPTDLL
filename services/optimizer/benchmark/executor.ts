import { pool } from "../../../apps/backend/src/db";
import { executePlanAnalyze, BenchmarkMetrics } from "../analyzer/planAnalyzer";
import { OptimizationCandidate } from "../optimizer/candidateGenerator";

function getMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

/**
 * Benchmark một Candidate trong môi trường ĐỘC LẬP HOÀN TOÀN (Candidate Isolation):
 * 1. Áp dụng các thay đổi DDL của Candidate (ngoài transaction block).
 * 2. Chạy Warm-up 1 lần (loại bỏ nhiễu cold cache).
 * 3. Chạy đo đạc 3 lần liên tiếp.
 * 4. Tính toán Median (Trung vị) để giảm thiểu ảnh hưởng của biến động môi trường và outlier.
 * 5. ROLLBACK ngay lập tức để trả CSDL về BASELINE sạch sẽ cho Candidate tiếp theo!
 */
export async function benchmarkCandidateIsolated(
  candidate: OptimizationCandidate
): Promise<BenchmarkMetrics> {
  const ddlChanges = candidate.changes.filter((c) => c.type === "CREATE_INDEX" && c.sqlCommand);
  const rollbackChanges = candidate.changes.filter((c) => c.rollbackCommand);

  // 1. ÁP DỤNG THAY ĐỔI CỦA CANDIDATE (Tạo Index tạm thời ngoài transaction)
  for (const change of ddlChanges) {
    if (change.sqlCommand) {
      try {
        const safeSql = change.sqlCommand.replace(/CREATE\s+INDEX/i, "CREATE INDEX IF NOT EXISTS");
        await pool.query(safeSql);
      } catch (err: any) {
        console.warn(`[BenchmarkExecutor] Lỗi khi tạm tạo index cho ${candidate.id}:`, err.message);
      }
    }
  }

  const times: number[] = [];
  const planningTimes: number[] = [];
  const hits: number[] = [];
  const reads: number[] = [];
  let totalCost = 0;

  try {
    // 2. WARM-UP 1 LẦN (Không tính điểm vào kết quả)
    try {
      await executePlanAnalyze(candidate.sql, false);
    } catch {}

    // 3. CHẠY ĐO ĐẠC 3 LẦN LIÊN TIẾP
    for (let i = 0; i < 3; i++) {
      const metric = await executePlanAnalyze(candidate.sql, false);
      times.push(metric.executionTimeMs);
      planningTimes.push(metric.planningTimeMs);
      hits.push(metric.sharedHitBlocks);
      reads.push(metric.sharedReadBlocks);
      totalCost = metric.totalCost;
    }
  } finally {
    // 4. ROLLBACK NGAY LẬP TỨC VỀ BASELINE TRƯỚC KHI TRẢ KẾT QUẢ
    for (const change of rollbackChanges) {
      if (change.rollbackCommand) {
        try {
          await pool.query(change.rollbackCommand);
        } catch (err: any) {
          console.warn(`[BenchmarkExecutor] Lỗi khi rollback index cho ${candidate.id}:`, err.message);
        }
      }
    }
  }

  // 5. TÍNH TOÁN GIÁ TRỊ TRUNG VỊ (MEDIAN)
  return {
    executionTimeMs: getMedian(times),
    planningTimeMs: getMedian(planningTimes),
    totalCost,
    sharedHitBlocks: Math.round(getMedian(hits)),
    sharedReadBlocks: Math.round(getMedian(reads)),
  };
}
