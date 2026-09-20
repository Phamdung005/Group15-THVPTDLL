import express from "express";
import cors from "cors";
import { pool } from "./db";
import { analyzeAndOptimizeSQL } from "../../../services/optimizer/index"; 

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    const dbRes = await pool.query("SELECT NOW() as current_time;");
    res.json({
      success: true,
      status: "UP",
      message: "Backend & PostgreSQL đang kết nối bình thường",
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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend Server running at http://localhost:${PORT}`);
});
