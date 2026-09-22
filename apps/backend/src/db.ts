import pg from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const { Pool } = pg;

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

export let currentDbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "bigdata_optimizer",
};

export let pool = new Pool(currentDbConfig);

/**
 * Kiểm tra kết nối tới cơ sở dữ liệu với thông tin cấu hình cung cấp
 */
export async function testDbConnection(config: DatabaseConfig): Promise<{ success: boolean; message: string; version?: string }> {
  const testPool = new Pool({
    ...config,
    connectionTimeoutMillis: 5000,
  });

  try {
    const res = await testPool.query("SELECT version();");
    await testPool.end();
    return {
      success: true,
      message: "Kết nối thành công!",
      version: res.rows[0].version,
    };
  } catch (error: any) {
    try {
      await testPool.end();
    } catch {}
    return {
      success: false,
      message: error.message || "Không thể kết nối tới cơ sở dữ liệu",
    };
  }
}

/**
 * Chuyển đổi connection pool sang database mới
 */
export async function switchDatabasePool(newConfig: DatabaseConfig): Promise<{ success: boolean; message: string }> {
  const check = await testDbConnection(newConfig);
  if (!check.success) {
    return check;
  }

  try {
    const oldPool = pool;
    pool = new Pool(newConfig);
    currentDbConfig = { ...newConfig };
    
    // Đóng pool cũ an toàn
    oldPool.end().catch(() => {});

    return {
      success: true,
      message: `Đã kết nối thành công tới database ${newConfig.database} (${newConfig.host}:${newConfig.port})`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi khi chuyển đổi pool: ${err.message}`,
    };
  }
}