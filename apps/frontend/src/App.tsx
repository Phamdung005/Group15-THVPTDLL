import { useEffect, useState } from "react";
import {
  getSamples,
  getDatabaseInfo,
  getDatabaseList,
  switchDatabase,
  type DatabaseOverview,
  type DatabaseItem,
} from "./api/api";
import { DataSourceModal } from "./components/DataSourceModal";
import "./App.css";

interface SampleItem {
  id: string;
  title: string;
  sql: string;
}

interface AnalyzedColumn {
  tableName: string;
  columnName: string;
  role: string;
  expression?: string;
}

interface PlanNode {
  nodeType: string;
  relationName?: string;
  totalCost: number;
  planRows: number;
  plans?: PlanNode[];
}

interface OptimizationChange {
  type: string;
  action: string;
  sqlCommand?: string;
}

interface OptimizationCandidate {
  id: string;
  name: string;
  strategy: string;
  description: string;
  sql: string;
  changes: OptimizationChange[];
  benchmark?: {
    executionTimeMs: number;
    planningTimeMs: number;
    totalCost: number;
    sharedHitBlocks: number;
    sharedReadBlocks: number;
  };
  score?: number;
  isBest?: boolean;
}

function PlanTreeNode({ node, level = 0 }: { node: PlanNode; level?: number }) {
  const getBadgeColor = (type: string) => {
    if (type.includes("Seq Scan")) return "node-red";
    if (type.includes("Nested Loop") || type.includes("Join")) return "node-orange";
    if (type.includes("Aggregate") || type.includes("Sort")) return "node-purple";
    return "node-blue";
  };

  return (
    <div className="tree-node-wrapper" style={{ paddingLeft: `${level * 18}px` }}>
      <div className="tree-node-line">
        <span className={`node-type ${getBadgeColor(node.nodeType)}`}>
          {node.nodeType} {node.relationName ? `(${node.relationName})` : ""}
        </span>
        <span className="node-cost">cost ~{node.totalCost}</span>
        <span className="node-stats">{node.planRows.toLocaleString()} rows</span>
      </div>
      {node.plans && node.plans.map((child, idx) => (
        <PlanTreeNode key={idx} node={child} level={level + 1} />
      ))}
    </div>
  );
}

