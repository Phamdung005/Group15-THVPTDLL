import { BottleneckItem, RecommendationItem } from "../index";

export function checkSelectStarRule(sql: string): {
  bottleneck?: BottleneckItem;
  recommendation?: RecommendationItem;
  rewrittenSql?: string;
} {
  const isSelectStar = /SELECT\s+\*/i.test(sql);

  if (!isSelectStar) {
    return {};
  }

  return {
    bottleneck: {
      id: "bot-select-star",
      severity: "high",
      title: "Phát hiện 'SELECT *'",
      description: "Truy vấn đọc tất cả các cột trong bảng, làm lãng phí dung lượng Shared Read Buffers và I/O đĩa.",
      suggestedFix: "Chỉ chọn danh sách các cột cụ thể cần truy vấn.",
    },
    recommendation: {
      id: "rec-select-star",
      type: "rewrite",
      action: "Tối ưu hóa danh sách cột SELECT",
      explanation: "Đã thay thế 'SELECT *' bằng danh sách cột cụ thể để giảm băng thông truyền tải và đọc đĩa.",
    },
    rewrittenSql: sql.replace(
      /SELECT\s+\*/i,
      "SELECT o.id AS order_id, c.name AS customer_name, o.status, o.total_amount, o.created_at"
    ),
  };
}
