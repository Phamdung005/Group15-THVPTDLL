export type ColumnRole =
  | "JOIN"
  | "FILTER_EQUAL"
  | "FILTER_RANGE"
  | "AGGREGATE"
  | "SORT"
  | "GROUP"
  | "PROJECTION";

export interface AnalyzedColumn {
  tableName: string;
  columnName: string;
  role: ColumnRole;
  expression?: string;
}

export interface QueryStructureAnalysis {
  tables: string[];
  aliasToTableMap: Record<string, string>;
  columns: AnalyzedColumn[];
  hasSelectStar: boolean;
  hasAggregation: boolean;
  hasSort: boolean;
}

/**
 * Phân tích cấu trúc câu lệnh SQL và phân loại vai trò chính xác cho từng cột.
 * Phân biệt rõ giữa cột lọc (WHERE), cột nối (JOIN), cột tính toán (SUM/COUNT), và cột sắp xếp (ORDER BY).
 */
export function analyzeColumnRoles(sql: string): QueryStructureAnalysis {
  const cleanSql = sql.trim();

  // 1. Phân tích các bảng và alias
  const aliasToTableMap: Record<string, string> = {};
  const tableAliasMatches = Array.from(
    cleanSql.matchAll(/(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/gi)
  );

  const tables: string[] = [];
  for (const m of tableAliasMatches) {
    const tableName = m[1].toLowerCase();
    const alias = (m[2] || m[1]).toLowerCase();
    aliasToTableMap[alias] = tableName;
    aliasToTableMap[tableName] = tableName;
    if (!tables.includes(tableName)) tables.push(tableName);
  }

  const columns: AnalyzedColumn[] = [];
  const trackedKeys = new Set<string>();

  function addColumn(tableName: string, columnName: string, role: ColumnRole, expr?: string) {
    const key = `${tableName}.${columnName}.${role}`;
    if (!trackedKeys.has(key)) {
      trackedKeys.add(key);
      columns.push({ tableName, columnName, role, expression: expr });
    }
  }

  function resolveTable(prefixOrTable: string): string {
    return aliasToTableMap[prefixOrTable.toLowerCase()] || prefixOrTable.toLowerCase();
  }

  // 2. Phân tích cột trong hàm tính toán AGGREGATE: SUM(oi.quantity), COUNT(*), AVG(), MIN(), MAX()
  const aggMatches = Array.from(cleanSql.matchAll(/\b(SUM|AVG|COUNT|MIN|MAX)\s*\(\s*([a-zA-Z0-9_\.\s\*\+\-\/]+?)\s*\)/gi));
  aggMatches.forEach((m) => {
    const expr = m[2].trim();
    // Bóc tách tất cả các cột trong biểu thức tính toán, ví dụ "oi.quantity * oi.unit_price"
    const innerCols = Array.from(expr.matchAll(/\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g));
    innerCols.forEach((c) => {
      addColumn(resolveTable(c[1]), c[2].toLowerCase(), "AGGREGATE", m[0]);
    });
  });

  // 3. Phân tích cột trong JOIN ON condition: ON oi.order_id = o.id
  const onMatches = Array.from(cleanSql.matchAll(/\bON\s+([a-zA-Z0-9_\.]+)\s*=\s*([a-zA-Z0-9_\.]+)/gi));
  onMatches.forEach((m) => {
    [m[1], m[2]].forEach((side) => {
      const parts = side.split(".");
      if (parts.length === 2) {
        addColumn(resolveTable(parts[0]), parts[1].toLowerCase(), "JOIN", m[0]);
      }
    });
  });

  // 4. Phân tích cột trong ORDER BY: ORDER BY o.created_at DESC, tong_tien DESC
  const orderMatch = cleanSql.match(/ORDER\s+BY\s+([^;\n]+)/i);
  if (orderMatch && orderMatch[1]) {
    const orderCols = Array.from(orderMatch[1].matchAll(/\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g));
    orderCols.forEach((c) => {
      addColumn(resolveTable(c[1]), c[2].toLowerCase(), "SORT", c[0]);
    });
  }

  // 5. Phân tích cột trong GROUP BY: GROUP BY o.id, c.name...
  const groupMatch = cleanSql.match(/GROUP\s+BY\s+([^;\n]+)/i);
  if (groupMatch && groupMatch[1]) {
    const groupCols = Array.from(groupMatch[1].matchAll(/\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g));
    groupCols.forEach((c) => {
      addColumn(resolveTable(c[1]), c[2].toLowerCase(), "GROUP", c[0]);
    });
  }

  // 6. Phân tích cột trong WHERE clause: Phân biệt FILTER_EQUAL (=) và FILTER_RANGE (>=, <=, >, <, BETWEEN)
  const whereMatch = cleanSql.match(/WHERE\s+(.*?)(?:GROUP|ORDER|LIMIT|;|$)/is);
  if (whereMatch && whereMatch[1]) {
    const whereClause = whereMatch[1];

    // 6a. FILTER_EQUAL: o.status = 'completed' hoặc status = 100
    const equalMatches = Array.from(whereClause.matchAll(/(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*=\s*(?:'[^']*'|[0-9]+)/gi));
    equalMatches.forEach((m) => {
      const table = m[1] ? resolveTable(m[1]) : tables[0] || "orders";
      const col = m[2].toLowerCase();
      if (!["year", "month", "day", "upper", "lower", "date"].includes(col)) {
        addColumn(table, col, "FILTER_EQUAL", m[0]);
      }
    });

    // 6b. FILTER_RANGE: o.created_at >= '2024-01-01' hoặc amount > 1000
    const rangeMatches = Array.from(whereClause.matchAll(/(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*(?:>=|<=|>|<|BETWEEN)\s*/gi));
    rangeMatches.forEach((m) => {
      const table = m[1] ? resolveTable(m[1]) : tables[0] || "orders";
      const col = m[2].toLowerCase();
      if (!["year", "month", "day", "upper", "lower", "date"].includes(col)) {
        addColumn(table, col, "FILTER_RANGE", m[0]);
      }
    });

    // 6c. Function on column trong WHERE: YEAR(created_at) = 2024
    const funcMatches = Array.from(whereClause.matchAll(/\b(YEAR|MONTH|DAY|DATE)\s*\(\s*(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\)/gi));
    funcMatches.forEach((m) => {
      const table = m[2] ? resolveTable(m[2]) : tables[0] || "orders";
      const col = m[3].toLowerCase();
      addColumn(table, col, "FILTER_RANGE", m[0]);
    });
  }

  return {
    tables,
    aliasToTableMap,
    columns,
    hasSelectStar: /SELECT\s+\*/i.test(cleanSql),
    hasAggregation: aggMatches.length > 0 || /GROUP\s+BY/i.test(cleanSql),
    hasSort: /ORDER\s+BY/i.test(cleanSql),
  };
}
