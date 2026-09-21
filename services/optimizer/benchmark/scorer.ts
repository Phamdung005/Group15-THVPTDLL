export interface HealthScoreResult {
  score: number; // 0 to 100
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
}

export function calculateQueryHealthScore(
  executionTimeMs: number,
  queryCost: number,
  sharedReads: number
): HealthScoreResult {
  let penalty = 0;

  // Execution Time Penalties
  if (executionTimeMs > 2000) penalty += 40;
  else if (executionTimeMs > 500) penalty += 25;
  else if (executionTimeMs > 100) penalty += 10;

  // Query Cost Penalties
  if (queryCost > 10000) penalty += 30;
  else if (queryCost > 2000) penalty += 20;
  else if (queryCost > 500) penalty += 10;

  // Shared Disk Reads Penalties (High I/O is bad)
  if (sharedReads > 5000) penalty += 30;
  else if (sharedReads > 1000) penalty += 20;
  else if (sharedReads > 100) penalty += 10;

  const score = Math.max(0, Math.min(100, 100 - penalty));

  let grade: "A" | "B" | "C" | "D" | "F" = "A";
  let summary = "Truy vấn đạt hiệu năng rất tốt.";

  if (score < 50) {
    grade = "F";
    summary = "Truy vấn có điểm nghẽn nghiêm trọng, cần tối ưu ngay.";
  } else if (score < 70) {
    grade = "C";
    summary = "Truy vấn có thể nâng cấp hiệu năng bằng cách thêm Index.";
  } else if (score < 85) {
    grade = "B";
    summary = "Truy vấn hoạt động khá ổn định.";
  }

  return { score, grade, summary };
}
