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
  planningTime: number;
  rowsReturned: number;
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
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  query: string;
  improvement: number;
  executionTimeBefore: number;
  executionTimeAfter: number;
}

export type OptimizationRule = 'all' | 'index_pushdown' | 'join_reorder' | 'partition_pruning' | 'cte_inline';

export type Dataset = {
  label: string;
  value: string;
  rows: string;
};
