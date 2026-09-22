import { pool } from "../../../apps/backend/src/db";

export interface ColumnStatInfo {
  tableName: string;
  columnName: string;
  nullFraction: number;
  distinctCount: number;
  estimatedSelectivity: number;
  isHighSelectivity: boolean; // true nếu độ chọn lọc tốt (< 15% tổng số dòng)
}

/**
 * Phân tích độ chọn lọc (Selectivity) của cột dựa trên catalog pg_stats của PostgreSQL.
 * Giúp Optimizer quyết định Index Scan có mang lại lợi thế vượt trội so với Sequential Scan hay không.
 */
export async function analyzeColumnSelectivity(
  tableName: string,
  columnName: string,
  filterValue?: string
): Promise<ColumnStatInfo> {
  const defaultStat: ColumnStatInfo = {
    tableName,
    columnName,
    nullFraction: 0,
    distinctCount: 100,
    estimatedSelectivity: 0.05,
    isHighSelectivity: true,
  };

  try {
    const query = `
      SELECT
        s.null_frac,
        s.n_distinct,
        s.most_common_vals::text AS mcv,
        s.most_common_freqs::text AS mcf,
        c.reltuples AS total_rows
      FROM pg_stats s
      JOIN pg_class c ON c.relname = s.tablename
      WHERE s.schemaname = 'public'
        AND s.tablename = $1
        AND s.attname = $2;
    `;

    const res = await pool.query(query, [tableName.toLowerCase(), columnName.toLowerCase()]);
    if (res.rows.length === 0) {
      return defaultStat;
    }

    const row = res.rows[0];
    const nDistinct = Number(row.n_distinct);
    const totalRows = Math.max(1, Number(row.total_rows));
    let selectivity = 0.05;

    // 1. Nếu n_distinct > 0: số lượng giá trị phân biệt cố định (ví dụ status = 4 giá trị)
    // 2. Nếu n_distinct < 0: tỷ lệ phân biệt âm tính theo -distinct/totalRows (ví dụ id = -1.0)
    if (nDistinct < 0) {
      selectivity = Math.abs(1 / (nDistinct * totalRows));
    } else if (nDistinct > 0) {
      selectivity = 1 / nDistinct;
    }

    // Nếu có giá trị lọc cụ thể, tra cứu tần suất trong most_common_vals
    if (filterValue && row.mcv && row.mcf) {
      try {
        const mcvList = row.mcv.replace(/[{}"]/g, "").split(",");
        const mcfList = row.mcf.replace(/[{}"]/g, "").split(",").map(Number);
        const valIndex = mcvList.findIndex((v: string) => v.trim().toLowerCase() === filterValue.toLowerCase());
        if (valIndex !== -1 && mcfList[valIndex] !== undefined) {
          selectivity = mcfList[valIndex];
        }
      } catch {}
    }

    return {
      tableName,
      columnName,
      nullFraction: Number(row.null_frac || 0),
      distinctCount: Math.abs(nDistinct),
      estimatedSelectivity: Number(selectivity.toFixed(4)),
      isHighSelectivity: selectivity < 0.2, // Dưới 20% dòng là ứng viên Index tốt
    };
  } catch (err: any) {
    console.warn(`[SelectivityAnalyzer] Lỗi khi tra cứu selectivity ${tableName}.${columnName}:`, err.message);
    return defaultStat;
  }
}
