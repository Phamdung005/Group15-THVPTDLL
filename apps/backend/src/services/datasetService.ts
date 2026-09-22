import { pool, currentDbConfig } from "../db";
import pg from "pg";
const { Pool } = pg;
import fs from "fs";

export interface DatabaseListItem {
  name: string;
  totalRows: number;
  totalRowsFormatted: string;
  sizeFormatted: string;
  label: string;
  isCurrent: boolean;
}

export interface DatabaseOverviewDTO {
  database: string;
  host: string;
  port: number;
  engine: string;
  totalTables: number;
  totalRows: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  tables: Array<{
    name: string;
    rowCount: number;
    sizeFormatted: string;
  }>;
}

/**
 * Lấy toàn bộ số liệu thống kê hiện tại của PostgreSQL Database
 */
export async function getDatabaseOverview(): Promise<DatabaseOverviewDTO> {
  const versionRes = await pool.query("SELECT version() as ver;");
  const engineVersion = versionRes.rows[0]?.ver || "PostgreSQL 16";
  const shortEngine = engineVersion.split("on")[0].trim();

  // 1. Thống kê bảng và số dòng
  const tablesRes = await pool.query(`
    SELECT 
      relname AS table_name,
      COALESCE(n_live_tup, 0) AS row_count,
      pg_size_pretty(pg_total_relation_size(relid)) AS size_formatted,
      pg_total_relation_size(relid) AS size_bytes
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC;
  `);

  // 2. Thống kê kích thước database
  const sizeRes = await pool.query(`
    SELECT 
      pg_database_size(current_database()) AS total_bytes,
      pg_size_pretty(pg_database_size(current_database())) AS formatted_size;
  `);

  const totalBytes = Number(sizeRes.rows[0]?.total_bytes || 0);
  const totalSizeFormatted = sizeRes.rows[0]?.formatted_size || "0 MB";

  const tables = tablesRes.rows.map((r: any) => ({
    name: r.table_name,
    rowCount: Number(r.row_count),
    sizeFormatted: r.size_formatted,
  }));

  const totalRows = tables.reduce((acc, t) => acc + t.rowCount, 0);

  return {
    database: currentDbConfig.database,
    host: currentDbConfig.host,
    port: currentDbConfig.port,
    engine: shortEngine,
    totalTables: tables.length,
    totalRows,
    totalSizeBytes: totalBytes,
    totalSizeFormatted,
    tables,
  };
}

/**
 * Lấy danh sách các Database có sẵn trên PostgreSQL Server
 */
export async function listAvailableDatabases(): Promise<DatabaseListItem[]> {
  const adminClient = await pool.connect();
  try {
    const res = await adminClient.query(`
      SELECT 
        datname, 
        pg_size_pretty(pg_database_size(datname)) as size_str,
        pg_database_size(datname) as size_bytes
      FROM pg_database 
      WHERE datistemplate = false AND datname != 'postgres'
      ORDER BY 
        CASE 
          WHEN datname = 'e_commerce_db' THEN 1
          WHEN datname = 'log_analytics_db' THEN 2
          WHEN datname = 'crm_warehouse_db' THEN 3
          WHEN datname = 'iot_timeseries_db' THEN 4
          WHEN datname = 'bigdata_optimizer' THEN 5
          ELSE 6
        END,
        pg_database_size(datname) DESC;
    `);

    const items: DatabaseListItem[] = [];
    for (const row of res.rows) {
      const datname = row.datname;
      const isCurrent = datname === currentDbConfig.database;

      let rows = 0;
      let rowsFormatted = "";

      try {
        if (isCurrent) {
          const rowCountRes = await adminClient.query(
            "SELECT COALESCE(SUM(n_live_tup), 0) AS total_rows FROM pg_stat_user_tables;"
          );
          rows = Number(rowCountRes.rows[0]?.total_rows || 0);
        } else {
          const tmpPool = new Pool({ ...currentDbConfig, database: datname, connectionTimeoutMillis: 2000 });
          const rowCountRes = await tmpPool.query(
            "SELECT COALESCE(SUM(n_live_tup), 0) AS total_rows FROM pg_stat_user_tables;"
          );
          rows = Number(rowCountRes.rows[0]?.total_rows || 0);
          await tmpPool.end().catch(() => { });
        }
      } catch {
        rows = 0;
      }

      if (rows >= 1000000) {
        rowsFormatted = `${(rows / 1000000).toFixed(1)} triệu dòng`;
      } else if (rows >= 1000) {
        rowsFormatted = `${(rows / 1000).toFixed(1)}k dòng`;
      } else {
        rowsFormatted = `${rows} dòng`;
      }

      items.push({
        name: datname,
        totalRows: rows,
        totalRowsFormatted: rowsFormatted,
        sizeFormatted: row.size_str || "0 MB",
        label: `${datname} (${rowsFormatted})`,
        isCurrent,
      });
    }

    return items;
  } finally {
    adminClient.release();
  }
}

