import express from "express";
import cors from "cors";
import { pool } from "./db";
import { analyzeAndOptimizeSQL } from "../../../services/optimizer/index";

const app = express();

app.use(cors());
app.use(express.json());

// 1. API Healthcheck - Trạng thái hệ thống & PostgreSQL
app.get("/api/health", async (_req, res) => {
  try {
    const dbRes = await pool.query("SELECT NOW() as current_time;");
    res.json({
      success: true,
      status: "UP",
      message: "PostgreSQL 16 – Đã kết nối",
      datasetInfo: "e_commerce_db (750,000 dòng)",
      dbTime: dbRes.rows[0].current_time,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      status: "DOWN",
      message: "Không thể kết nối tới PostgreSQL Database",
      error: error.message,
    });
  }
});

// 2. API Phân Tích & Tối Ưu Truy Vấn SQL
app.post("/api/optimize", async (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== "string") {
    res.status(400).json({ success: false, message: "Vui lòng nhập câu lệnh SQL hợp lệ." });
    return;
  }

  try {
    const result = await analyzeAndOptimizeSQL(sql);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi phân tích và tối ưu SQL",
      error: error.message,
    });
  }
});

// 3. API Trả về Danh sách Câu SQL Mẫu cho Frontend Dropdown
app.get("/api/samples", (_req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: "sample-1",
        title: "Nghẽn JOIN do thiếu Index (Bảng orders & customers)",
        sql: "SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = 'completed';",
      },
      {
        id: "sample-2",
        title: "Nghẽn Lớn: Quét Sequential Scan trên 500,000 dòng order_items",
        sql: "SELECT * FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.unit_price > 50;",
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend API Server running at http://localhost:${PORT}`);
});