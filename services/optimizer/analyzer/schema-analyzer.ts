import { pool } from "../../../apps/backend/src/db";

export interface ExistingIndex {
  tablename: string;
  indexname: string;
  indexdef: string;
}

export async function fetchExistingIndexes(tablename: string): Promise<ExistingIndex[]> {
  try {
    const query = `
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1;
    `;
    const res = await pool.query(query, [tablename]);
    return res.rows;
  } catch (err) {
    return [];
  }
}
