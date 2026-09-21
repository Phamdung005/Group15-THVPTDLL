import { CandidateQuery } from "../index";

export function generateCandidates(
  originalSql: string,
  rewrittenSql: string,
  origTimeMs: number,
  bestTimeMs: number,
  origCost: number,
  bestCost: number
): CandidateQuery[] {
  return [
    {
      id: "cand-orig",
      name: "Câu SQL Gốc (Chưa Tối Ưu)",
      description: "Câu truy vấn ban đầu chưa áp dụng quy tắc tối ưu.",
      sql: originalSql,
      isBest: false,
      executionTimeMs: origTimeMs,
      queryCost: origCost,
    },
    {
      id: "cand-best",
      name: "Phương án Tối Ưu Nhất (Viết lại SQL + Tạo Index)",
      description: "Phương án áp dụng toàn bộ các luật tối ưu và Index Scan.",
      sql: rewrittenSql,
      isBest: true,
      executionTimeMs: bestTimeMs,
      queryCost: bestCost,
    },
  ];
}
