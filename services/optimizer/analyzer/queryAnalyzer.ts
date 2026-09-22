import { ParsedSQL } from "../parser/sqlParser";

export interface QueryComplexity {
  tableCount: number;
  hasSubquery: boolean;
  hasAggregations: boolean;
  isHighRisk: boolean;
}

export function analyzeQueryStructure(parsed: ParsedSQL): QueryComplexity {
  const tableCount = parsed.tables.length;
  const hasSubquery = /SELECT\s+.*?\(\s*SELECT/i.test(parsed.rawSql);
  const hasAggregations = /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(parsed.rawSql);
  const isHighRisk = tableCount > 3 || (hasSubquery && parsed.hasSelectStar);

  return {
    tableCount,
    hasSubquery,
    hasAggregations,
    isHighRisk,
  };
}
