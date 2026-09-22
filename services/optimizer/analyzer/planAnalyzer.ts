import { pool } from "../../../apps/backend/src/db";

export interface PlanNode {
  nodeType: string;
  relationName?: string;
  alias?: string;
  filter?: string;
  indexName?: string;
  totalCost: number;
  planRows: number;
  actualRows?: number;
  actualTotalTime?: number;
  sortMethod?: string;
  sortSpaceType?: string;
  plans?: PlanNode[];
}

export interface PlanBottleneckNode {
  type: "SEQ_SCAN" | "NESTED_LOOP" | "SORT_DISK" | "HASH_AGGREGATE";
  tableName?: string;
  cost: number;
  description: string;
}

export interface EstimatedPlanResult {
  totalCost: number;
  planTree: PlanNode;
  seqScanTables: string[];
  bottlenecks: PlanBottleneckNode[];
}

export interface BenchmarkMetrics {
  executionTimeMs: number;
  planningTimeMs: number;
  totalCost: number;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
  planTree?: PlanNode;
}

/**
 * 1. TÁCH BIỆT: EXPLAIN (FORMAT JSON) thuần túy
 * Dùng để phân tích cấu trúc cây kế hoạch (Plan Tree) & điểm nghẽn ước lượng
 * AN TOÀN TUYỆT ĐỐI VÌ KHÔNG THỰC THI QUERY.
 */
export async function getEstimatedPlan(sql: string): Promise<EstimatedPlanResult> {
  const explainSql = `EXPLAIN (BUFFERS, FORMAT JSON) ${sql}`;
  const res = await pool.query(explainSql);
  const rawPlan = res.rows[0]["QUERY PLAN"][0]["Plan"];

  const seqScanTables: string[] = [];
  const bottlenecks: PlanBottleneckNode[] = [];

  function traverse(node: any): PlanNode {
    const nodeType = node["Node Type"] || "Node";
    const relName = node["Relation Name"];

    if (nodeType === "Seq Scan" && relName) {
      seqScanTables.push(relName.toLowerCase());
      bottlenecks.push({
        type: "SEQ_SCAN",
        tableName: relName.toLowerCase(),
        cost: node["Total Cost"] || 0,
        description: `Quét toàn bộ bảng \`${relName}\` do thiếu Index hoặc Planner không chọn Index.`,
      });
    }

    if (nodeType === "Nested Loop" && (node["Plan Rows"] > 1000 || node["Total Cost"] > 5000)) {
      bottlenecks.push({
        type: "NESTED_LOOP",
        cost: node["Total Cost"] || 0,
        description: `Vòng lặp lồng (Nested Loop) có chi phí cao khi duyệt nối bảng.`,
      });
    }

    if (nodeType === "Sort" && node["Sort Space Type"] === "Disk") {
      bottlenecks.push({
        type: "SORT_DISK",
        cost: node["Total Cost"] || 0,
        description: `Thao tác sắp xếp tràn ra ổ đĩa (External Merge Disk) do vượt quá work_mem.`,
      });
    }

    const children: PlanNode[] = [];
    if (node["Plans"] && Array.isArray(node["Plans"])) {
      node["Plans"].forEach((child: any) => children.push(traverse(child)));
    }

    return {
      nodeType,
      relationName: relName,
      alias: node["Alias"],
      filter: node["Filter"],
      indexName: node["Index Name"],
      totalCost: Number((node["Total Cost"] || 0).toFixed(1)),
      planRows: node["Plan Rows"] || 0,
      sortMethod: node["Sort Method"],
      sortSpaceType: node["Sort Space Type"],
      plans: children.length > 0 ? children : undefined,
    };
  }

  const planTree = traverse(rawPlan);

  return {
    totalCost: Number((rawPlan["Total Cost"] || 0).toFixed(1)),
    planTree,
    seqScanTables: Array.from(new Set(seqScanTables)),
    bottlenecks,
  };
}

/**
 * 2. TÁCH BIỆT: EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
 * Chỉ dùng trong quá trình BENCHMARK để đo đạc thời gian thực thi (ms),
 * buffer cache hits và disk block reads thực tế.
 */
export async function executePlanAnalyze(
  sql: string,
  forceUnindexed: boolean = false
): Promise<BenchmarkMetrics> {
  const client = await pool.connect();
  try {
    if (forceUnindexed) {
      await client.query("SET enable_indexscan = off; SET enable_bitmapscan = off;");
    } else {
      await client.query("SET enable_indexscan = on; SET enable_bitmapscan = on;");
    }

    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
    const result = await client.query(explainSql);
    const rawData = result.rows[0]["QUERY PLAN"][0];
    const rootPlan = rawData["Plan"];

    return {
      executionTimeMs: Number((rawData["Execution Time"] || 0).toFixed(2)),
      planningTimeMs: Number((rawData["Planning Time"] || 0).toFixed(2)),
      totalCost: Number((rootPlan["Total Cost"] || 0).toFixed(1)),
      sharedHitBlocks: rootPlan["Shared Hit Blocks"] || 0,
      sharedReadBlocks: rootPlan["Shared Read Blocks"] || 0,
    };
  } catch (error: any) {
    console.error("[PlanAnalyzer] Lỗi khi chạy EXPLAIN ANALYZE:", error.message);
    throw error;
  } finally {
    try {
      await client.query("SET enable_indexscan = on; SET enable_bitmapscan = on;");
    } catch {}
    client.release();
  }
}