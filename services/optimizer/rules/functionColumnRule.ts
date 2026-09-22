import { BottleneckItem, RecommendationItem } from "../index";

export function checkFunctionOnColumnRule(sql: string): {
  bottleneck?: BottleneckItem;
  recommendation?: RecommendationItem;
  rewrittenSql?: string;
} {
  const funcPattern = /\b(YEAR|MONTH|DAY|UPPER|LOWER|DATE)\s*\(\s*([a-zA-Z0-9_\.]+)\s*\)\s*=\s*([0-9]+|'[^']+')/i;
  const match = sql.match(funcPattern);

  if (!match) {
    return {};
  }

  const funcName = match[1].toUpperCase();
  const colName = match[2];
  const val = match[3];

  let rewrittenSql = sql;
  if (funcName === "YEAR") {
    const yearVal = val.replace(/'/g, "");
    const rangeCondition = `${colName} >= '${yearVal}-01-01' AND ${colName} < '${Number(yearVal) + 1}-01-01'`;
    rewrittenSql = sql.replace(match[0], rangeCondition);
  }

  return {
    bottleneck: {
      id: "bot-func-column",
      severity: "high",
      title: `Sử dụng hàm \`${funcName}()\` trên cột lọc (Lỗi Non-Sargable)`,
      description: `Bọc hàm \`${funcName}()\` trực tiếp lên cột \`${colName}\` khiến PostgreSQL không thể dùng Index và buộc phải Sequential Scan toàn bộ bảng.`,
      suggestedFix: `Viết lại điều kiện lọc thành khoảng thời gian giá trị trực tiếp.`,
    },
    recommendation: {
      id: "rec-func-column",
      type: "rewrite",
      action: `Loại bỏ hàm \`${funcName}()\` trên cột lọc`,
      explanation: `Đổi \`${match[0]}\` thành so sánh phạm vi hằng số để giữ khả năng Index Range Scan.`,
    },
    rewrittenSql: rewrittenSql !== sql ? rewrittenSql : undefined,
  };
}
