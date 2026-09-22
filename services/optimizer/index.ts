import { pool } from "../../apps/backend/src/db";
import { getEstimatedPlan, PlanNode, BenchmarkMetrics } from "./analyzer/planAnalyzer";
import { analyzeColumnRoles, AnalyzedColumn } from "./analyzer/columnRoleAnalyzer";
import { isIndexCovered } from "./analyzer/schemaAnalyzer";
import { checkSelectStarRule } from "./rules/selectStarRule";
import { checkFunctionOnColumnRule } from "./rules/functionColumnRule";
import {
  buildOptimizationCandidates,
  OptimizationCandidate,
  ProposedIndex,
} from "./optimizer/candidateGenerator";
import { validateCandidate } from "./optimizer/candidateValidator";
import { benchmarkCandidateIsolated } from "./benchmark/executor";
import { compareCandidates, ComparisonResult } from "./benchmark/comparator";
import { applyCandidateAction, rollbackLatestAction } from "./history/historyService";

export interface BottleneckItem {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggestedFix?: string;
  table?: string;
}

export interface RecommendationItem {
  id: string;
  type: string;
  action: string;
  sqlCommand?: string;
  explanation: string;
}

export interface OptimizationResponseDTO {
  queryId: string;
  timestamp: string;
  dataset: {
    name: string;
    totalRows: number;
  };
  originalQuery: string;
  analysis: {
    columnRoles: AnalyzedColumn[];
    tables: string[];
    hasAggregation: boolean;
    hasSort: boolean;
  };
  planTree: PlanNode;
  candidates: OptimizationCandidate[];
  comparison: ComparisonResult;
  bestCandidate: OptimizationCandidate;
  metrics: {
    baseline: BenchmarkMetrics;
    best: BenchmarkMetrics;
    improvementPercent: number;
    readReductionPercent: number;
    costReductionPercent: number;
  };
}

export type OptimizationResponse = OptimizationResponseDTO;

/**
 * MASTER ORCHESTRATOR: Plan-Driven Optimization Advisor & Candidate Optimizer
 */
