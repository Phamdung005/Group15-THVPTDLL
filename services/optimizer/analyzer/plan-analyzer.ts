import { pool } from "../../../apps/backend/src/db";

export interface PlanMetrics {
  executionTimeMs: number;
  planningTimeMs: number;
  totalCost: number;
  sharedHits: number;
  sharedReads: number;
  seqScanTables: string[];
}

export async function executePlanAnalyze(sql: string): Promise<PlanMetrics> {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
  
  try {
    const result = await pool.query(explainSql);
    const rawData = result.rows[0]["QUERY PLAN"][0];
    const rootPlan = rawData["Plan"];
    const seqScanTables: string[] = [];
    
    function traversePlan(node: any) {
      if (node["Node Type"] === "Seq Scan" && node["Relation Name"]) {
        seqScanTables.push(node["Relation Name"]);
      }
      if (node["Plans"]) {
        node["Plans"].forEach(traversePlan);
      }
    }
    traversePlan(rootPlan);
    return {
      executionTimeMs: rawData["Execution Time"] || 0,
      planningTimeMs: rawData["Planning Time"] || 0,
      totalCost: rootPlan["Total Cost"] || 0,
      sharedHits: rootPlan["Shared Hit Blocks"] || 0,
      sharedReads: rootPlan["Shared Read Blocks"] || 0,
      seqScanTables: Array.from(new Set(seqScanTables)), 
    };
  } catch (error: any) {
    console.error("Lỗi khi chạy EXPLAIN ANALYZE:", error.message);
    throw error;
  }
}