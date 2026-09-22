import { pool } from "../../../apps/backend/src/db";

export interface DetailedIndexInfo {
  tableName: string;
  indexName: string;
  columns: string[];
  isPrimary: boolean;
  isUnique: boolean;
  indexDef: string;
}

export interface TableConstraintInfo {
  tableName: string;
  constraintName: string;
  constraintType: "PRIMARY KEY" | "UNIQUE" | "FOREIGN KEY" | "CHECK";
  columns: string[];
}

/**
 * Lấy danh sách toàn bộ Index chi tiết của bảng từ PostgreSQL Catalog
 * (pg_index, pg_class, pg_attribute) bao gồm thứ tự cột, cờ PK, cờ Unique.
 */
export async function fetchDetailedIndexes(tableName: string): Promise<DetailedIndexInfo[]> {
  try {
    const query = `
      SELECT
        c.relname AS table_name,
        i.relname AS index_name,
        ix.indisprimary AS is_primary,
        ix.indisunique AS is_unique,
        ARRAY_TO_STRING(
          ARRAY(
            SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
            FROM generate_subscripts(ix.indkey, 1) as k
            ORDER BY k
          ), ', '
        ) AS column_names,
        pg_get_indexdef(ix.indexrelid) AS index_def
      FROM pg_index ix
      JOIN pg_class c ON c.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1;
    `;

    const res = await pool.query(query, [tableName.toLowerCase()]);
    return res.rows.map((r: any) => ({
      tableName: r.table_name,
      indexName: r.index_name,
      columns: r.column_names
        ? r.column_names.split(",").map((c: string) => c.trim().toLowerCase())
        : [],
      isPrimary: Boolean(r.is_primary),
      isUnique: Boolean(r.is_unique),
      indexDef: r.index_def || "",
    }));
  } catch (err: any) {
    console.warn(`[SchemaAnalyzer] Không thể đọc catalog indexes cho bảng ${tableName}:`, err.message);
    return [];
  }
}

/**
 * Kiểm tra xem một cột hoặc tập cột đã được bao phủ bởi Index có sẵn chưa:
 * 1. Đã là Primary Key (đã có index ngầm định).
 * 2. Đã là tiền tố (prefix) của một Composite Index có sẵn (tránh tạo index thừa).
 */
export async function isIndexCovered(
  tableName: string,
  targetColumns: string[]
): Promise<{ covered: boolean; existingIndexName?: string; reason?: string }> {
  if (targetColumns.length === 0) return { covered: true, reason: "Không có cột cần index" };

  const existingIndexes = await fetchDetailedIndexes(tableName);
  const normalizedTargets = targetColumns.map((c) => c.toLowerCase());

  for (const idx of existingIndexes) {
    // 1. Cột là Primary Key
    if (idx.isPrimary && normalizedTargets.length === 1 && idx.columns.includes(normalizedTargets[0])) {
      return {
        covered: true,
        existingIndexName: idx.indexName,
        reason: `Cột \`${normalizedTargets[0]}\` đã là Primary Key của bảng \`${tableName}\``,
      };
    }

    // 2. Prefix Check: Nếu targetColumns là tiền tố liên tục của Index đã có
    const isPrefix = normalizedTargets.every((col, i) => idx.columns[i] === col);
    if (isPrefix) {
      return {
        covered: true,
        existingIndexName: idx.indexName,
        reason: `Cột (${normalizedTargets.join(", ")}) đã được bao phủ bởi tiền tố của index \`${idx.indexName}\` (${idx.columns.join(", ")})`,
      };
    }
  }

  return { covered: false };
}
