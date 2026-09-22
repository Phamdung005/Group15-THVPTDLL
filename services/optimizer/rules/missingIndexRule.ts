import { BottleneckItem, RecommendationItem } from "../index";

export function checkMissingIndexRule(seqScanTables: string[], sql: string = ""): {
  bottlenecks: BottleneckItem[];
  recommendations: RecommendationItem[];
  suggestedIndexes: string[];
} {
  const bottlenecks: BottleneckItem[] = [];
  const recommendations: RecommendationItem[] = [];
  const suggestedIndexes: string[] = [];

  const aliasToTableMap: Record<string, string> = {};
  const tableAliasMatches = Array.from(
    sql.matchAll(/(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/gi)
  );

  for (const m of tableAliasMatches) {
    const tableName = m[1].toLowerCase();
    const alias = (m[2] || m[1]).toLowerCase();
    aliasToTableMap[alias] = tableName;
    aliasToTableMap[tableName] = tableName;
  }

  const tableColMap: Record<string, string[]> = {};

  const dotMatches = Array.from(sql.matchAll(/\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g));
  dotMatches.forEach((m) => {
    const prefix = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    const realTable = aliasToTableMap[prefix] || prefix;
    if (!tableColMap[realTable]) tableColMap[realTable] = [];
    if (!tableColMap[realTable].includes(col)) tableColMap[realTable].push(col);
  });

  const plainMatches = Array.from(sql.matchAll(/\b(WHERE|AND|OR|ON)\s+([a-zA-Z0-9_]+)\b/gi));
  const reservedWords = new Set(["year", "month", "day", "upper", "lower", "date", "select", "from", "join", "where", "and", "or", "on", "in", "is", "not", "null", "as", "by", "order", "group", "having", "limit", "sum", "count", "avg", "min", "max"]);

  plainMatches.forEach((m) => {
    const col = m[2].toLowerCase();
    if (aliasToTableMap[col] || reservedWords.has(col)) {
      return;
    }
    const tablesInQuery = Array.from(new Set(Object.values(aliasToTableMap)));
    const targetTable = tablesInQuery[0] || (seqScanTables[0] ? seqScanTables[0].toLowerCase() : "");
    if (!targetTable) return;
    if (!tableColMap[targetTable]) tableColMap[targetTable] = [];
    if (!tableColMap[targetTable].includes(col)) tableColMap[targetTable].push(col);
  });

  seqScanTables.forEach((table) => {
    const targetTable = table.toLowerCase();
    const cols = tableColMap[targetTable] || [];

    if (cols.length === 0) return;

    const colListStr = cols.join(", ");
    const idxName = `idx_${targetTable}_${cols.join("_")}`;
    const ddl = `CREATE INDEX ${idxName} ON ${targetTable}(${colListStr});`;

    bottlenecks.push({
      id: `bot-seqscan-${targetTable}`,
      severity: "high",
      title: `Quét Tuần Tự (Sequential Scan) trên bảng \`${targetTable}\``,
      table: targetTable,
      description: `PostgreSQL phải quét toàn bộ bảng \`${targetTable}\` do thiếu Index ở các cột truy vấn (${colListStr}).`,
      suggestedFix: `Tạo B-Tree Index cho bảng \`${targetTable}(${colListStr})\`.`,
    });

    recommendations.push({
      id: `rec-idx-${targetTable}`,
      type: "index",
      action: `Tạo B-Tree Index cho bảng \`${targetTable}\``,
      sqlCommand: ddl,
      explanation: `Giúp PostgreSQL chuyển từ Sequential Scan sang Index Scan, tăng tốc độ truy vấn từ O(N) xuống O(log N).`,
    });

    suggestedIndexes.push(ddl);
  });


  return {
    bottlenecks,
    recommendations,
    suggestedIndexes,
  };
}
