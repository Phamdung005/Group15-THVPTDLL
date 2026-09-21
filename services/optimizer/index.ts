import { pool } from "../../apps/backend/src/db";
import { executePlanAnalyze } from "./analyzer/plan-analyzer";
import { checkSelectStarRule } from "./rules/select-star.rule";
import { checkMissingIndexRule } from "./rules/missing-index.rule";

export interface BottleneckItem {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  table?: string;
  suggestedFix?: string;
}

export interface RecommendationItem {
  id: string;
  type: "index" | "rewrite" | "config";
  action: string;
  sqlCommand?: string;
  explanation: string;
}

export interface CandidateQuery {
  id: string;
  name: string;
  description: string;
  sql: string;
  isBest: boolean;
  executionTimeMs: number;
  queryCost: number;
}

export interface PerformanceMetrics {
  executionTime: {
    beforeMs: number;
    afterMs: number;
    improvementPercent: number;
  };
  queryCost: {
    before: number;
    after: number;
    reductionPercent: number;
  };
  bufferReads: {
    sharedHitsBefore: number;
    sharedHitsAfter: number;
    sharedReadsBefore: number;
    sharedReadsAfter: number;
  };
  planningTime: {
    beforeMs: number;
    afterMs: number;
  };
}

export interface OptimizationResponse {
  queryId: string;
  timestamp: string;
  dataset: {
    name: string;
    totalRows: number;
  };
  originalQuery: string;
  suggestedQuery: string;
  candidates: CandidateQuery[];
  appliedRules: string[];
  bottlenecks: BottleneckItem[];
  recommendations: RecommendationItem[];
  metrics: PerformanceMetrics;
}

export async function analyzeAndOptimizeSQL(sql: string): Promise<OptimizationResponse> {
  // 1. Chạy EXPLAIN ANALYZE trên câu lệnh gốc (TRƯỚC TỐI ƯU)
  const beforeMetrics = await executePlanAnalyze(sql);

  // 2. Chạy Rule 1: Kiểm tra SELECT *
  const selectStarRes = checkSelectStarRule(sql);

  // 3. Chạy Rule 2: Kiểm tra Sequential Scan / Thiếu Index
  const missingIndexRes = checkMissingIndexRule(beforeMetrics.seqScanTables);

  // 4. Tổng hợp Bottlenecks & Recommendations
  const bottlenecks: BottleneckItem[] = [];
  const recommendations: RecommendationItem[] = [];
  const appliedRules: string[] = [];

  if (selectStarRes.bottleneck) {
    bottlenecks.push(selectStarRes.bottleneck);
    if (selectStarRes.recommendation) recommendations.push(selectStarRes.recommendation);
    appliedRules.push("SELECT Column Pushdown");
  }

  if (missingIndexRes.bottlenecks.length > 0) {
    bottlenecks.push(...missingIndexRes.bottlenecks);
    recommendations.push(...missingIndexRes.recommendations);
    appliedRules.push("Index Pushdown Recommendation");
  }

  // Nếu có gợi ý tạo Index, tạm thời tạo Index trong PostgreSQL để đo Benchmark SAU TỐI ƯU
  if (missingIndexRes.suggestedIndexes.length > 0) {
    for (const ddl of missingIndexRes.suggestedIndexes) {
      try {
        const safeDdl = ddl.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS");
        await pool.query(safeDdl);
      } catch (err: any) {
        console.warn("Lỗi khi tạm tạo Index benchmark:", err.message);
      }
    }
  }

  // 5. Xác định câu SQL đề xuất mới
  const suggestedSql = selectStarRes.rewrittenSql || sql;

  // 6. Chạy EXPLAIN ANALYZE trên câu lệnh đề xuất (SAU TỐI ƯU THẬT 100%)
  const afterMetrics = await executePlanAnalyze(suggestedSql);

  // 7. Tính phần trăm cải thiện
  const execTimeDiff = beforeMetrics.executionTimeMs - afterMetrics.executionTimeMs;
  const improvementPercent = beforeMetrics.executionTimeMs > 0
    ? Math.max(0, Number(((execTimeDiff / beforeMetrics.executionTimeMs) * 100).toFixed(1)))
    : 0;

  const costDiff = beforeMetrics.totalCost - afterMetrics.totalCost;
  const reductionPercent = beforeMetrics.totalCost > 0
    ? Math.max(0, Number(((costDiff / beforeMetrics.totalCost) * 100).toFixed(1)))
    : 0;

  // 8. Đóng gói danh sách Candidate Queries
  const candidates: CandidateQuery[] = [
    {
      id: "cand-orig",
      name: "Câu SQL Gốc (Chưa Tối Ưu)",
      description: "Câu truy vấn ban đầu do người dùng nhập vào.",
      sql: sql,
      isBest: false,
      executionTimeMs: beforeMetrics.executionTimeMs,
      queryCost: beforeMetrics.totalCost,
    },
    {
      id: "cand-best",
      name: "Phương án Tối Ưu Nhất (Viết lại SQL + Tạo Index)",
      description: "Phương án áp dụng toàn bộ các luật tối ưu và Index Scan.",
      sql: suggestedSql,
      isBest: true,
      executionTimeMs: afterMetrics.executionTimeMs,
      queryCost: afterMetrics.totalCost,
    }
  ];

  return {
    queryId: "opt-" + Date.now(),
    timestamp: new Date().toISOString(),
    dataset: {
      name: "e_commerce_db",
      totalRows: 750000,
    },
    originalQuery: sql,
    suggestedQuery: suggestedSql,
    candidates: candidates,
    appliedRules: appliedRules.length > 0 ? appliedRules : ["Standard Plan Checking"],
    bottlenecks: bottlenecks.length > 0 ? bottlenecks : [
      {
        id: "bot-0",
        severity: "low",
        title: "Chưa phát hiện điểm nghẽn nghiêm trọng",
        description: "Truy vấn có vẻ ổn định hoặc đã có Index phù hợp.",
      }
    ],
    recommendations: recommendations.length > 0 ? recommendations : [
      {
        id: "rec-0",
        type: "config",
        action: "Không cần thay đổi",
        explanation: "Cấu hình truy vấn hiện tại đã đạt hiệu năng phù hợp.",
      }
    ],
    metrics: {
      executionTime: {
        beforeMs: Number(beforeMetrics.executionTimeMs.toFixed(2)),
        afterMs: Number(afterMetrics.executionTimeMs.toFixed(2)),
        improvementPercent: improvementPercent,
      },
      queryCost: {
        before: Number(beforeMetrics.totalCost.toFixed(2)),
        after: Number(afterMetrics.totalCost.toFixed(2)),
        reductionPercent: reductionPercent,
      },
      bufferReads: {
        sharedHitsBefore: beforeMetrics.sharedHits,
        sharedHitsAfter: afterMetrics.sharedHits,
        sharedReadsBefore: beforeMetrics.sharedReads,
        sharedReadsAfter: afterMetrics.sharedReads,
      },
      planningTime: {
        beforeMs: Number(beforeMetrics.planningTimeMs.toFixed(2)),
        afterMs: Number(afterMetrics.planningTimeMs.toFixed(2)),
      },
    },
  };
}
