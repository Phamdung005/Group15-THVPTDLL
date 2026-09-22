import { OptimizationCandidate } from "./candidateGenerator";

export interface CandidateValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Xác thực tính hợp lệ, an toàn và khả thi của Candidate trước khi đưa vào Benchmark Engine.
 */
export function validateCandidate(candidate: OptimizationCandidate): CandidateValidationResult {
  // 1. Kiểm tra câu lệnh SQL
  const sql = candidate.sql.trim();
  if (!sql) {
    return { valid: false, reason: "Câu lệnh SQL rỗng" };
  }

  // Chặn các câu lệnh ghi nguy hiểm trong SQL của candidate
  if (/^\s*(DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER)\b/i.test(sql)) {
    return { valid: false, reason: "Candidate chứa lệnh ghi không an toàn" };
  }

  // 2. Kiểm tra các thay đổi DDL (nếu có)
  for (const change of candidate.changes) {
    if (change.type === "CREATE_INDEX") {
      if (!change.sqlCommand || !/CREATE\s+INDEX/i.test(change.sqlCommand)) {
        return { valid: false, reason: `Lệnh DDL không hợp lệ: ${change.sqlCommand}` };
      }
      if (!change.rollbackCommand || !/DROP\s+INDEX/i.test(change.rollbackCommand)) {
        return { valid: false, reason: `Thiếu lệnh Rollback cho DDL: ${change.sqlCommand}` };
      }
    }
  }

  return { valid: true };
}
