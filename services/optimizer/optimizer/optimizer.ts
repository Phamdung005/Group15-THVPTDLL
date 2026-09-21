import { analyzeAndOptimizeSQL, OptimizationResponse } from "../index";

export class SQLOptimizerCore {
  public async processQuery(sql: string): Promise<OptimizationResponse> {
    return await analyzeAndOptimizeSQL(sql);
  }
}
