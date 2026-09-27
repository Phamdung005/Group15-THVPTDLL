import React, { useCallback, useEffect, useState } from 'react';
import { ConfigProvider, notification, theme } from 'antd';
import { Header } from './components/Header';
import { SqlEditor } from './components/SqlEditor';
import {
  BottleneckSummary,
  CandidateMatrix,
  ColumnRolesSection,
  ExecutionPlanSection,
  RecommendationSection,
} from './components/AdvisorSections';
import { BenchmarkCharts } from './components/BenchmarkCharts';
import { DATASETS, SAMPLE_QUERIES } from './data/mockData';
import type { OptimizationRule, HistoryItem } from './types';
import type { Bottleneck, PlanNode, OptimizationResult } from './types';
import {
  getSamples,
  getDatabaseInfo,
  getDatabaseList,
  switchDatabase,
  optimizeQuery,
  applyCandidate,
  rollbackAction,
  getHistory,
  type DatabaseOverview,
  type DatabaseItem,
} from './api/api';
import { DataSourceModal } from './components/DataSourceModal';
import './App.css';

const ANT_THEME = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#06b6d4',
    colorBgBase: '#0f172a',
    colorBgContainer: '#111c30',
    colorBgElevated: '#17243a',
    colorBorder: '#263752',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#f43f5e',
    borderRadius: 7,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
  },
};

// Helper: convert backend plan tree to UI PlanNode format
function convertPlanNode(node: any): PlanNode {
  return {
    id: Math.random().toString(36).slice(2),
    type: node.nodeType ?? node['Node Type'] ?? 'Unknown',
    relation: node.relationName ?? node['Relation Name'],
    cost: node.totalCost ?? node['Total Cost'] ?? 0,
    rows: node.planRows ?? node['Plan Rows'] ?? 0,
    actualTime: node.actualTotalTime ?? node['Actual Total Time'],
    children: (node.plans ?? node['Plans'])?.map(convertPlanNode),
  };
}

// Helper: extract bottlenecks from backend result
function extractBottlenecks(result: any): Bottleneck[] {
  if (result?.bottlenecks && Array.isArray(result.bottlenecks)) {
    return result.bottlenecks.map((b: any, index: number) => ({
      id: b.id || `bot-${index}`,
      severity: b.severity === 'high' ? 'critical' : (b.severity === 'medium' ? 'warning' : 'info'),
      type: b.title || b.type || 'Điểm nghẽn',
      message: b.description || b.message || '',
      table: b.table || b.tableName,
    }));
  }
  return [];
}


// Helper: extract execution plan from backend result
function extractPlan(result: any): PlanNode | undefined {
  try {
    if (result?.planTree) return convertPlanNode(result.planTree);
    if (result?.executionPlan) return result.executionPlan;
  } catch {}
  return undefined;
}

// Helper: build OptimizationResult from API response
function buildOptimizationResult(apiResult: any, originalSql: string): OptimizationResult {
  const best = apiResult?.bestCandidate;
  const bench = best?.benchmark;
  const baseline = apiResult?.metrics?.baseline || apiResult?.candidates?.[0]?.benchmark;

  const originalMetrics = {
    executionTime: baseline?.executionTimeMs ?? 0,
    totalCost: baseline?.totalCost ?? 0,
    sharedReadBuffers: baseline?.sharedReadBlocks ?? 0,
    sharedHitBuffers: baseline?.sharedHitBlocks ?? 0,
    planningTime: baseline?.planningTimeMs ?? 0,
    rowsReturned: baseline?.planRows ?? 0,
  };

  const optimizedMetrics = {
    executionTime: bench?.executionTimeMs ?? originalMetrics.executionTime,
    totalCost: bench?.totalCost ?? originalMetrics.totalCost,
    sharedReadBuffers: bench?.sharedReadBlocks ?? originalMetrics.sharedReadBuffers,
    sharedHitBuffers: bench?.sharedHitBlocks ?? originalMetrics.sharedHitBuffers,
    planningTime: bench?.planningTimeMs ?? originalMetrics.planningTime,
    rowsReturned: bench?.planRows ?? 0,
  };

  const improvementPercent = apiResult?.metrics?.improvementPercent
    ?? apiResult?.comparison?.scores?.[best?.id]?.timeImprovementPercent
    ?? 0;

  return {
    originalQuery: originalSql,
    optimizedQuery: best?.changes?.find((c: any) => c.sqlCommand)?.sqlCommand || best?.sql || originalSql,
    originalMetrics,
    optimizedMetrics,
    bottlenecks: extractBottlenecks(apiResult),
    executionPlan: extractPlan(apiResult)!,
    suggestions: best?.changes?.map((c: any) => c.sqlCommand).filter(Boolean) || [],
    improvementPercent,
    readReductionPercent: apiResult?.metrics?.readReductionPercent ?? 0,
    costReductionPercent: apiResult?.metrics?.costReductionPercent ?? 0,
    columnRoles: apiResult?.analysis?.columnRoles || [],
    candidates: apiResult?.candidates || [],
    bestCandidate: best,
    dataset: apiResult?.dataset,
  };
}