export async function analyzeAndOptimizeSQL(sql: string): Promise<OptimizationResponseDTO> {
  const cleanSql = sql.trim();

  // 1. STAGE: SECURITY CHECK (Chỉ cho phép SELECT / EXPLAIN, chặn toàn bộ lệnh ghi DML/DDL)
  if (/^\s*(DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER|CREATE)\b/i.test(cleanSql)) {
    const err: any = new Error("Hệ thống chỉ hỗ trợ phân tích các truy vấn đọc (SELECT / EXPLAIN). Các lệnh DDL/DML ghi bị từ chối vì lý do an toàn.");
    err.stage = "SECURITY";
    throw err;
  }

  // 2. STAGE: PARSER CHECK (Kiểm tra cú pháp SQL cơ bản)
  if (/\bWHERE\s*;/i.test(cleanSql) || /\bFROM\s*;/i.test(cleanSql) || /;\s*;/i.test(cleanSql)) {
    const err: any = new Error("Cú pháp SQL không hợp lệ. Vui lòng kiểm tra lại vị trí dấu chấm phẩy hoặc mệnh đề WHERE.");
    err.stage = "PARSER";
    throw err;
  }

  // 3. STAGE: PURE EXPLAIN (FORMAT JSON) - AN TOÀN TUYỆT ĐỐI, KHÔNG CHẠY QUERY THẬT
  let estimatedPlanResult;
  try {
    estimatedPlanResult = await getEstimatedPlan(cleanSql);
  } catch (err: any) {
    if (err.message && err.message.includes("does not exist")) {
      const schemaErr: any = new Error(`Bảng hoặc quan hệ trong truy vấn không tồn tại trong CSDL (${err.message})`);
      schemaErr.stage = "SCHEMA";
      throw schemaErr;
    }
    throw err;
  }

  // 4. STAGE: COLUMN ROLES & QUERY STRUCTURE
  const queryStructure = analyzeColumnRoles(cleanSql);

  // 5. STAGE: QUERY REWRITE RULES (Projection Pruning & Range Rewrite)
  const selectStarRes = checkSelectStarRule(cleanSql);
  const funcRes = checkFunctionOnColumnRule(cleanSql);

  let rewrittenSql: string | undefined = undefined;
  let rewriteReason: string | undefined = undefined;

  if (funcRes.rewrittenSql) {
    rewrittenSql = funcRes.rewrittenSql;
    rewriteReason = "Viết lại điều kiện hàm thời gian thành so sánh phạm vi hằng số (Range Predicate)";
  }
  if (selectStarRes.rewrittenSql) {
    const baseToRewrite = rewrittenSql || cleanSql;
    const starResult = checkSelectStarRule(baseToRewrite);
    if (starResult.rewrittenSql) {
      rewrittenSql = starResult.rewrittenSql;
      rewriteReason = rewriteReason
        ? `${rewriteReason} + Thu gọn danh sách cột chiếu (Column Pruning)`
        : "Thu gọn danh sách cột chiếu (Column Pruning)";
    }
  }

  // 6. STAGE: PROPOSED INDEXES DỰA TRÊN CATALOG CHECK & PLAN NODES
  // Chỉ xét các bảng có node Seq Scan trong Plan gốc
  const singleIndexes: ProposedIndex[] = [];
  const compositeIndexes: ProposedIndex[] = [];

  for (const table of estimatedPlanResult.seqScanTables) {
    // Lấy các cột lọc và nối của bảng này (Loại trừ các cột AGGREGATE)
    const joinCols = queryStructure.columns
      .filter((c) => c.tableName === table && c.role === "JOIN")
      .map((c) => c.columnName);

    const equalCols = queryStructure.columns
      .filter((c) => c.tableName === table && c.role === "FILTER_EQUAL")
      .map((c) => c.columnName);

    const rangeCols = queryStructure.columns
      .filter((c) => c.tableName === table && c.role === "FILTER_RANGE")
      .map((c) => c.columnName);

    // 6a. Kiểm tra đề xuất Single Index (Ưu tiên cột JOIN hoặc cột lọc bằng)
    const candidateSingleCol = joinCols[0] || equalCols[0] || rangeCols[0];
    if (candidateSingleCol) {
      const coverage = await isIndexCovered(table, [candidateSingleCol]);
      if (!coverage.covered) {
        const idxName = `idx_${table}_${candidateSingleCol}`;
        singleIndexes.push({
          tableName: table,
          columns: [candidateSingleCol],
          type: "SINGLE",
          ddl: `CREATE INDEX ${idxName} ON ${table}(${candidateSingleCol});`,
          rollbackDdl: `DROP INDEX IF EXISTS ${idxName};`,
        });
      }
    }

    // 6b. Kiểm tra đề xuất Composite Index: Thứ tự [Equality] -> [Range]
    const compositeCols = Array.from(new Set([...equalCols, ...rangeCols]));
    if (compositeCols.length > 1) {
      const coverage = await isIndexCovered(table, compositeCols);
      if (!coverage.covered) {
        const idxName = `idx_${table}_${compositeCols.join("_")}`;
        compositeIndexes.push({
          tableName: table,
          columns: compositeCols,
          type: "COMPOSITE",
          ddl: `CREATE INDEX ${idxName} ON ${table}(${compositeCols.join(", ")});`,
          rollbackDdl: `DROP INDEX IF EXISTS ${idxName};`,
        });
      }
    }
  }

  // 7. STAGE: BUILD OPTIMIZATION CANDIDATES (Hoàn toàn trung lập, không gán Best trước)
  const candidates = buildOptimizationCandidates({
    originalSql: cleanSql,
    rewrittenSql,
    rewriteReason,
    singleIndexes,
    compositeIndexes,
  });

  // 8. STAGE: CANDIDATE VALIDATOR (Kiểm tra an toàn trước khi đo đạc)
  const validCandidates = candidates.filter((c) => {
    const val = validateCandidate(c);
    if (!val.valid) {
      console.warn(`[Validator] Bỏ qua candidate ${c.id}:`, val.reason);
    }
    return val.valid;
  });

  // 9. STAGE: BENCHMARK ENGINE VỚI CANDIDATE ISOLATION
  // (Mỗi Candidate được: Apply -> Warm-up 1 -> Đo 3 lấy Median -> Rollback về Baseline sạch)
  for (const cand of validCandidates) {
    cand.benchmark = await benchmarkCandidateIsolated(cand);
  }

  // 10. STAGE: COMPARATOR & SCORER (Tính điểm chuẩn hóa và chọn Best Candidate)
  const baselineCandidate = validCandidates.find((c) => c.id === "cand-baseline") || validCandidates[0];
  const baselineMetrics = baselineCandidate.benchmark || {
    executionTimeMs: 100,
    planningTimeMs: 1,
    totalCost: estimatedPlanResult.totalCost,
    sharedHitBlocks: 100,
    sharedReadBlocks: 100,
  };

  const comparison = compareCandidates(baselineMetrics, validCandidates);
  const bestCandidate = comparison.bestCandidate;
  const bestMetrics = bestCandidate.benchmark || baselineMetrics;

  const timeDiff = Math.max(0, baselineMetrics.executionTimeMs - bestMetrics.executionTimeMs);
  const improvementPercent = baselineMetrics.executionTimeMs > 0
    ? Number(((timeDiff / baselineMetrics.executionTimeMs) * 100).toFixed(1))
    : 0;

  const readDiff = Math.max(0, baselineMetrics.sharedReadBlocks - bestMetrics.sharedReadBlocks);
  const readReductionPercent = baselineMetrics.sharedReadBlocks > 0
    ? Number(((readDiff / baselineMetrics.sharedReadBlocks) * 100).toFixed(1))
    : 0;

  const costDiff = Math.max(0, baselineMetrics.totalCost - bestMetrics.totalCost);
  const costReductionPercent = baselineMetrics.totalCost > 0
    ? Number(((costDiff / baselineMetrics.totalCost) * 100).toFixed(1))
    : 0;

  return {
    queryId: "opt-" + Date.now(),
    timestamp: new Date().toISOString(),
    dataset: {
      name: "bigdata_optimizer",
      totalRows: 750000,
    },
    originalQuery: cleanSql,
    analysis: {
      columnRoles: queryStructure.columns,
      tables: queryStructure.tables,
      hasAggregation: queryStructure.hasAggregation,
      hasSort: queryStructure.hasSort,
    },
    planTree: estimatedPlanResult.planTree,
    candidates: validCandidates,
    comparison,
    bestCandidate,
    metrics: {
      baseline: baselineMetrics,
      best: bestMetrics,
      improvementPercent,
      readReductionPercent,
      costReductionPercent,
    },
  };
}

export { applyCandidateAction, rollbackLatestAction };
