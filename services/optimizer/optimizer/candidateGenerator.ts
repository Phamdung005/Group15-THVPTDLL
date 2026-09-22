export interface OptimizationChange {
  type: "QUERY_REWRITE" | "CREATE_INDEX" | "SET_CONFIG";
  action: string;
  targetTable?: string;
  columns?: string[];
  sqlCommand?: string;
  rollbackCommand?: string;
}

export interface OptimizationCandidate {
  id: string;
  name: string;
  strategy: "BASELINE" | "REWRITE" | "SINGLE_INDEX" | "COMPOSITE_INDEX" | "COMBINED";
  description: string;
  sql: string;
  changes: OptimizationChange[];
  benchmark?: {
    executionTimeMs: number;
    planningTimeMs: number;
    totalCost: number;
    sharedHitBlocks: number;
    sharedReadBlocks: number;
  };
  score?: number;
  isBest?: boolean;
}

export interface ProposedIndex {
  tableName: string;
  columns: string[];
  type: "SINGLE" | "COMPOSITE";
  ddl: string;
  rollbackDdl: string;
}

/**
 * Sinh danh sách các phương án ứng viên (Candidates) hoàn toàn trung lập.
 * Tuyệt đối KHÔNG gán bất kỳ phương án nào là "Best" trước khi Benchmark.
 */
export function buildOptimizationCandidates(params: {
  originalSql: string;
  rewrittenSql?: string;
  rewriteReason?: string;
  singleIndexes: ProposedIndex[];
  compositeIndexes: ProposedIndex[];
}): OptimizationCandidate[] {
  const { originalSql, rewrittenSql, rewriteReason, singleIndexes, compositeIndexes } = params;
  const candidates: OptimizationCandidate[] = [];

  // 1. CANDIDATE BASELINE (Câu SQL gốc, không áp dụng thay đổi gì)
  candidates.push({
    id: "cand-baseline",
    name: "Baseline (Câu SQL Gốc)",
    strategy: "BASELINE",
    description: "Trạng thái nguyên bản do người dùng nhập vào, chưa áp dụng bất kỳ thay đổi nào.",
    sql: originalSql,
    changes: [],
    isBest: false,
  });

  // 2. CANDIDATE REWRITE (Nếu có chuyển đổi câu truy vấn: Projection Pruning hoặc Range Rewrite)
  if (rewrittenSql && rewrittenSql.trim() !== originalSql.trim()) {
    candidates.push({
      id: "cand-rewrite",
      name: "Candidate A (Query Rewrite)",
      strategy: "REWRITE",
      description: rewriteReason || "Tối ưu hóa câu truy vấn: Column Pruning hoặc viết lại điều kiện khoảng (Range Predicate).",
      sql: rewrittenSql,
      changes: [
        {
          type: "QUERY_REWRITE",
          action: "Viết lại cấu trúc SQL",
          sqlCommand: rewrittenSql,
        },
      ],
      isBest: false,
    });
  }

  // 3. CANDIDATE SINGLE INDEX (Nếu có đề xuất Index đơn lẻ)
  if (singleIndexes.length > 0) {
    const changes: OptimizationChange[] = singleIndexes.map((idx) => ({
      type: "CREATE_INDEX",
      action: `Tạo Single Index trên ${idx.tableName}(${idx.columns.join(", ")})`,
      targetTable: idx.tableName,
      columns: idx.columns,
      sqlCommand: idx.ddl,
      rollbackCommand: idx.rollbackDdl,
    }));

    candidates.push({
      id: "cand-single-idx",
      name: "Candidate B (Single Index)",
      strategy: "SINGLE_INDEX",
      description: `Áp dụng Index đơn lẻ trên các cột khóa ngoại / lọc: ${singleIndexes.map((i) => `${i.tableName}(${i.columns.join(", ")})`).join("; ")}.`,
      sql: originalSql,
      changes,
      isBest: false,
    });
  }

  // 4. CANDIDATE COMPOSITE INDEX (Nếu có đề xuất Composite Index)
  if (compositeIndexes.length > 0) {
    const changes: OptimizationChange[] = compositeIndexes.map((idx) => ({
      type: "CREATE_INDEX",
      action: `Tạo Composite Index trên ${idx.tableName}(${idx.columns.join(", ")})`,
      targetTable: idx.tableName,
      columns: idx.columns,
      sqlCommand: idx.ddl,
      rollbackCommand: idx.rollbackDdl,
    }));

    candidates.push({
      id: "cand-composite-idx",
      name: "Candidate C (Composite Index)",
      strategy: "COMPOSITE_INDEX",
      description: `Áp dụng Composite Index tối ưu thứ tự cột: ${compositeIndexes.map((i) => `${i.tableName}(${i.columns.join(", ")})`).join("; ")}.`,
      sql: originalSql,
      changes,
      isBest: false,
    });
  }

  // 5. CANDIDATE COMBINED (Kết hợp Rewrite + Index tối ưu nhất)
  const bestIndexes = compositeIndexes.length > 0 ? compositeIndexes : singleIndexes;
  if ((rewrittenSql && rewrittenSql.trim() !== originalSql.trim()) && bestIndexes.length > 0) {
    const combinedChanges: OptimizationChange[] = [
      {
        type: "QUERY_REWRITE",
        action: "Viết lại cấu trúc SQL",
        sqlCommand: rewrittenSql,
      },
      ...bestIndexes.map((idx) => ({
        type: "CREATE_INDEX" as const,
        action: `Tạo Index trên ${idx.tableName}(${idx.columns.join(", ")})`,
        targetTable: idx.tableName,
        columns: idx.columns,
        sqlCommand: idx.ddl,
        rollbackCommand: idx.rollbackDdl,
      })),
    ];

    candidates.push({
      id: "cand-combined",
      name: "Candidate D (Rewrite + Index Kết Hợp)",
      strategy: "COMBINED",
      description: "Kết hợp toàn diện giữa chuyển đổi cú pháp truy vấn và tạo Index chuyên dụng.",
      sql: rewrittenSql,
      changes: combinedChanges,
      isBest: false,
    });
  }

  return candidates;
}
