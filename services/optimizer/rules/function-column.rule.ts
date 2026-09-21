import { BottleneckItem, RecommendationItem } from "../index";

export function checkFunctionOnColumnRule(sql: string): {
  bottleneck?: BottleneckItem;
  recommendation?: RecommendationItem;
} {
  const funcPattern = /WHERE\s+.*?\b(UPPER|LOWER|DATE|YEAR|MONTH|DAY|SUBSTRING|TRIM)\s*\(/i;
  const match = sql.match(funcPattern);

  if (!match) {
    return {};
  }

  const funcName = match[1].toUpperCase();

  return {
    bottleneck: {
      id: "bot-func-column",
      severity: "medium",
      title: `Sử dụng hàm \`${funcName}()\` trên cột lọc WHERE (Lỗi Non-Sargable)`,
      description: `Bọc hàm \`${funcName}()\` trực tiếp lên cột dữ liệu khiến PostgreSQL không thể dùng Index và buộc phải thực hiện Sequential Scan toàn bộ bảng.`,
      suggestedFix: `Viết lại điều kiện so sánh giá trị trực tiếp hoặc tạo Expression Index cho hàm \`${funcName}()\`.`,
    },
    recommendation: {
      id: "rec-func-column",
      type: "rewrite",
      action: `Loại bỏ hàm \`${funcName}()\` trên cột lọc`,
      explanation: `So sánh trực tiếp giá trị hằng số để duy trì khả năng truy vấn theo Index Scan.`,
    },
  };
}