/**
 * Tạo một database mới trên PostgreSQL server nếu chưa có
 */
export async function createNewDatabase(dbName: string): Promise<string> {
  const safeDb = dbName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const check = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [safeDb]);
  if (check.rows.length === 0) {
    await pool.query(`CREATE DATABASE "${safeDb}";`);
  }
  return safeDb;
}

/**
 * Thực thi file .SQL do người dùng tải lên
 */
export async function executeSqlFile(filePath: string): Promise<{ success: boolean; message: string; statementsExecuted: number }> {
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.trim()) {
    throw new Error("File SQL rỗng.");
  }

  // Chạy câu lệnh SQL trong transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    await client.query(content);
    await client.query("COMMIT;");

    // Thu thập lại thống kê sau khi nạp DDL/DML
    await client.query("ANALYZE;");
    return {
      success: true,
      message: "Đã nạp và thực thi file SQL thành công vào cơ sở dữ liệu!",
      statementsExecuted: content.split(";").filter((s) => s.trim().length > 0).length,
    };
  } catch (err: any) {
    await client.query("ROLLBACK;");
    throw new Error(`Lỗi khi thực thi file SQL: ${err.message}`);
  } finally {
    client.release();
  }
}

/**
 * Nạp file CSV vào bảng mục tiêu trong PostgreSQL
 */
export async function importCsvFile(
  filePath: string,
  tableName: string,
  delimiter: string = ","
): Promise<{ success: boolean; message: string; rowsImported: number }> {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("File CSV cần ít nhất một dòng tiêu đề (header) và một dòng dữ liệu.");
  }

  const rawHeaders = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const cleanHeaders = rawHeaders.map((h, i) => (h ? h.toLowerCase().replace(/[^a-z0-9_]/g, "_") : `col_${i + 1}`));
  const safeTable = tableName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // Tạo bảng nếu chưa tồn tại (mặc định kiểu TEXT cho an toàn)
    const colDefs = cleanHeaders.map((h) => `"${h}" TEXT`).join(", ");
    await client.query(`CREATE TABLE IF NOT EXISTS "${safeTable}" (${colDefs});`);

    // Batch insert dữ liệu
    const dataLines = lines.slice(1);
    const BATCH_SIZE = 500;
    let totalImported = 0;

    for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
      const chunk = dataLines.slice(i, i + BATCH_SIZE);
      const valueRows: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      for (const line of chunk) {
        const values = line.split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ""));
        // Đảm bảo đủ số cột
        while (values.length < cleanHeaders.length) values.push("");
        const rowParams = values.slice(0, cleanHeaders.length).map((val) => {
          params.push(val);
          return `$${paramIdx++}`;
        });
        valueRows.push(`(${rowParams.join(", ")})`);
      }

      if (valueRows.length > 0) {
        const insertQuery = `
          INSERT INTO "${safeTable}" (${cleanHeaders.map((h) => `"${h}"`).join(", ")})
          VALUES ${valueRows.join(", ")};
        `;
        await client.query(insertQuery, params);
        totalImported += valueRows.length;
      }
    }

    await client.query("COMMIT;");
    await client.query(`ANALYZE "${safeTable}";`);

    return {
      success: true,
      message: `Đã nạp thành công ${totalImported} dòng vào bảng "${safeTable}"!`,
      rowsImported: totalImported,
    };
  } catch (err: any) {
    await client.query("ROLLBACK;");
    throw new Error(`Lỗi khi nạp CSV vào bảng ${safeTable}: ${err.message}`);
  } finally {
    client.release();
  }
}

