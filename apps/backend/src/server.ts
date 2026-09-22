import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { pool, switchDatabasePool, testDbConnection, currentDbConfig } from "./db";
import { analyzeAndOptimizeSQL, applyCandidateAction, rollbackLatestAction } from "../../../services/optimizer/index";
import {
  getDatabaseOverview,
  listAvailableDatabases,
  createNewDatabase,
  executeSqlFile,
  importCsvFile,
  generateSyntheticDataset,
  getDynamicSamples,
} from "./services/datasetService";

const app = express();

app.use(cors());
app.use(express.json());

// Setup Multer temporary upload directory
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 }, // Max 100MB
});

// 1. API Healthcheck - Trạng thái hệ thống & PostgreSQL
app.get("/api/health", async (_req, res) => {
  try {
    const dbRes = await pool.query("SELECT NOW() as current_time;");
    const overview = await getDatabaseOverview();
    res.json({
      success: true,
      status: "UP",
      message: `PostgreSQL 16 – Đã kết nối`,
      datasetInfo: `${overview.database} (${overview.totalRows.toLocaleString()} dòng)`,
      dbTime: dbRes.rows[0].current_time,
      overview,
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

// 2. API Lấy thông tin chi tiết nguồn dữ liệu (Database Info Modal)
app.get("/api/database/info", async (_req, res) => {
  try {
    const overview = await getDatabaseOverview();
    res.json({ success: true, data: overview });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2b. API Lấy danh sách các cơ sở dữ liệu có sẵn trên PostgreSQL Server
app.get("/api/database/list", async (_req, res) => {
  try {
    const list = await listAvailableDatabases();
    res.json({ success: true, data: list });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. API Kiểm tra hoặc Chuyển đổi kết nối PostgreSQL
app.post("/api/database/connect", async (req, res) => {
  const { host, port, database, user, password, action } = req.body;

  const targetHost = host || currentDbConfig.host;
  const targetPort = Number(port) || currentDbConfig.port;
  const targetUser = user || currentDbConfig.user;
  const targetPassword = password !== undefined ? password : currentDbConfig.password;
  const targetDatabase = database || currentDbConfig.database;

  const config = {
    host: targetHost,
    port: targetPort,
    database: targetDatabase,
    user: targetUser,
    password: targetPassword,
  };

  if (action === "test") {
    const result = await testDbConnection(config);
    res.json(result);
    return;
  }

  // Switch connection
  const switchResult = await switchDatabasePool(config);
  if (!switchResult.success) {
    res.status(400).json(switchResult);
    return;
  }

  const newOverview = await getDatabaseOverview().catch(() => null);
  res.json({
    success: true,
    message: switchResult.message,
    data: newOverview,
  });
});

// 4. API Upload Dataset (.sql hoặc .csv)
app.post("/api/dataset/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: "Không tìm thấy file tải lên." });
    return;
  }

  const originalName = file.originalname.toLowerCase();
  const filePath = file.path;
  const tableName = (req.body.tableName || path.parse(originalName).name || "imported_dataset").trim();
  const delimiter = req.body.delimiter || ",";
  const createNewDb = req.body.createNewDb === "true" || req.body.createNewDb === true;
  const targetDbName = req.body.targetDbName;

  try {
    // Nếu người dùng chọn tạo hẳn CSDL mới độc lập cho dataset này
    if (createNewDb && targetDbName) {
      const createdDb = await createNewDatabase(targetDbName);
      await switchDatabasePool({ ...currentDbConfig, database: createdDb });
    }

    let result: any;
    if (originalName.endsWith(".sql")) {
      result = await executeSqlFile(filePath);
    } else if (originalName.endsWith(".csv") || originalName.endsWith(".txt")) {
      result = await importCsvFile(filePath, tableName, delimiter);
    } else {
      throw new Error("Định dạng file không hỗ trợ. Vui lòng tải lên file .sql hoặc .csv.");
    }

    const updatedOverview = await getDatabaseOverview();
    res.json({
      success: true,
      message: result.message,
      result,
      database: updatedOverview,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi khi nạp dataset",
    });
  } finally {
    // Dọn dẹp file tạm
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  }
});

// 5. API Sinh Dữ Liệu Tự Động (Synthetic Dataset Generator)
app.post("/api/dataset/generate", async (req, res) => {
  const { scale } = req.body;
  const totalRows = Number(scale) || 750000;

  try {
    const result = await generateSyntheticDataset(totalRows);
    const updatedOverview = await getDatabaseOverview();
    res.json({
      success: true,
      message: result.message,
      result,
      database: updatedOverview,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi khi sinh dữ liệu mẫu",
    });
  }
});

// 6. API Phân Tích & Tối Ưu Truy Vấn SQL
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
      message: error.message || "Lỗi khi phân tích và tối ưu SQL",
      stage: error.stage || "UNKNOWN",
    });
  }
});

// 7. API Áp dụng Candidate đã chọn (Tạo Index thật vào CSDL & Lưu History)
app.post("/api/apply", async (req, res) => {
  const { candidate } = req.body;
  if (!candidate) {
    res.status(400).json({ success: false, message: "Thiếu thông tin candidate cần áp dụng." });
    return;
  }

  const result = await applyCandidateAction(candidate);
  res.json(result);
});

// 8. API Hoàn tác (Rollback) thay đổi gần nhất
app.post("/api/rollback", async (_req, res) => {
  const result = await rollbackLatestAction();
  res.json(result);
});

// 9. API Trả về Danh sách Câu SQL Mẫu ĐỘNG theo Schema của CSDL đang kết nối
app.get("/api/samples", async (_req, res) => {
  try {
    const samples = await getDynamicSamples();
    res.json({
      success: true,
      data: samples,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend API Server running at http://localhost:${PORT}`);
});