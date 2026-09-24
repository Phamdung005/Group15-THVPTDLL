import type { Dataset, HistoryItem, OptimizationResult } from '../types';

export const DATASETS: Dataset[] = [
  { label: 'e_commerce_db', value: 'e_commerce_db', rows: '5,21M dòng' },
  { label: 'analytics_db', value: 'analytics_db', rows: '12,4M dòng' },
  { label: 'logistics_db', value: 'logistics_db', rows: '3,8M dòng' },
];

export const SAMPLE_QUERIES = [
  {
    label: 'Báo cáo đơn hàng chậm',
    sql: `SELECT
  o.order_id,
  c.customer_name,
  c.email,
  SUM(oi.quantity * oi.unit_price) AS tong_tien,
  o.created_at
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.order_id
WHERE o.status = 'completed'
  AND o.created_at >= '2024-01-01'
GROUP BY o.order_id, c.customer_name, c.email, o.created_at
ORDER BY tong_tien DESC
LIMIT 100;`,
  },
  {
    label: 'Phân tích doanh thu sản phẩm',
    sql: `SELECT
  p.product_id,
  p.product_name,
  cat.category_name,
  COUNT(oi.id) AS so_luong_ban,
  SUM(oi.quantity * oi.unit_price) AS doanh_thu
FROM products p
LEFT JOIN categories cat ON cat.id = p.category_id
LEFT JOIN order_items oi ON oi.product_id = p.product_id
LEFT JOIN orders o ON o.order_id = oi.order_id
WHERE o.created_at BETWEEN '2023-01-01' AND '2024-12-31'
GROUP BY p.product_id, p.product_name, cat.category_name
HAVING doanh_thu > 10000
ORDER BY doanh_thu DESC;`,
  },
  {
    label: 'Tổng hợp hoạt động người dùng',
    sql: `SELECT
  u.user_id,
  u.username,
  DATE_TRUNC('day', al.event_time) AS ngay,
  al.event_type,
  COUNT(*) AS so_lan
FROM activity_logs al
JOIN users u ON u.id = al.user_id
WHERE al.event_time >= NOW() - INTERVAL '30 days'
  AND al.event_type IN ('mua_hang', 'xem', 'click')
GROUP BY u.user_id, u.username, ngay, al.event_type
ORDER BY ngay DESC, so_lan DESC;`,
  },
];

export const MOCK_OPTIMIZATION: OptimizationResult = {
  originalQuery: SAMPLE_QUERIES[0].sql,
  optimizedQuery: `-- Đã tối ưu: Thêm index + cắt tỉa phân vùng
SELECT
  o.order_id,
  c.customer_name,
  c.email,
  SUM(oi.quantity * oi.unit_price) AS tong_tien,
  o.created_at
FROM orders o
-- GỢI Ý INDEX: Dùng idx_orders_trang_thai_ngay
JOIN customers c ON o.customer_id = c.id  -- idx_customers_id
JOIN order_items oi ON oi.order_id = o.order_id  -- idx_order_items_order_id
WHERE o.status = 'completed'
  AND o.created_at >= '2024-01-01'
GROUP BY o.order_id, c.customer_name, c.email, o.created_at
ORDER BY tong_tien DESC
LIMIT 100;

-- CÁC LỆNH TẠO INDEX ĐỀ XUẤT:
-- CREATE INDEX CONCURRENTLY idx_orders_trang_thai_ngay
--   ON orders(status, created_at) WHERE status = 'completed';
-- CREATE INDEX CONCURRENTLY idx_order_items_order_id
--   ON order_items(order_id) INCLUDE (quantity, unit_price);`,
  originalMetrics: { executionTime: 1250, totalCost: 98420.5, sharedReadBuffers: 48320, planningTime: 12.4, rowsReturned: 100 },
  optimizedMetrics: { executionTime: 193, totalCost: 5812.3, sharedReadBuffers: 2140, planningTime: 8.1, rowsReturned: 100 },
  bottlenecks: [
    { id: 'b1', severity: 'critical', type: 'Quét Tuần Tự (Sequential Scan)', message: 'Phát hiện quét toàn bảng `orders` (5.210.000 dòng) – không có index nào phù hợp với điều kiện status + created_at.', table: 'orders', rows: 5210000 },
    { id: 'b2', severity: 'critical', type: 'Vòng Lặp Lồng Nhau (Nested Loop Join)', message: 'Chi phí cao khi nối bảng `orders` và `order_items` không có index – gây ra 5.2 triệu lần duyệt bảng con.', table: 'order_items', rows: 5210000 },
    { id: 'b3', severity: 'warning', type: 'Sắp Xếp Trên Đĩa (Sort on Disk)', message: 'Thao tác sắp xếp tràn ra ổ cứng do vượt quá work_mem. Cần nhắc tăng work_mem hoặc dùng index bao phủ.' },
    { id: 'b4', severity: 'warning', type: 'Gom Nhóm Tốn RAM (Hash Aggregate)', message: 'Hash Aggregate dùng 42MB bộ nhớ – đã kích hoạt chế độ batch. Kiểm tra lại số lượng nhóm trong GROUP BY.' },
    { id: 'b5', severity: 'info', type: 'Thời Gian Lập Kế Hoạch Cao', message: 'Thời gian lập kế hoạch 12.4ms khá cao. Hãy chạy ANALYZE để cập nhật thống kê bảng.' },
  ],
  executionPlan: {
    id: 'root', type: 'Giới Hạn (Limit)', cost: 98420.5, rows: 100, actualTime: 1250,
    children: [{
      id: 'sort', type: 'Sắp Xếp (Sort)', cost: 98320.2, rows: 4820, actualTime: 1248,
      children: [{
        id: 'aggregate', type: 'Gom Nhóm (Hash Aggregate)', cost: 95100.1, rows: 4820, actualTime: 1180,
        children: [{
          id: 'hash_join', type: 'Nối Bảng (Hash Join)', cost: 82400.8, rows: 287340, actualTime: 980,
          children: [
            { id: 'nested_loop', type: 'Vòng Lặp Lồng (Nested Loop)', cost: 78200.4, rows: 287340, actualTime: 870,
              children: [
                { id: 'seq_scan_orders', type: 'Quét Toàn Bảng (Seq Scan)', relation: 'orders', cost: 62400.0, rows: 1302500, actualTime: 640 },
                { id: 'index_scan_items', type: 'Quét Index (Index Scan)', relation: 'order_items', cost: 12.8, rows: 1, actualTime: 0.08 },
              ]
            },
            { id: 'hash_customers', type: 'Bảng Băm (Hash)', cost: 2840.0, rows: 142000, actualTime: 82,
              children: [{ id: 'seq_scan_customers', type: 'Quét Toàn Bảng (Seq Scan)', relation: 'customers', cost: 2840.0, rows: 142000, actualTime: 82 }]
            },
          ]
        }]
      }]
    }]
  },
  suggestions: [
    "CREATE INDEX CONCURRENTLY idx_orders_trang_thai_ngay ON orders(status, created_at) WHERE status = 'completed'",
    'CREATE INDEX CONCURRENTLY idx_order_items_order_id ON order_items(order_id) INCLUDE (quantity, unit_price)',
    "SET work_mem = '64MB' -- tăng bộ nhớ để tránh sắp xếp trên đĩa",
    'ANALYZE orders, order_items, customers; -- cập nhật thống kê để bộ lập kế hoạch hoạt động tốt hơn',
  ],
  improvementPercent: 84.5,
};

