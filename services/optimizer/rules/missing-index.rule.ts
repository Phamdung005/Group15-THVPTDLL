import { BottleneckItem, RecommendationItem } from "../index";

export function checkMissingIndexRule(seqScanTables: string[]): {
  bottlenecks: BottleneckItem[];
  recommendations: RecommendationItem[];
  suggestedIndexes: string[];
} {
  const bottlenecks: BottleneckItem[] = [];
  const recommendations: RecommendationItem[] = [];
  const suggestedIndexes: string[] = [];

  if (seqScanTables.includes("orders")) {
    bottlenecks.push({
      id: "bot-idx-orders",
      severity: "high",
      title: "Sequential Scan trên bảng `orders` (200,000 dòng)",
      description: "PostgreSQL phải quét toàn bộ 200,000 hàng do thiếu B-Tree Index ở khóa ngoại `customer_id`.",
      table: "orders",
      suggestedFix: "Tạo B-Tree Index cho khóa `orders(customer_id)`.",
    });

    const ddl = "CREATE INDEX idx_orders_customer_id ON orders(customer_id);";
    recommendations.push({
      id: "rec-idx-orders",
      type: "index",
      action: "Tạo B-Tree Index cho khóa ngoại `orders.customer_id`",
      sqlCommand: ddl,
      explanation: "Giúp PostgreSQL chuyển từ Sequential Scan sang Index Scan, giảm thời gian tìm kiếm từ O(N) xuống O(log N).",
    });
    suggestedIndexes.push(ddl);
  }

  if (seqScanTables.includes("order_items")) {
    bottlenecks.push({
      id: "bot-idx-order-items",
      severity: "high",
      title: "Sequential Scan trên bảng `order_items` (500,000 dòng)",
      description: "PostgreSQL phải quét toàn bộ 500,000 hàng do thiếu Index ở khóa ngoại `order_id`.",
      table: "order_items",
      suggestedFix: "Tạo B-Tree Index cho khóa `order_items(order_id)`.",
    });

    const ddl = "CREATE INDEX idx_order_items_order_id ON order_items(order_id);";
    recommendations.push({
      id: "rec-idx-order-items",
      type: "index",
      action: "Tạo B-Tree Index cho khóa ngoại `order_items.order_id`",
      sqlCommand: ddl,
      explanation: "Tăng tốc phép JOIN giữa bảng orders và order_items.",
    });
    suggestedIndexes.push(ddl);
  }

  return {
    bottlenecks,
    recommendations,
    suggestedIndexes,
  };
}
