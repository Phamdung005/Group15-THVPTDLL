import React, { useState } from "react";
import {
  type DatabaseOverview,
  connectDatabase,
  uploadDatasetFile,
  generateSyntheticDataset,
} from "../api/api";

interface DataSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbInfo: DatabaseOverview | null;
  onRefreshDbInfo: () => void;
}

export const DataSourceModal: React.FC<DataSourceModalProps> = ({
  isOpen,
  onClose,
  dbInfo,
  onRefreshDbInfo,
}) => {
  const [activeTab, setActiveTab] = useState<"none" | "import" | "connect">("none");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Form kết nối PostgreSQL
  const [connectForm, setConnectForm] = useState({
    host: "localhost",
    port: 5432,
    database: "bigdata_optimizer",
    user: "postgres",
    password: "",
  });

  // Form upload dataset
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tableName, setTableName] = useState("");
  const [delimiter, setDelimiter] = useState(",");
  const [destMode, setDestMode] = useState<"current" | "new">("current");
  const [targetDbName, setTargetDbName] = useState("");

  // Chi tiết danh sách bảng
  const [showTableList, setShowTableList] = useState(false);

  if (!isOpen) return null;

  // Xử lý kiểm tra kết nối DB
  const handleTestConnection = async () => {
    setLoading(true);
    setStatusMessage({ type: "info", text: "Đang kiểm tra kết nối tới máy chủ PostgreSQL..." });
    try {
      const res = await connectDatabase({
        ...connectForm,
        action: "test",
      });
      if (res.success) {
        setStatusMessage({ type: "success", text: `✅ ${res.message} (${res.version?.split("on")[0]})` });
      } else {
        setStatusMessage({ type: "error", text: `❌ ${res.message}` });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `❌ ${err.response?.data?.message || err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Xử lý chuyển đổi DB
  const handleSwitchConnection = async () => {
    setLoading(true);
    setStatusMessage({ type: "info", text: "Đang chuyển đổi cơ sở dữ liệu hoạt động..." });
    try {
      const res = await connectDatabase({
        ...connectForm,
        action: "switch",
      });
      if (res.success) {
        setStatusMessage({ type: "success", text: `🎉 ${res.message}` });
        onRefreshDbInfo();
        setActiveTab("none");
      } else {
        setStatusMessage({ type: "error", text: `❌ ${res.message}` });
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `❌ ${err.response?.data?.message || err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Xử lý upload file CSV / SQL
  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setStatusMessage({ type: "error", text: "Vui lòng chọn một file .csv hoặc .sql từ máy tính." });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: "info", text: `Đang nạp file ${selectedFile.name} vào PostgreSQL... Vui lòng đợi trong giây lát.` });

    try {
      const res = await uploadDatasetFile(
        selectedFile,
        tableName || undefined,
        delimiter,
        destMode === "new",
        destMode === "new" ? targetDbName : undefined
      );
      setStatusMessage({ type: "success", text: `🎉 ${res.message}` });
      setSelectedFile(null);
      setTableName("");
      setTargetDbName("");
      onRefreshDbInfo();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `❌ ${err.response?.data?.message || err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Xử lý sinh Big Data tự động
  const handleGenerateSynthetic = async (scale: number, label: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn sinh bộ dữ liệu mẫu ${label} không? Dữ liệu cũ (orders, items) sẽ được tái tạo lại.`)) {
      return;
    }

    setLoading(true);
    setStatusMessage({ type: "info", text: `Đang khởi tạo schema và sinh ${label} vào PostgreSQL...` });

    try {
      const res = await generateSyntheticDataset(scale);
      setStatusMessage({ type: "success", text: `🎉 ${res.message}` });
      onRefreshDbInfo();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `❌ ${err.response?.data?.message || err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="modal-icon">🗄️</span>
            <h3>QUẢN LÝ NGUỒN DỮ LIỆU</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Status Message Notification */}
        {statusMessage && (
          <div className={`modal-alert alert-${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        {/* Section 1: Active Database Card (Giống Mockup) */}
        <div className="modal-section">
          <div className="section-label">NGUỒN DỮ LIỆU ĐANG DÙNG</div>

          <div className="active-db-card">
            <div className="db-card-top">
              <div className="db-icon-box">🗄️</div>
              <div className="db-identity">
                <div className="db-name-row">
                  <span className="db-name">{dbInfo?.database || "bigdata_optimizer"}</span>
                  <span className="db-verified-badge" title="Đang kết nối">✓</span>
                </div>
                <div className="db-meta-text">
                  PostgreSQL 16 · {dbInfo ? `${dbInfo.host}:${dbInfo.port}` : "localhost:5432"}
                </div>
              </div>
            </div>

            <div className="db-stats-grid">
              <div className="stat-column">
                <span className="stat-label">TỔNG SỐ DÒNG</span>
                <span className="stat-value">{dbInfo ? `${(dbInfo.totalRows / 1000000).toFixed(2)} triệu dòng` : "--"}</span>
                <span className="stat-sub">({dbInfo?.totalRows.toLocaleString()} rows)</span>
              </div>
              <div className="stat-column">
                <span className="stat-label">SỐ BẢNG</span>
                <span className="stat-value">{dbInfo?.totalTables || 0} bảng</span>
                <button
                  className="btn-view-tables"
                  onClick={() => setShowTableList(!showTableList)}
                >
                  {showTableList ? "Ẩn danh sách ▲" : "Xem chi tiết ▼"}
                </button>
              </div>
              <div className="stat-column">
                <span className="stat-label">DUNG LƯỢNG</span>
                <span className="stat-value">{dbInfo?.totalSizeFormatted || "--"}</span>
                <span className="stat-sub">đĩa vật lý</span>
              </div>
            </div>

            {/* Collapsible Table List */}
            {showTableList && dbInfo && (
              <div className="tables-dropdown-list">
                <table className="mini-tables-list">
                  <thead>
                    <tr>
                      <th>Tên bảng</th>
                      <th>Số dòng ước tính</th>
                      <th>Kích thước</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbInfo.tables.map((tbl) => (
                      <tr key={tbl.name}>
                        <td><code>{tbl.name}</code></td>
                        <td>{tbl.rowCount.toLocaleString()}</td>
                        <td>{tbl.sizeFormatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Action Options (Mockup Menu) */}
        <div className="modal-actions-menu">
          <button
            className={`action-menu-item ${activeTab === "import" ? "is-active" : ""}`}
            onClick={() => setActiveTab(activeTab === "import" ? "none" : "import")}
          >
            <span className="item-icon">📥</span>
            <div className="item-text">
              <strong>Import Dataset</strong>
              <span>Tải file .CSV, .SQL hoặc sinh Big Data mẫu tự động</span>
            </div>
            <span className="item-arrow">{activeTab === "import" ? "▲" : "+"}</span>
          </button>

          <button
            className={`action-menu-item ${activeTab === "connect" ? "is-active" : ""}`}
            onClick={() => setActiveTab(activeTab === "connect" ? "none" : "connect")}
          >
            <span className="item-icon">🌐</span>
            <div className="item-text">
              <strong>Kết nối PostgreSQL</strong>
              <span>Thay đổi máy chủ hoặc kết nối tới cơ sở dữ liệu khác</span>
            </div>
            <span className="item-arrow">{activeTab === "connect" ? "▲" : "+"}</span>
          </button>
        </div>

        {/* Section 3A: Tab Import Dataset */}
        {activeTab === "import" && (
          <div className="tab-content-panel">
            <h4 className="tab-subtitle">1. TẢI FILE DỮ LIỆU TỪ MÁY TÍNH (.CSV / .SQL)</h4>
            <form onSubmit={handleUploadFile} className="upload-form">
              <div className="file-drop-area">
                <input
                  type="file"
                  id="dataset-file-input"
                  accept=".csv,.sql,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                      const nameWithoutExt = e.target.files[0].name.replace(/\.[^/.]+$/, "");
                      setTableName(nameWithoutExt);
                    }
                  }}
                />
                <label htmlFor="dataset-file-input" className="file-drop-label">
                  <span className="upload-icon">📁</span>
                  {selectedFile ? (
                    <div className="file-chosen-info">
                      <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  ) : (
                    <div>
                      <strong>Nhấp để chọn file</strong> hoặc kéo thả file .csv, .sql vào đây
                      <div className="drop-hint">Hỗ trợ tối đa 100MB cho mỗi file</div>
                    </div>
                  )}
                </label>
              </div>

              {selectedFile && selectedFile.name.endsWith(".csv") && (
                <div className="csv-options-grid">
                  <div className="form-group">
                    <label>Tên bảng lưu dữ liệu:</label>
                    <input
                      type="text"
                      className="form-input"
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      placeholder="ví dụ: my_sales_data"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Ký tự phân cách (Delimiter):</label>
                    <select
                      className="form-input"
                      value={delimiter}
                      onChange={(e) => setDelimiter(e.target.value)}
                    >
                      <option value=",">Dấu phẩy (,)</option>
                      <option value=";">Dấu chấm phẩy (;)</option>
                      <option value="\t">Dấu Tab (\t)</option>
                    </select>
                  </div>
                </div>
              )}

              {selectedFile && (
                <div style={{ margin: "16px 0", padding: "14px", background: "rgba(15, 23, 42, 0.6)", borderRadius: "8px", border: "1px solid #334155" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "13px", color: "#f8fafc" }}>
                    Nơi lưu trữ dữ liệu nạp vào:
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#cbd5e1" }}>
                      <input
                        type="radio"
                        name="destMode"
                        checked={destMode === "current"}
                        onChange={() => setDestMode("current")}
                      />
                      <span>Nạp thành bảng trong CSDL đang chọn (<code>{dbInfo?.database}</code>)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#cbd5e1" }}>
                      <input
                        type="radio"
                        name="destMode"
                        checked={destMode === "new"}
                        onChange={() => setDestMode("new")}
                      />
                      <span>Tạo hẳn một CSDL mới độc lập (Hiển thị ngay trên Dropdown Header)</span>
                    </label>
                  </div>
                  {destMode === "new" && (
                    <div style={{ marginTop: "12px" }}>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "#94a3b8" }}>
                        Tên CSDL mới:
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={targetDbName}
                        onChange={(e) => setTargetDbName(e.target.value)}
                        placeholder="ví dụ: pokemon_db, custom_dataset_db..."
                        required={destMode === "new"}
                      />
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary-action"
                disabled={loading || !selectedFile}
              >
                {loading ? "⏳ Đang nạp dữ liệu..." : "🚀 Bắt Đầu Nạp Vào PostgreSQL"}
              </button>
            </form>

            <div className="divider-line">
              <span>HOẶC SINH DỮ LIỆU BIG DATA MẪU (BENCHMARK)</span>
            </div>

            <div className="synthetic-grid">
              <button
                type="button"
                className="btn-synthetic"
                disabled={loading}
                onClick={() => handleGenerateSynthetic(100000, "100,000 dòng")}
              >
                <span className="synth-name">⚡ Quy mô Nhẹ</span>
                <span className="synth-rows">100,000 dòng</span>
                <span className="synth-desc">Test nhanh câu lệnh</span>
              </button>

              <button
                type="button"
                className="btn-synthetic synth-recommend"
                disabled={loading}
                onClick={() => handleGenerateSynthetic(750000, "750,000 dòng")}
              >
                <span className="synth-tag">Khuyên Dùng</span>
                <span className="synth-name">🔥 Tiêu Chuẩn E-Commerce</span>
                <span className="synth-rows">750,000 dòng</span>
                <span className="synth-desc">Mô phỏng nghẽn Seq Scan thật</span>
              </button>

              <button
                type="button"
                className="btn-synthetic"
                disabled={loading}
                onClick={() => handleGenerateSynthetic(2000000, "2,000,000 dòng")}
              >
                <span className="synth-name">🚀 Quy mô Lớn</span>
                <span className="synth-rows">2,000,000 dòng</span>
                <span className="synth-desc">Benchmark I/O & Buffers cao</span>
              </button>

              <button
                type="button"
                className="btn-synthetic"
                disabled={loading}
                onClick={() => handleGenerateSynthetic(5200000, "5,200,000 dòng")}
              >
                <span className="synth-name">🪐 Big Data Cực Đại</span>
                <span className="synth-rows">5,200,000 dòng</span>
                <span className="synth-desc">Mô phỏng Partitioning & Spill</span>
              </button>
            </div>
          </div>
        )}

        {/* Section 3B: Tab Kết Nối PostgreSQL */}
        {activeTab === "connect" && (
          <div className="tab-content-panel">
            <h4 className="tab-subtitle">THIẾT LẬP THÔNG SỐ KẾT NỐI POSTGRESQL</h4>

            <div className="connect-form-grid">
              <div className="form-group">
                <label>Host / IP Máy Chủ:</label>
                <input
                  type="text"
                  className="form-input"
                  value={connectForm.host}
                  onChange={(e) => setConnectForm({ ...connectForm, host: e.target.value })}
                  placeholder="localhost"
                  required
                />
              </div>

              <div className="form-group">
                <label>Port:</label>
                <input
                  type="number"
                  className="form-input"
                  value={connectForm.port}
                  onChange={(e) => setConnectForm({ ...connectForm, port: Number(e.target.value) })}
                  placeholder="5432"
                  required
                />
              </div>

              <div className="form-group">
                <label>Tên Cơ Sở Dữ Liệu (Database):</label>
                <input
                  type="text"
                  className="form-input"
                  value={connectForm.database}
                  onChange={(e) => setConnectForm({ ...connectForm, database: e.target.value })}
                  placeholder="bigdata_optimizer"
                  required
                />
              </div>

              <div className="form-group">
                <label>Tên Đăng Nhập (Username):</label>
                <input
                  type="text"
                  className="form-input"
                  value={connectForm.user}
                  onChange={(e) => setConnectForm({ ...connectForm, user: e.target.value })}
                  placeholder="postgres"
                  required
                />
              </div>

              <div className="form-group full-width">
                <label>Mật Khẩu (Password):</label>
                <input
                  type="password"
                  className="form-input"
                  value={connectForm.password}
                  onChange={(e) => setConnectForm({ ...connectForm, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="connect-actions-row">
              <button
                type="button"
                className="btn-secondary-action"
                onClick={handleTestConnection}
                disabled={loading}
              >
                🔍 Kiểm Tra Kết Nối
              </button>

              <button
                type="button"
                className="btn-primary-action"
                onClick={handleSwitchConnection}
                disabled={loading}
              >
                🔄 Chuyển Đổi Nguồn Dữ Liệu
              </button>
            </div>
          </div>
        )}

        {/* Modal Footer Note */}
        <div className="modal-footer-note">
          <span className="shield-icon">🛡️</span>
          <span>Thông tin đăng nhập và câu lệnh được thực thi an toàn trực tiếp trên máy chủ.</span>
        </div>
      </div>
    </div>
  );
};