function App() {
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string }>({
    connected: false,
    message: "Đang kết nối PostgreSQL 16...",
  });
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [sql, setSql] = useState<string>(
`SELECT
  o.id AS order_id,
  c.name AS customer_name,
  SUM(oi.quantity * oi.unit_price) AS tong_tien,
  o.created_at
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'completed'
  AND o.created_at >= '2024-01-01'
GROUP BY o.id, c.name, o.created_at
ORDER BY tong_tien DESC
LIMIT 100;`
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [dbOverview, setDbOverview] = useState<DatabaseOverview | null>(null);
  const [dbList, setDbList] = useState<DatabaseItem[]>([]);
  const [isDbDropdownOpen, setIsDbDropdownOpen] = useState<boolean>(false);
  const [switchingDb, setSwitchingDb] = useState<boolean>(false);

  const fetchDatabaseInfo = async () => {
    try {
      const data = await getDatabaseInfo();
      setDbOverview(data);
      setDbStatus({
        connected: true,
        message: `PostgreSQL 16 – Đã kết nối • ${data.totalRows.toLocaleString()} dòng | ${data.database}`,
      });
    } catch {
      setDbStatus({
        connected: false,
        message: "Không thể kết nối PostgreSQL Database",
      });
    }

    // Cập nhật danh sách CSDL có sẵn
    getDatabaseList()
      .then((list) => {
        if (Array.isArray(list)) setDbList(list);
      })
      .catch(() => {});

    // Cập nhật lại danh sách câu SQL mẫu theo CSDL hiện tại
    getSamples()
      .then((res) => {
        if (res.success) setSamples(res.data);
      })
      .catch(() => {});
  };

  const handleSwitchDb = async (dbName: string) => {
    if (switchingDb || dbName === dbOverview?.database) {
      setIsDbDropdownOpen(false);
      return;
    }

    setSwitchingDb(true);
    setIsDbDropdownOpen(false);
    try {
      const res = await switchDatabase(dbName);
      if (res.success) {
        await fetchDatabaseInfo();
        setActionMessage(`✓ Đã chuyển kết nối sang cơ sở dữ liệu: ${dbName}`);
        setTimeout(() => setActionMessage(null), 3000);
      } else {
        alert(res.message || "Không thể chuyển CSDL");
      }
    } catch (err: any) {
      alert("Lỗi kết nối khi chuyển CSDL");
    } finally {
      setSwitchingDb(false);
    }
  };

  useEffect(() => {
    fetchDatabaseInfo();
  }, []);

  const handleOptimize = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch("http://localhost:3000/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        alert(data.message || "Lỗi khi phân tích truy vấn!");
      }
    } catch (err: any) {
      alert("Lỗi kết nối Backend API Server!");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!result?.bestCandidate) return;
    try {
      const res = await fetch("http://localhost:3000/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: result.bestCandidate }),
      });
      const data = await res.json();
      setActionMessage(data.message);
    } catch (err: any) {
      alert("Lỗi khi áp dụng phương án!");
    }
  };

  const handleRollback = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/rollback", {
        method: "POST",
      });
      const data = await res.json();
      setActionMessage(data.message);
    } catch (err: any) {
      alert("Lỗi khi thực hiện hoàn tác!");
    }
  };

  const handleSelectSample = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = samples.find((s) => s.id === e.target.value);
    if (selected) {
      setSql(selected.sql);
      setResult(null);
      setActionMessage(null);
    }
  };

  const currentDbItem =
    dbList.find((d) => d.name === dbOverview?.database) ||
    dbList.find((d) => d.isCurrent) ||
    (dbOverview
      ? {
          name: dbOverview.database,
          totalRows: dbOverview.totalRows,
          totalRowsFormatted: `${(dbOverview.totalRows / 1000).toFixed(0)}k dòng`,
          sizeFormatted: dbOverview.totalSizeFormatted,
          label: `${dbOverview.database} (${(dbOverview.totalRows / 1000).toFixed(0)}k dòng)`,
          isCurrent: true,
        }
      : null);

  return (
    <div className="optimizer-dashboard">
      {/* Top Header Navigation */}
      <header className="main-header">
        <div className="header-brand">
          <span className="logo-spark">⚡</span>
          <h2>Big Data SQL <span className="highlight-text">Optimizer Advisor</span></h2>
          <span className="status-badge">● {dbStatus.message}</span>
        </div>

        <div className="header-actions">
          {/* Custom Database Dropdown Selector */}
          <div className="db-selector-container">
            <button
              type="button"
              className={`db-selector-trigger ${isDbDropdownOpen ? "active" : ""} ${switchingDb ? "loading" : ""}`}
              onClick={() => setIsDbDropdownOpen(!isDbDropdownOpen)}
              title="Nhấp để chuyển đổi nhanh giữa các cơ sở dữ liệu"
              disabled={switchingDb}
            >
              <span className="db-trigger-label">
                {switchingDb ? (
                  "Đang chuyển CSDL..."
                ) : (
                  currentDbItem?.label || dbOverview?.database || "Chọn CSDL..."
                )}
              </span>
              <span className="db-trigger-icon" aria-hidden="true">
                {/* Database/Table glyph matching screenshot */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="9" x2="9" y2="21" />
                </svg>
              </span>
            </button>

            {isDbDropdownOpen && (
              <>
                <div className="dropdown-backdrop" onClick={() => setIsDbDropdownOpen(false)} />
                <div className="db-dropdown-menu">
                  {dbList.map((db) => {
                    const isSelected = db.name === dbOverview?.database;
                    return (
                      <div
                        key={db.name}
                        className={`db-dropdown-item ${isSelected ? "is-selected" : ""}`}
                        onClick={() => handleSwitchDb(db.name)}
                      >
                        <span className="db-item-name">
                          {db.name}
                        </span>
                        <span className="db-item-meta">
                          ({db.totalRowsFormatted || db.sizeFormatted})
                        </span>
                      </div>
                    );
                  })}

                  <div
                    className="db-dropdown-footer"
                    onClick={() => {
                      setIsDbDropdownOpen(false);
                      setIsModalOpen(true);
                    }}
                  >
                    <span>Kết nối máy chủ / Import Dataset (.csv, .sql)</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <select className="sample-select" onChange={handleSelectSample} defaultValue="">
            <option value="" disabled>📋 Chọn Câu SQL Thử Nghiệm</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="dashboard-grid">
        {/* Left Column: SQL Input & Query Roles */}
        <div className="grid-col-left">
          <div className="card-panel">
            <div className="panel-title-bar">
              <span>CÂU LỆNH SQL ĐẦU VÀO</span>
              <span className="hint-text">Chỉ hỗ trợ truy vấn đọc (SELECT / EXPLAIN)</span>
            </div>

            <textarea
              className="sql-editor-textarea"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={12}
              placeholder="Nhập câu lệnh SELECT SQL cần tối ưu..."
            />

            <div className="panel-footer">
              <button
                className={`btn-optimize ${loading ? "is-loading" : ""}`}
                onClick={handleOptimize}
                disabled={loading}
              >
                {loading ? "⚡ Đang Phân Tích & Benchmark Cô Lập..." : "⚡ Phân Tích & Tối Ưu Hóa (CBO Advisor)"}
              </button>
            </div>
          </div>

          {/* LAYER 1 & 3: QUERY ANALYSIS & COLUMN ROLES */}
          {result && (
            <div className="card-panel">
              <div className="panel-title-bar">
                <span>PHÂN TÍCH VAI TRÒ CỘT (COLUMN ROLES)</span>
                <span className="role-count">{result.analysis.columnRoles.length} cột phân loại</span>
              </div>

              <div className="roles-table-wrapper">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Bảng</th>
                      <th>Cột</th>
                      <th>Vai Trò (Role)</th>
                      <th>Biểu Thức Trong SQL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.analysis.columnRoles.map((c: AnalyzedColumn, idx: number) => (
                      <tr key={idx}>
                        <td><code>{c.tableName}</code></td>
                        <td><strong>{c.columnName}</strong></td>
                        <td>
                          <span className={`role-pill pill-${c.role.toLowerCase()}`}>
                            {c.role}
                          </span>
                        </td>
                        <td className="expr-cell">{c.expression || "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Execution Plan, Candidate Matrix, Recommendation & Action */}
        <div className="grid-col-right">
          {!result && !loading && (
            <div className="card-panel empty-panel">
              <div className="empty-icon">📊</div>
              <h3>Sẵn Sàng Phân Tích</h3>
              <p>Hệ thống sẽ bóc tách Execution Plan thật từ PostgreSQL, phân tích vai trò cột và thử nghiệm các ứng viên (Candidate Isolation Benchmark) để chọn phương án tối ưu nhất.</p>
            </div>
          )}

          {result && (
            <>
              {/* LAYER 5: RECOMMENDATION & ACTION CARD */}
              <div className="card-panel recommendation-panel">
                <div className="rec-header">
                  <div className="rec-title-group">
                    <span className="trophy-icon">🏆</span>
                    <div>
                      <h3>Khuyến Nghị: {result.bestCandidate.name}</h3>
                      <p className="rec-reason">{result.comparison.reason}</p>
                    </div>
                  </div>

                  <div className="action-buttons">
                    <button className="btn-action btn-apply" onClick={handleApply}>
                      ✅ Áp Dụng Phương Án
                    </button>
                    <button className="btn-action btn-rollback" onClick={handleRollback}>
                      ↩️ Hoàn Tác (Rollback)
                    </button>
                  </div>
                </div>

                {actionMessage && (
                  <div className="alert-message">
                    ℹ️ {actionMessage}
                  </div>
                )}

                {result.bestCandidate.changes.length > 0 && (
                  <div className="changes-summary">
                    <strong>Các thao tác thực hiện:</strong>
                    <ul>
                      {result.bestCandidate.changes.map((ch: any, i: number) => (
                        <li key={i}>
                          <span className="change-tag">{ch.type}</span>: {ch.action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* LAYER 4: CANDIDATES BENCHMARK MATRIX (WARMUP X1 + MEDIAN X3) */}
              <div className="card-panel">
                <div className="panel-title-bar">
                  <span>BẢNG SO SÁNH CÁC PHƯƠNG ÁN ỨNG VIÊN (CANDIDATE MATRIX)</span>
                  <span className="hint-text">Đo đạc độc lập: Warm-up ×1 + Median ×3</span>
                </div>

                <div className="matrix-table-wrapper">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Phương Án (Candidate)</th>
                        <th>Chiến Lược</th>
                        <th>Thời Gian (Median)</th>
                        <th>Storage Reads</th>
                        <th>Buffer Hits</th>
                        <th>Plan Cost</th>
                        <th>Điểm CBO</th>
                        <th>Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.candidates.map((cand: OptimizationCandidate) => (
                        <tr key={cand.id} className={cand.isBest ? "row-best" : ""}>
                          <td>
                            <strong>{cand.name}</strong>
                            <div className="cand-desc-text">{cand.description}</div>
                          </td>
                          <td><span className="strategy-tag">{cand.strategy}</span></td>
                          <td>
                            <span className="metric-num">
                              {cand.benchmark ? `${cand.benchmark.executionTimeMs} ms` : "--"}
                            </span>
                          </td>
                          <td>
                            <span className="metric-storage">
                              {cand.benchmark ? `${cand.benchmark.sharedReadBlocks} blocks` : "--"}
                            </span>
                          </td>
                          <td>
                            <span className="metric-cache">
                              {cand.benchmark ? `${cand.benchmark.sharedHitBlocks} blocks` : "--"}
                            </span>
                          </td>
                          <td>{cand.benchmark ? cand.benchmark.totalCost : "--"}</td>
                          <td>
                            <span className="score-badge">
                              {cand.score !== undefined ? `${cand.score} pts` : "--"}
                            </span>
                          </td>
                          <td>
                            {cand.isBest ? (
                              <span className="winner-tag">🏆 TỐI ƯU NHẤT</span>
                            ) : (
                              <span className="neutral-tag">Ứng viên</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* LAYER 2: ESTIMATED PLAN TREE */}
              <div className="card-panel">
                <div className="panel-title-bar">
                  <span>CÂY KẾ HOẠCH THỰC THI GỐC (ESTIMATED PLAN TREE)</span>
                  <span className="hint-text">EXPLAIN (FORMAT JSON)</span>
                </div>

                <div className="plan-tree-box">
                  <PlanTreeNode node={result.planTree} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL: QUẢN LÝ NGUỒN DỮ LIỆU & IMPORT DATASET */}
      <DataSourceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        dbInfo={dbOverview}
        onRefreshDbInfo={fetchDatabaseInfo}
      />
    </div>
  );
}

export default App;