export default function App() {
  const [api, contextHolder] = notification.useNotification();
  const [selectedDataset, setSelectedDataset] = useState('bigdata_optimizer');
  const [sql, setSql] = useState(SAMPLE_QUERIES[0].sql);
  const [sampleQueries, setSampleQueries] = useState<Array<{ label: string; sql: string }>>(SAMPLE_QUERIES);
  const [rule, setRule] = useState<OptimizationRule>('all');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);

  // Real DB state
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string }>({
    connected: false, message: 'Đang kết nối PostgreSQL 16...',
  });
  const [dbOverview, setDbOverview] = useState<DatabaseOverview | null>(null);
  const [dbList, setDbList] = useState<DatabaseItem[]>([]);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"none" | "import" | "connect">("none");

  const fetchDatabaseInfo = async () => {
    try {
      const data = await getDatabaseInfo();
      setDbOverview(data);
      setSelectedDataset(data.database);
      setDbStatus({
        connected: true,
        message: `PostgreSQL 16 – Đã kết nối • ${data.totalRows.toLocaleString()} dòng | ${data.database}`,
      });
    } catch {
      setDbStatus({ connected: false, message: 'Không thể kết nối PostgreSQL Database' });
    }

    getDatabaseList().then(list => { if (Array.isArray(list)) setDbList(list); }).catch(() => {});
    
    // Nạp câu SQL mẫu động theo schema thật
    getSamples().then(res => {
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const dynamicSamples = res.data.map((s: any) => ({
          label: s.title || s.label || 'Truy vấn mẫu',
          sql: s.sql,
        }));
        setSampleQueries(dynamicSamples);
        // Tự động nạp mẫu đầu tiên nếu đang dùng query cũ
        if (dynamicSamples[0]?.sql) {
          setSql(dynamicSamples[0].sql);
        }
      }
    }).catch(() => {});

    // Nạp lịch sử thao tác thật
    loadHistory();
  };

  const loadHistory = async () => {
    try {
      const hist = await getHistory();
      if (Array.isArray(hist)) {
        setHistoryList(hist.map((h: any) => ({
          id: String(h.id),
          timestamp: h.createdAt ? new Date(h.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '',
          query: h.candidateName || 'Tối ưu Index',
          candidateName: h.candidateName,
          status: h.status,
          appliedDdl: h.appliedDdl,
          rollbackDdl: h.rollbackDdl,
        })));
      }
    } catch {}
  };

  useEffect(() => { fetchDatabaseInfo(); }, []);

  const handleAnalyze = useCallback(async () => {
    if (!sql.trim()) return;
    setLoading(true);
    try {
      const data = await optimizeQuery(sql, rule);
      if (data.success) {
        const optimResult = buildOptimizationResult(data.data, sql);
        setResult(optimResult);
        api.success({
          message: 'Phân tích & Đo đạc Hoàn Tất',
          description: `Đã thử nghiệm ${data.data?.candidates?.length ?? 0} phương án. Ứng viên tốt nhất: ${data.data?.bestCandidate?.name || 'Tối ưu'} (${optimResult.improvementPercent}% nhanh hơn).`,
          placement: 'topRight',
          duration: 4,
        });
      } else {
        api.error({
          message: 'Lỗi phân tích',
          description: data.message || 'Lỗi khi phân tích truy vấn!',
          placement: 'topRight',
        });
      }
    } catch (err: any) {
      api.error({
        message: 'Lỗi kết nối máy chủ',
        description: err.response?.data?.message || err.message || 'Không thể gửi yêu cầu phân tích tới backend.',
        placement: 'topRight',
      });
    } finally {
      setLoading(false);
    }
  }, [api, sql, rule]);

  const handleApply = async (candidateToApply: any) => {
    const target = candidateToApply || result?.bestCandidate;
    if (!target) return;
    setActionLoading(true);
    try {
      const res = await applyCandidate(target);
      if (res.success) {
        api.success({
          message: 'Đã áp dụng thay đổi thành công',
          description: res.message,
          placement: 'topRight',
        });
        await fetchDatabaseInfo();
      } else {
        api.error({ message: 'Lỗi áp dụng', description: res.message, placement: 'topRight' });
      }
    } catch (err: any) {
      api.error({ message: 'Lỗi', description: err.response?.data?.message || err.message, placement: 'topRight' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async () => {
    setActionLoading(true);
    try {
      const res = await rollbackAction();
      if (res.success) {
        api.success({
          message: 'Đã hoàn tác thành công',
          description: res.message,
          placement: 'topRight',
        });
        await fetchDatabaseInfo();
      } else {
        api.warning({ message: 'Thông báo', description: res.message, placement: 'topRight' });
      }
    } catch (err: any) {
      api.error({ message: 'Lỗi hoàn tác', description: err.response?.data?.message || err.message, placement: 'topRight' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwitchDb = async (dbName: string) => {
    try {
      const res = await switchDatabase(dbName);
      if (res.success) {
        await fetchDatabaseInfo();
        setResult(null);
        api.success({ message: `Đã chuyển sang ${dbName}`, placement: 'topRight' });
      }
    } catch (err: any) {
      api.error({ message: 'Lỗi chuyển CSDL', description: err.message, placement: 'topRight' });
    }
  };

  const datasetsWithDb = dbList.length > 0
    ? dbList.map(d => ({ label: d.name, value: d.name, rows: d.totalRowsFormatted || d.sizeFormatted || '' }))
    : DATASETS;

  return (
    <ConfigProvider theme={ANT_THEME}>
      {contextHolder}
      <div className="app-shell">
        <Header
          datasets={datasetsWithDb}
          selectedDataset={dbOverview?.database ?? selectedDataset}
          onDatasetChange={(v) => { setSelectedDataset(v); handleSwitchDb(v); }}
          onLoadSample={(s) => { setSql(s); setResult(null); }}
          sampleQueries={sampleQueries}
          dbStatus={dbStatus}
          dbOverview={dbOverview}
          historyList={historyList}
          onOpenDataSourceModal={(tab) => {
            setModalTab(tab || "none");
            setIsModalOpen(true);
          }}
        />
        <main className="dashboard-scroll">
          <div className="dashboard-container">
            <div className="dashboard-intro">
              <div>
                <span className="advisor-eyebrow">KHÔNG GIAN PHÂN TÍCH</span>
                <h1>Tối ưu truy vấn dữ liệu lớn</h1>
              </div>
              <div className="run-meta">
                <span><i className="status-dot" /> Phiên phân tích trực tiếp</span>
                <span>{dbOverview ? `${dbOverview.totalRows.toLocaleString()} dòng` : '--'}</span>
                <span>{dbOverview?.database ?? 'PostgreSQL 16'}</span>
              </div>
            </div>

            <section className="hero-workspace">
              <div className="sql-input-pane">
                <SqlEditor
                  value={sql}
                  onChange={setSql}
                  onAnalyze={handleAnalyze}
                  loading={loading}
                  rule={rule}
                  onRuleChange={setRule}
                  expanded={false}
                  onToggleExpand={() => undefined}
                  showExpand={false}
                />
              </div>
              <BottleneckSummary bottlenecks={result?.bottlenecks} />
            </section>

            {/* Benchmark Charts - chỉ hiện khi có kết quả thật */}
            {result && (
              <section className="advisor-section">
                <div className="advisor-heading">
                  <div className="advisor-heading-icon">📊</div>
                  <div>
                    <div className="advisor-eyebrow">KẾT QUẢ BENCHMARK THỰC TẾ</div>
                    <h2>So sánh hiệu năng trước & sau tối ưu</h2>
                  </div>
                </div>
                <BenchmarkCharts
                  executionTimeBefore={result.originalMetrics.executionTime}
                  executionTimeAfter={result.optimizedMetrics.executionTime}
                  totalCostBefore={result.originalMetrics.totalCost}
                  totalCostAfter={result.optimizedMetrics.totalCost}
                  improvementPercent={result.improvementPercent}
                  sharedHitBefore={result.originalMetrics.sharedHitBuffers}
                  sharedReadBefore={result.originalMetrics.sharedReadBuffers}
                  sharedHitAfter={result.optimizedMetrics.sharedHitBuffers}
                  sharedReadAfter={result.optimizedMetrics.sharedReadBuffers}
                />
              </section>
            )}

            <ExecutionPlanSection plan={result?.executionPlan} />
            <ColumnRolesSection columns={result?.columnRoles} />
            <CandidateMatrix candidates={result?.candidates} />
            {result && (
              <RecommendationSection
                result={result}
                onApply={handleApply}
                onRollback={handleRollback}
                loadingAction={actionLoading}
              />
            )}

            <footer className="dashboard-footer">
              Đo đạc thực nghiệm tự động bằng EXPLAIN (ANALYZE, BUFFERS) · CSDL: {dbOverview?.database || 'PostgreSQL'} · Cập nhật lúc {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </footer>
          </div>
        </main>
      </div>

      {/* Modal quản lý nguồn dữ liệu thực tế */}
      <DataSourceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        dbInfo={dbOverview}
        onRefreshDbInfo={fetchDatabaseInfo}
        initialTab={modalTab}
      />
    </ConfigProvider>
  );
}