/**
 * Sinh dữ liệu mẫu Big Data tự động (Synthetic Dataset Generator)
 * Cho phép người dùng sinh trực tiếp 100k, 750k, 2M, 5.2M dòng
 */
export async function generateSyntheticDataset(
  targetTotalRows: number
): Promise<{ success: boolean; message: string; rowsGenerated: number; durationSeconds: number }> {
  const startTime = Date.now();

  const numCustomers = Math.max(10000, Math.floor(targetTotalRows * 0.07));
  const numOrders = Math.max(25000, Math.floor(targetTotalRows * 0.26));
  const numItems = Math.max(50000, targetTotalRows - numCustomers - numOrders);

  const client = await pool.connect();
  try {
    await client.query(`
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;

      CREATE TABLE customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100),
        created_at TIMESTAMP
      );

      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id INT,
        status VARCHAR(20),
        total_amount DECIMAL(10, 2),
        created_at TIMESTAMP
      );

      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INT,
        product_name VARCHAR(100),
        quantity INT,
        unit_price DECIMAL(10, 2)
      );
    `);

    await client.query(`
      INSERT INTO customers (name, email, created_at)
      SELECT 
        'Customer_' || i,
        'user_' || i || '@example.com',
        NOW() - (random() * interval '730 days')
      FROM generate_series(1, ${numCustomers}) AS i;
    `);

    await client.query(`
      INSERT INTO orders (customer_id, status, total_amount, created_at)
      SELECT 
        floor(random() * ${numCustomers} + 1)::int,
        (ARRAY['completed', 'pending', 'cancelled', 'processing'])[floor(random() * 4 + 1)::int],
        round((random() * 480 + 20)::numeric, 2),
        NOW() - (random() * interval '365 days')
      FROM generate_series(1, ${numOrders}) AS i;
    `);

    // 4. Sinh Order Items
    await client.query(`
      INSERT INTO order_items (order_id, product_name, quantity, unit_price)
      SELECT 
        floor(random() * ${numOrders} + 1)::int,
        'Product_' || floor(random() * 2000 + 1)::int,
        floor(random() * 5 + 1)::int,
        round((random() * 95 + 5)::numeric, 2)
      FROM generate_series(1, ${numItems}) AS i;
    `);

    // Thu thập lại thống kê
    await client.query("ANALYZE;");

    const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));
    const totalActual = numCustomers + numOrders + numItems;

    return {
      success: true,
      message: `Đã sinh thành công ${totalActual.toLocaleString()} dòng dữ liệu (${numCustomers.toLocaleString()} customers, ${numOrders.toLocaleString()} orders, ${numItems.toLocaleString()} order_items) trong ${durationSeconds}s!`,
      rowsGenerated: totalActual,
      durationSeconds,
    };
  } catch (err: any) {
    throw new Error(`Lỗi khi sinh dữ liệu: ${err.message}`);
  } finally {
    client.release();
  }
}

export interface SampleQueryDTO {
  id: string;
  title: string;
  sql: string;
}

/**
 * Sinh danh sách câu lệnh SQL mẫu động tương thích 100% với Schema của Database hiện tại
 */
