import { BottleneckItem, RecommendationItem } from "../index";

export function checkJoinRule(sql: string): {
  bottleneck?: BottleneckItem;
  recommendation?: RecommendationItem;
} {
  const hasJoin = /\bJOIN\b/i.test(sql);
  const hasOnCondition = /\bON\b/i.test(sql);

  if (hasJoin && !hasOnCondition) {
    return {
      bottleneck: {
        id: "bot-cartesian-join",
        severity: "high",
        title: "Phát hiện Phép nối Cartesian Product (Thiếu điều kiện ON)",
        description: "Phép JOIN không có mệnh đề ON tạo ra tích Cartesian giữa các bảng, sinh ra số hàng khổng lồ N x M gây treo bộ nhớ.",
        suggestedFix: "Thêm điều kiện khóa ngoại ON giữa hai bảng.",
      },
      recommendation: {
        id: "rec-cartesian-join",
        type: "rewrite",
        action: "Bổ sung điều kiện ON cho phép JOIN",
        explanation: "Xác định rõ ràng trường liên kết giữa hai bảng để giới hạn số hàng.",
      },
    };
  }

  return {};
}
