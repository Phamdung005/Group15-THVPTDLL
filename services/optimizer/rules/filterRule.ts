import { BottleneckItem, RecommendationItem } from "../index";

export function checkFilterRule(sql: string): {
  bottleneck?: BottleneckItem;
  recommendation?: RecommendationItem;
} {
  const leadingWildcard = /LIKE\s+['"]%[^'"]+['"]/i.test(sql);

  if (leadingWildcard) {
    return {
      bottleneck: {
        id: "bot-leading-wildcard",
        severity: "medium",
        title: "Phát hiện ký tự đại diện đứng đầu trong điều kiện LIKE (`%pattern`)",
        description: "Tìm kiếm chuỗi chứa `%` ở đầu ngăn cản PostgreSQL sử dụng B-Tree Index thông thường.",
        suggestedFix: "Sử dụng pg_trgm GIN Index hoặc Full-Text Search nếu cần tìm kiếm chuỗi phụ.",
      },
      recommendation: {
        id: "rec-leading-wildcard",
        type: "index",
        action: "Tạo GIN Trigram Index cho tìm kiếm chuỗi",
        sqlCommand: "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX idx_trgm_search ON table USING gin(column gin_trgm_ops);",
        explanation: "Cho phép tìm kiếm substring bằng Index GIN thay vì Sequential Scan.",
      },
    };
  }

  return {};
}
