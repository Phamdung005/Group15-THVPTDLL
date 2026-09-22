export function rewriteSelectStar(sql: string, explicitColumns: string): string {
  return sql.replace(/SELECT\s+\*/i, `SELECT ${explicitColumns}`);
}

export function rewriteSubqueryToJoin(sql: string): string {
  // Utility rewriter logic if needed
  return sql;
}
