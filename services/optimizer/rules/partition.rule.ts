import { BottleneckItem, RecommendationItem } from "../index";

export function checkPartitionRule(totalRows: number, tablename: string): {
  bottleneck?: BottleneckItem;
  recommendation?: RecommendationItem;
} {
  if (totalRows > 5000000) {
    return {
      bottleneck: {
        id: "bot-partition",
        severity: "medium",
        title: `Bảng \`${tablename}\` quy mô rất lớn (${(totalRows / 1000000).toFixed(1)}M dòng)`,
        description: "Bảng có quy mô dữ liệu vượt quá 5 triệu dòng, quét toàn bộ hoặc Index scan lớn gây tốn chi phí RAM/đĩa đáng kể.",
        suggestedFix: "Phân vùng bảng (Table Partitioning) theo thời gian (Range Partition) hoặc vùng địa lý.",
      },
      recommendation: {
        id: "rec-partition",
        type: "config",
        action: `Phân vùng bảng \`${tablename}\` theo RANGE (created_at)`,
        explanation: "Giúp PostgreSQL chỉ quét các phân vùng dữ liệu cần thiết (Partition Pruning).",
      },
    };
  }

  return {};
}