export const HISTORY_ITEMS: HistoryItem[] = [
  { id: 'h1', timestamp: '17/09/2024 14:32', query: 'SELECT o.order_id, c.customer_name...', improvement: 84.5, executionTimeBefore: 1250, executionTimeAfter: 193 },
  { id: 'h2', timestamp: '17/09/2024 11:20', query: 'SELECT p.product_id, SUM(oi.quantity)...', improvement: 71.2, executionTimeBefore: 3420, executionTimeAfter: 985 },
  { id: 'h3', timestamp: '16/09/2024 16:05', query: 'SELECT u.user_id, COUNT(*) FROM activity_logs...', improvement: 91.8, executionTimeBefore: 8200, executionTimeAfter: 672 },
  { id: 'h4', timestamp: '16/09/2024 09:14', query: "SELECT * FROM products WHERE category_id IN...", improvement: 65.3, executionTimeBefore: 540, executionTimeAfter: 187 },
];

export const COLUMN_ROLES = [
  { column: 'orders.status', role: 'BỘ LỌC', tone: 'filter', description: 'Điều kiện WHERE chính – cần index có điều kiện WHERE status.' },
  { column: 'orders.created_at', role: 'PHẠM VI', tone: 'range', description: 'Quét theo khoảng thời gian – index kết hợp (status, created_at) sẽ tối ưu.' },
  { column: 'order_items.order_id', role: 'KHÓA NỐI', tone: 'join', description: 'Điều kiện JOIN – cần index bao phủ để tránh Nested Loop.' },
  { column: 'oi.quantity × price', role: 'TÍNH TOÁN', tone: 'agg', description: 'Tổng hợp trong SELECT – không thể đánh index trực tiếp.' },
];

export const CANDIDATES = [
  { name: 'Index Kết Hợp', detail: 'status + created_at', time: 193, reads: '2,1K', cost: '5.812', score: 91, winner: true },
  { name: 'Index Riêng Lẻ', detail: 'status only', time: 380, reads: '8,4K', cost: '21.400', score: 74, winner: false },
  { name: 'Phân Vùng', detail: 'partition by month', time: 510, reads: '12,2K', cost: '34.100', score: 61, winner: false },
  { name: 'CTE Inline', detail: 'WITH subquery', time: 740, reads: '18,7K', cost: '52.300', score: 48, winner: false },
  { name: 'Gốc (Baseline)', detail: 'không thay đổi', time: 1250, reads: '48,3K', cost: '98.420', score: 12, winner: false },
];
