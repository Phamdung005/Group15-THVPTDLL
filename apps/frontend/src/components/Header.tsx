import React, { useState } from 'react';
import { Button, Badge, Select, Popover, Dropdown } from 'antd';
import {
  ThunderboltOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  CodeOutlined,
  DownOutlined,
  SafetyCertificateOutlined,
  CheckCircleFilled,
  UploadOutlined,
} from '@ant-design/icons';
import type { Dataset } from '../types';
import type { DatabaseOverview } from '../api/api';

interface HeaderProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (v: string) => void;
  onLoadSample: (sql: string) => void;
  sampleQueries: Array<{ label: string; sql: string }>;
  dbStatus?: { connected: boolean; message: string };
  dbOverview?: DatabaseOverview | null;
  onOpenDataSourceModal: (tab?: "none" | "import" | "connect") => void;
}

export function Header({
  datasets,
  selectedDataset,
  onDatasetChange,
  onLoadSample,
  sampleQueries,
  dbStatus,
  dbOverview,
  onOpenDataSourceModal,
}: HeaderProps) {
  const [sourceOpen, setSourceOpen] = useState(false);

  const selectedDs = datasets.find(d => d.value === selectedDataset);

  const sampleItems = sampleQueries.map((q, i) => ({
    key: String(i),
    label: <span className="font-mono text-xs">{q.label}</span>,
    onClick: () => onLoadSample(q.sql),
  }));

  const sourcePanel = (
    <div style={{ width: 320 }}>
      <div className="source-popover-title">NGUỒN DỮ LIỆU ĐANG KẾT NỐI</div>
      <div className="active-source-card">
        <div className="active-source-icon"><DatabaseOutlined /></div>
        <div>
          <strong>{dbOverview?.database ?? selectedDs?.label ?? 'bigdata_optimizer'}</strong>
          <span>PostgreSQL 16 · {dbOverview ? `${(dbOverview.totalRows / 1000000).toFixed(2)}M dòng` : selectedDs?.rows}</span>
        </div>
        <CheckCircleFilled className="source-check" />
      </div>
      <div className="source-stats">
        <span>
          <small>BẢNG</small>
          <strong>{dbOverview?.totalTables ?? '--'}</strong>
        </span>
        <span>
          <small>DÒNG</small>
          <strong>{dbOverview ? (dbOverview.totalRows > 1000000 ? `${(dbOverview.totalRows / 1000000).toFixed(2)}M` : dbOverview.totalRows.toLocaleString()) : '--'}</strong>
        </span>
        <span>
          <small>DUNG LƯỢNG</small>
          <strong>{dbOverview?.totalSizeFormatted ?? '--'}</strong>
        </span>
      </div>
      <div className="source-actions">
        <button onClick={() => { setSourceOpen(false); onOpenDataSourceModal(); }}>
          <CloudServerOutlined />
          <span>Quản lý Nguồn Dữ Liệu & Import CSV</span>
          <DownOutlined />
        </button>
      </div>
      <div className="source-security">
        <SafetyCertificateOutlined />
        Chỉ đọc EXPLAIN · An toàn tuyệt đối · Không ghi dữ liệu
      </div>
    </div>
  );

  return (
    <header className="header-bar flex items-center justify-between px-6 py-3 border-b border-slate-700/60">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="logo-mark flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
          <ThunderboltOutlined className="text-cyan-400 text-sm" />
        </div>
        <div>
          <div className="text-sm font-bold text-white tracking-[0.08em] uppercase">
            Big Data SQL <span className="text-cyan-400">Optimizer</span>
          </div>
          <div className="text-[10px] text-slate-500 tracking-[0.25em] uppercase mt-0.5">
            Cố vấn hiệu năng truy vấn
          </div>
        </div>
      </div>

      {/* Connection status + dataset selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Badge status="processing" color={dbStatus?.connected !== false ? '#10b981' : '#f43f5e'} />
          <span className="text-xs font-mono" style={{ color: dbStatus?.connected !== false ? '#34d399' : '#f87171' }}>
            PostgreSQL 16 · {dbStatus?.connected !== false ? 'Đã kết nối' : 'Mất kết nối'}
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">
            {dbOverview ? `${(dbOverview.totalRows / 1000000).toFixed(2)}M dòng` : selectedDs?.rows}
          </span>
        </div>
        <div className="w-px h-4 bg-slate-600" />
        <Select
          value={selectedDataset}
          onChange={onDatasetChange}
          size="small"
          className="dataset-select"
          suffixIcon={<DatabaseOutlined className="text-slate-400" />}
          options={datasets.map(d => ({
            label: (
              <span className="font-mono text-xs">
                {d.label} <span className="text-slate-500">({d.rows})</span>
              </span>
            ),
            value: d.value,
          }))}
          style={{ width: 220 }}
          popupClassName="dark-select-popup"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          size="small"
          icon={<UploadOutlined />}
          className="header-btn"
          style={{ borderColor: 'rgba(6, 182, 212, 0.4)', color: '#22d3ee' }}
          onClick={() => onOpenDataSourceModal("import")}
        >
          Import Dữ Liệu
        </Button>

        <Popover
          content={sourcePanel}
          trigger="click"
          placement="bottomRight"
          open={sourceOpen}
          onOpenChange={setSourceOpen}
          overlayClassName="source-popover-overlay"
        >
          <Button size="small" icon={<CloudServerOutlined />} className="source-btn">
            Nguồn dữ liệu <DownOutlined className="text-xs" />
          </Button>
        </Popover>

        <Dropdown menu={{ items: sampleItems }} trigger={['click']} overlayClassName="dark-dropdown">
          <Button size="small" icon={<CodeOutlined />} className="header-btn">
            Câu SQL Mẫu <DownOutlined className="text-xs" />
          </Button>
        </Dropdown>
      </div>
    </header>
  );
}
