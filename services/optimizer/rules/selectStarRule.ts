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

  const cols: string[] = [];

  // Check order_items table and alias
  if (/\b(order_items\s+oi|\boi\.)\b/i.test(sql)) {
    cols.push("oi.id AS item_id", "oi.product_name", "oi.quantity", "oi.unit_price");
  } else if (/\border_items\b/i.test(sql)) {
    cols.push("id", "product_name", "quantity", "unit_price");
  }

  // Check orders table and alias
  if (/\b(orders\s+o|\bo\.)\b/i.test(sql)) {
    cols.push("o.id AS order_id", "o.status", "o.total_amount", "o.created_at");
  } else if (/\borders\b/i.test(sql)) {
    cols.push("id", "status", "total_amount", "created_at");
  }

  // Check customers table and alias
  if (/\b(customers\s+c|\bc\.)\b/i.test(sql)) {
    cols.push("c.id AS customer_id", "c.name AS customer_name", "c.email", "c.created_at");
  } else if (/\bcustomers\b/i.test(sql)) {
    cols.push("id", "name", "email", "created_at");
  }

  // Fallback động cho mọi bảng khác ngoài 3 bảng thương mại điện tử
  if (cols.length === 0) {
    const fromMatch = sql.match(/FROM\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/i);
    if (fromMatch) {
      const alias = fromMatch[2] || fromMatch[1];
      const whereCols = Array.from(sql.matchAll(/\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g)).map((m) => m[0]);
      if (whereCols.length > 0) {
        cols.push(...Array.from(new Set(whereCols)));
      } else {
        cols.push(alias ? `${alias}.id` : "id");
      }
    }
  }

  const replacement = cols.length > 0 ? `SELECT ${cols.join(", ")}` : "SELECT id";

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
    rewrittenSql: sql.replace(/SELECT\s+\*/i, replacement),
  };
}
