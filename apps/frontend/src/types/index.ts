export interface Bottleneck {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  type: string;
  message: string;
  table?: string;
  rows?: number;
}

export interface PlanNode {
  id: string;
  type: string;
  relation?: string;
  cost: number;
  rows: number;
  actualTime?: number;
  children?: PlanNode[];
}

export interface QueryMetrics {
  executionTime: number;
  totalCost: number;
  sharedReadBuffers: number;
  sharedHitBuffers?: number;
  planningTime: number;
  rowsReturned?: number;
}

export interface AnalyzedColumn {
  tableName: string;
  columnName: string;
  role: 'JOIN' | 'FILTER_EQUAL' | 'FILTER_RANGE' | 'AGGREGATE' | 'SORT' | 'GROUP' | 'PROJECTION' | string;
  expression?: string;
}

export interface CandidateItem {
  id: string;
  name: string;
  strategy: string;
  description: string;
  sql: string;
  score?: number;
  isBest?: boolean;
  benchmark?: {
    executionTimeMs: number;
    planningTimeMs: number;
    totalCost: number;
    sharedHitBlocks: number;
    sharedReadBlocks: number;
  };
  changes?: Array<{
    type: string;
    action: string;
    targetTable?: string;
    columns?: string[];
    sqlCommand?: string;
    rollbackCommand?: string;
  }>;
}

export interface OptimizationResult {
  originalQuery: string;
  optimizedQuery: string;
  originalMetrics: QueryMetrics;
  optimizedMetrics: QueryMetrics;
  bottlenecks: Bottleneck[];
  executionPlan: PlanNode;
  suggestions: string[];
  improvementPercent: number;
  readReductionPercent?: number;
  costReductionPercent?: number;
  columnRoles?: AnalyzedColumn[];
  candidates?: CandidateItem[];
  bestCandidate?: CandidateItem;
  dataset?: {
    name: string;
    totalRows: number;
  };
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  query: string;
  improvement?: number;
  status?: string;
  candidateName?: string;
  appliedDdl?: string;
  rollbackDdl?: string;
}

export type OptimizationRule = 'all' | 'index_pushdown' | 'join_reorder' | 'partition_pruning' | 'cte_inline';

export type Dataset = {
  label: string;
  value: string;
  rows: string;
};

