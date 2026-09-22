export interface ParsedSQL {
  rawSql: string;
  queryType: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "UNKNOWN";
  tables: string[];
  selectColumns: string[];
  hasWhereClause: boolean;
  hasJoinClause: boolean;
  hasSelectStar: boolean;
}

export function parseSQL(sql: string): ParsedSQL {
  const cleanSql = sql.trim();
  const queryType = /^SELECT/i.test(cleanSql) ? "SELECT" : "UNKNOWN";

  // Extract table names
  const tableMatches = cleanSql.match(/(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi);
  const tables: string[] = [];
  if (tableMatches) {
    tableMatches.forEach((m) => {
      const parts = m.trim().split(/\s+/);
      if (parts[1]) tables.push(parts[1].toLowerCase());
    });
  }

  // Extract SELECT columns
  const selectMatch = cleanSql.match(/SELECT\s+(.*?)\s+FROM/is);
  const selectColumns: string[] = [];
  let hasSelectStar = false;

  if (selectMatch && selectMatch[1]) {
    const colStr = selectMatch[1].trim();
    if (colStr.includes("*")) {
      hasSelectStar = true;
    } else {
      colStr.split(",").forEach((c) => selectColumns.push(c.trim()));
    }
  }

  return {
    rawSql: sql,
    queryType,
    tables: Array.from(new Set(tables)),
    selectColumns,
    hasWhereClause: /WHERE/i.test(cleanSql),
    hasJoinClause: /JOIN/i.test(cleanSql),
    hasSelectStar,
  };
}
