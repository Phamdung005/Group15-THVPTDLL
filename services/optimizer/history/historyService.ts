import { pool } from "../../../apps/backend/src/db";
import { OptimizationCandidate } from "../optimizer/candidateGenerator";

export interface HistoryRecord {
  id: number;
  candidateId: string;
  candidateName: string;
  appliedDdl: string;
  rollbackDdl: string;
  status: "APPLIED" | "ROLLED_BACK";
  createdAt: string;
}

/**
 * Khởi tạo bảng lịch sử optimization_history trong PostgreSQL nếu chưa có
 */
export async function initHistoryTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS optimization_history (
        id SERIAL PRIMARY KEY,
        candidate_id VARCHAR(50) NOT NULL,
        candidate_name VARCHAR(100) NOT NULL,
        applied_ddl TEXT NOT NULL,
        rollback_ddl TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err: any) {
    console.warn("[HistoryService] Lỗi khởi tạo bảng optimization_history:", err.message);
  }
}

/**
 * ÁP DỤNG CANDIDATE: Thực thi các lệnh DDL (ngoài transaction) và ghi vào History
 */
export async function applyCandidateAction(
  candidate: OptimizationCandidate
): Promise<{ success: boolean; message: string; historyId?: number }> {
  await initHistoryTable();

  const ddlChanges = candidate.changes.filter((c) => c.type === "CREATE_INDEX" && c.sqlCommand);
  if (ddlChanges.length === 0) {
    return {
      success: true,
      message: `Phương án ${candidate.name} chỉ là viết lại câu lệnh SQL, không yêu cầu thay đổi DDL trong CSDL.`,
    };
  }

  const appliedCommands: string[] = [];
  const rollbackCommands: string[] = [];

  for (const change of ddlChanges) {
    if (change.sqlCommand) {
      try {
        const safeSql = change.sqlCommand.replace(/CREATE\s+INDEX/i, "CREATE INDEX IF NOT EXISTS");
        await pool.query(safeSql);
        appliedCommands.push(safeSql);
        if (change.rollbackCommand) {
          rollbackCommands.push(change.rollbackCommand);
        }
      } catch (err: any) {
        return {
          success: false,
          message: `Lỗi khi thực thi DDL ${change.sqlCommand}: ${err.message}`,
        };
      }
    }
  }

  // Ghi vào bảng lịch sử
  try {
    const res = await pool.query(
      `
      INSERT INTO optimization_history (candidate_id, candidate_name, applied_ddl, rollback_ddl, status)
      VALUES ($1, $2, $3, $4, 'APPLIED')
      RETURNING id;
      `,
      [
        candidate.id,
        candidate.name,
        appliedCommands.join("\n"),
        rollbackCommands.join("\n"),
      ]
    );

    return {
      success: true,
      message: `Đã áp dụng thành công phương án ${candidate.name}!`,
      historyId: res.rows[0]?.id,
    };
  } catch (err: any) {
    return {
      success: true,
      message: `Đã thực thi DDL thành công (Ghi log lịch sử: ${err.message})`,
    };
  }
}

/**
 * HOÀN TÁC (ROLLBACK): Tra cứu thay đổi gần nhất và thực thi lệnh DROP INDEX tương ứng
 */
export async function rollbackLatestAction(): Promise<{ success: boolean; message: string }> {
  await initHistoryTable();

  try {
    const latestRes = await pool.query(`
      SELECT id, candidate_name, rollback_ddl
      FROM optimization_history
      WHERE status = 'APPLIED'
      ORDER BY id DESC
      LIMIT 1;
    `);

    if (latestRes.rows.length === 0) {
      return {
        success: false,
        message: "Không có thay đổi nào đang ở trạng thái APPLIED để hoàn tác.",
      };
    }

    const { id, candidate_name, rollback_ddl } = latestRes.rows[0];
    const commands = rollback_ddl.split("\n").filter((cmd: string) => cmd.trim().length > 0);

    for (const cmd of commands) {
      await pool.query(cmd);
    }

    await pool.query(
      `UPDATE optimization_history SET status = 'ROLLED_BACK' WHERE id = $1;`,
      [id]
    );

    return {
      success: true,
      message: `Đã hoàn tác thành công thay đổi của ${candidate_name}!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi khi thực hiện hoàn tác: ${err.message}`,
    };
  }
}
