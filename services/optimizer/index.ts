import { pool } from "../../apps/backend/src/db";
import { getEstimatedPlan, PlanNode, BenchmarkMetrics } from "./analyzer/planAnalyzer";
import { analyzeColumnRoles, AnalyzedColumn } from "./analyzer/columnRoleAnalyzer";
import { isIndexCovered } from "./analyzer/schemaAnalyzer";
import { checkSelectStarRule } from "./rules/selectStarRule";
import { checkFunctionOnColumnRule } from "./rules/functionColumnRule";
import { checkJoinRule } from "./rules/joinRule";
import { checkPartitionRule } from "./rules/partitionRule";
import {
  buildOptimizationCandidates,
  OptimizationCandidate,
  ProposedIndex,
} from "./optimizer/candidateGenerator";
import { validateCandidate } from "./optimizer/candidateValidator";
import { benchmarkCandidateIsolated } from "./benchmark/executor";
import { compareCandidates, ComparisonResult } from "./benchmark/comparator";
import {
  applyCandidateAction,
  rollbackLatestAction,
  getOptimizationHistory,
} from "./history/historyService";

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
  bottlenecks: BottleneckItem[];
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
export async function analyzeAndOptimizeSQL(
  sql: string,
  rule: string = "all"
): Promise<OptimizationResponseDTO> {
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

    // 6c. Kiểm tra đề xuất Covering Index (INCLUDE) cho bảng có JOIN và AGGREGATE
    const aggCols = queryStructure.columns
      .filter((c) => c.tableName === table && c.role === "AGGREGATE")
      .map((c) => c.columnName);

    if (candidateSingleCol && aggCols.length > 0) {
      const idxName = `idx_${table}_cov_${candidateSingleCol}`;
      const ddl = `CREATE INDEX ${idxName} ON ${table}(${candidateSingleCol}) INCLUDE (${aggCols.join(", ")});`;
      compositeIndexes.push({
        tableName: table,
        columns: [candidateSingleCol, ...aggCols],
        type: "COMPOSITE",
        ddl,
        rollbackDdl: `DROP INDEX IF EXISTS ${idxName};`,
      });
    }
  }


  // 7. STAGE: BUILD OPTIMIZATION CANDIDATES (Hoàn toàn trung lập, không gán Best trước)
  let candidates = buildOptimizationCandidates({
    originalSql: cleanSql,
    rewrittenSql,
    rewriteReason,
    singleIndexes,
    compositeIndexes,
  });

  // Lọc Candidates theo Rule nếu người dùng chọn cụ thể
  if (rule === "index_pushdown") {
    candidates = candidates.filter((c) =>
      ["BASELINE", "SINGLE_INDEX", "COMPOSITE_INDEX"].includes(c.strategy)
    );
  } else if (rule === "cte_inline" || rule === "join_reorder") {
    candidates = candidates.filter((c) =>
      ["BASELINE", "REWRITE", "COMBINED"].includes(c.strategy)
    );
  }

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
    executionTimeMs: 0,
    planningTimeMs: 0,
    totalCost: estimatedPlanResult.totalCost,
    sharedHitBlocks: 0,
    sharedReadBlocks: 0,
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

  // Lấy metadata động của Database đang hoạt động
  let currentDbName = "bigdata_optimizer";
  let totalDbRows = 0;
  try {
    const dbRes = await pool.query("SELECT current_database() AS db_name;");
    currentDbName = dbRes.rows[0]?.db_name || currentDbName;
    const rowRes = await pool.query("SELECT COALESCE(SUM(n_live_tup), 0) AS total_rows FROM pg_stat_user_tables;");
    totalDbRows = Number(rowRes.rows[0]?.total_rows || 0);
  } catch {}

  // 11. STAGE: THU THẬP TẤT CẢ ĐIỂM NGHẼN (BOTTLENECKS)
  const bottlenecks: BottleneckItem[] = [];

  // a. Điểm nghẽn từ SELECT *
  if (selectStarRes.bottleneck) {
    bottlenecks.push(selectStarRes.bottleneck);
  }

  // b. Điểm nghẽn từ hàm trên cột (Non-sargable function)
  if (funcRes.bottleneck) {
    bottlenecks.push(funcRes.bottleneck);
  }

  // c. Điểm nghẽn từ phép JOIN
  const joinRes = checkJoinRule(cleanSql);
  if (joinRes.bottleneck) {
    bottlenecks.push(joinRes.bottleneck);
  }

  // d. Điểm nghẽn từ Cây kế hoạch (Seq Scan, Nested Loop, Sort Disk)
  for (const b of estimatedPlanResult.bottlenecks) {
    if (b.type === "FULL_SCAN_AGGREGATION") {
      bottlenecks.push({
        id: `bot-plan-fullscan-${b.tableName || "node"}`,
        severity: "low",
        title: `Quét Khối Tuần Tự (Seq Scan) tổng hợp trên \`${b.tableName}\``,
        description: b.description,
        table: b.tableName,
        suggestedFix: "Do câu lệnh tính toán trên 100% dữ liệu không có WHERE, CSDL dùng Sequential Scan để tối đa tốc độ đọc I/O. Với Big Data cực lớn, giải pháp là dùng Materialized View hoặc Covering Index.",
      });
    } else {
      bottlenecks.push({
        id: `bot-plan-${b.type.toLowerCase()}-${b.tableName || "node"}`,
        severity: b.type === "SEQ_SCAN" ? "high" : "medium",
        title: b.type === "SEQ_SCAN"
          ? `Quét Toàn Bảng do thiếu Index trên \`${b.tableName}\``
          : (b.type === "NESTED_LOOP" ? "Vòng lặp lồng (Nested Loop) chi phí cao" : "Thao tác sắp xếp tràn ra đĩa (Sort Disk)"),
        description: b.description,
        table: b.tableName,
      });
    }
  }


  // e. Điểm nghẽn từ quy mô bảng lớn
  for (const table of queryStructure.tables) {
    const partRes = checkPartitionRule(totalDbRows, table);
    if (partRes.bottleneck) {
      bottlenecks.push(partRes.bottleneck);
    }
  }

  return {
    queryId: "opt-" + Date.now(),
    timestamp: new Date().toISOString(),
    dataset: {
      name: currentDbName,
      totalRows: totalDbRows,
    },
    originalQuery: cleanSql,
    analysis: {
      columnRoles: queryStructure.columns,
      tables: queryStructure.tables,
      hasAggregation: queryStructure.hasAggregation,
      hasSort: queryStructure.hasSort,
    },
    bottlenecks,
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


export { applyCandidateAction, rollbackLatestAction, getOptimizationHistory };