export async function getDynamicSamples(): Promise<SampleQueryDTO[]> {
  try {
    const res = await pool.query(`
      SELECT 
        c.table_name,
        c.column_name,
        c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t 
        ON c.table_name = t.table_name AND c.table_schema = t.table_schema
      WHERE c.table_schema = 'public' 
        AND t.table_type = 'BASE TABLE'
        AND c.table_name != 'optimization_history'
      ORDER BY c.table_name, c.ordinal_position;
    `);

    const tableMap = new Map<string, Array<{ name: string; type: string }>>();
    for (const row of res.rows) {
      const tbl = row.table_name;
      if (!tableMap.has(tbl)) tableMap.set(tbl, []);
      tableMap.get(tbl)!.push({ name: row.column_name, type: row.data_type.toLowerCase() });
    }

    const tableNames = Array.from(tableMap.keys());

    // Nếu không có bảng nào trong CSDL
    if (tableNames.length === 0) {
      return [
        {
          id: "empty-sample",
          title: "Chưa có bảng dữ liệu (Hãy Import hoặc sinh Dataset)",
          sql: "SELECT 1 as test;",
        },
      ];
    }

    // TRƯỜNG HỢP 1: Database mặc định có bảng orders, customers, order_items
    if (tableMap.has("orders") && tableMap.has("customers")) {
      return [
        {
          id: "sample-1",
          title: "Nghẽn JOIN do thiếu Index (Bảng orders & customers)",
          sql: "SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = 'completed';",
        },
        {
          id: "sample-2",
          title: "Nghẽn Lớn: Quét Sequential Scan trên order_items",
          sql: "SELECT * FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.unit_price > 50;",
        },
        {
          id: "sample-3",
          title: "Non-Sargable Function: YEAR(o.created_at) = 2024",
          sql: "SELECT o.id, o.total_amount FROM orders o WHERE YEAR(o.created_at) = 2024;",
        },
        {
          id: "sample-4",
          title: "Tổng hợp doanh thu kèm gom nhóm & sắp xếp",
          sql: "SELECT c.id, c.name, SUM(o.total_amount) AS revenue FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.id, c.name ORDER BY revenue DESC LIMIT 20;",
        },
      ];
    }

    // TRƯỜNG HỢP 2: Bất kỳ Database nào khác (Tự động thích ứng các bảng thật)
    const samples: SampleQueryDTO[] = [];
    const primaryTable = tableNames[0];
    const primaryCols = tableMap.get(primaryTable) || [];

    // 1. Mẫu Missing Index (WHERE trên cột dạng chuỗi text/varchar)
    const textCol = primaryCols.find(c => c.type.includes("char") || c.type.includes("text") || c.name.includes("email") || c.name.includes("name") || c.name.includes("status")) || primaryCols[1] || primaryCols[0];
    if (textCol) {
      samples.push({
        id: `sample-where-${primaryTable}`,
        title: `[${primaryTable}] Lọc WHERE trên cột chưa có Index (${textCol.name})`,
        sql: `SELECT * FROM ${primaryTable} WHERE ${textCol.name} = 'sample_value' LIMIT 100;`,
      });
    }

    // 2. Mẫu Sequential Scan (lọc trên cột số hoặc id)
    const numCol = primaryCols.find(c => c.type.includes("int") || c.type.includes("numeric") || c.type.includes("decimal") || c.name.includes("price") || c.name.includes("amount") || c.name.includes("id")) || primaryCols[0];
    if (numCol) {
      const secondTable = tableNames[1] || primaryTable;
      const secondCols = tableMap.get(secondTable) || [];
      const targetCol = (secondTable !== primaryTable ? (secondCols.find(c => c.type.includes("int") || c.type.includes("numeric")) || secondCols[0]) : numCol) || numCol;
      samples.push({
        id: `sample-seqscan-${secondTable}`,
        title: `[${secondTable}] Quét tuần tự (Seq Scan) với điều kiện lọc ${targetCol.name}`,
        sql: `SELECT * FROM ${secondTable} WHERE ${targetCol.name} > 10 LIMIT 100;`,
      });
    }

    // 3. Mẫu Non-Sargable Function
    let dateFound: { table: string; col: string } | null = null;
    for (const tbl of tableNames) {
      const cols = tableMap.get(tbl) || [];
      const dateCol = cols.find(c => c.type.includes("date") || c.type.includes("time") || c.name.includes("created") || c.name.includes("date"));
      if (dateCol) {
        dateFound = { table: tbl, col: dateCol.name };
        break;
      }
    }

    if (dateFound) {
      samples.push({
        id: `sample-func-${dateFound.table}`,
        title: `[${dateFound.table}] Lỗi Non-Sargable Function: YEAR(${dateFound.col}) = 2024`,
        sql: `SELECT * FROM ${dateFound.table} WHERE YEAR(${dateFound.col}) = 2024;`,
      });
    } else if (textCol) {
      samples.push({
        id: `sample-func-upper-${primaryTable}`,
        title: `[${primaryTable}] Lỗi Non-Sargable Function: UPPER(${textCol.name}) = 'TEST'`,
        sql: `SELECT * FROM ${primaryTable} WHERE UPPER(${textCol.name}) = 'TEST';`,
      });
    }

    // 4. Mẫu GROUP BY & ORDER BY
    const groupTable = tableNames[tableNames.length - 1];
    const groupCols = tableMap.get(groupTable) || [];
    const colA = groupCols[1]?.name || groupCols[0]?.name || "id";
    samples.push({
      id: `sample-group-${groupTable}`,
      title: `[${groupTable}] Gom nhóm & Sắp xếp (GROUP BY ${colA} ORDER BY total DESC)`,
      sql: `SELECT ${colA}, COUNT(*) AS total FROM ${groupTable} GROUP BY ${colA} ORDER BY total DESC LIMIT 50;`,
    });

    // 5. Mẫu JOIN (Nếu có từ 2 bảng trở lên)
    if (tableNames.length >= 2) {
      const t1 = tableNames[0];
      const t2 = tableNames[1];
      const t1Cols = tableMap.get(t1) || [];
      const t2Cols = tableMap.get(t2) || [];

      const fkInT2 = t2Cols.find(c => c.name === `${t1}_id` || c.name === `${t1.replace(/s$/, "")}_id`);
      const fkInT1 = t1Cols.find(c => c.name === `${t2}_id` || c.name === `${t2.replace(/s$/, "")}_id`);

      if (fkInT2) {
        samples.push({
          id: `sample-join-${t1}-${t2}`,
          title: `[${t1} & ${t2}] Truy vấn JOIN theo liên kết (${t1}.id = ${t2}.${fkInT2.name})`,
          sql: `SELECT * FROM ${t1} t1 JOIN ${t2} t2 ON t1.id = t2.${fkInT2.name} LIMIT 50;`,
        });
      } else if (fkInT1) {
        samples.push({
          id: `sample-join-${t2}-${t1}`,
          title: `[${t2} & ${t1}] Truy vấn JOIN theo liên kết (${t2}.id = ${t1}.${fkInT1.name})`,
          sql: `SELECT * FROM ${t2} t2 JOIN ${t1} t1 ON t2.id = t1.${fkInT1.name} LIMIT 50;`,
        });
      } else {
        samples.push({
          id: `sample-join-generic`,
          title: `[${t1} & ${t2}] Truy vấn JOIN kết hợp 2 bảng`,
          sql: `SELECT t1.id, t2.id FROM ${t1} t1 JOIN ${t2} t2 ON t1.id = t2.id LIMIT 50;`,
        });
      }
    }

    return samples;
  } catch (err) {
    return [
      {
        id: "fallback-sample",
        title: "Truy vấn cơ bản",
        sql: "SELECT 1 as test;",
      },
    ];
  }
}
