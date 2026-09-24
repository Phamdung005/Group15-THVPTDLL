import React, { useState } from 'react';
import { Button, Badge, Select, Popover, Dropdown, Modal, Tabs, Form, Input, Upload, notification } from 'antd';
import {
  ThunderboltOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  CodeOutlined,
  HistoryOutlined,
  DownOutlined,
  SafetyCertificateOutlined,
  CheckCircleFilled,
  LinkOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { Dataset } from '../types';
import { HISTORY_ITEMS } from '../data/mockData';

interface HeaderProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (v: string) => void;
  onLoadSample: (sql: string) => void;
  sampleQueries: Array<{ label: string; sql: string }>;
  dbStatus?: { connected: boolean; message: string };
}

export function Header({ datasets, selectedDataset, onDatasetChange, onLoadSample, sampleQueries, dbStatus }: HeaderProps) {
  const [api, contextHolder] = notification.useNotification();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState('postgres');
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  const selectedDs = datasets.find(d => d.value === selectedDataset);

  const testConnection = async () => {
    setTesting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setTesting(false);
    setTested(true);
  };

  const sampleItems = sampleQueries.map((q, i) => ({
    key: String(i),
    label: <span className="font-mono text-xs">{q.label}</span>,
    onClick: () => onLoadSample(q.sql),
  }));

  const historyItems = HISTORY_ITEMS.map(h => ({
    key: h.id,
    label: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#e2e8f0' }}>{h.query}</span>
        <span style={{ fontSize: 9, color: '#64748b' }}>{h.timestamp} · ↑{h.improvement}%</span>
      </div>
    ),
  }));

  const sourcePanel = (
    <div style={{ width: 300 }}>
      <div className="source-popover-title">NGUỒN DỮ LIỆU ĐANG KẾT NỐI</div>
      <div className="active-source-card">
        <div className="active-source-icon"><DatabaseOutlined /></div>
        <div>
          <strong>{selectedDs?.label ?? 'e_commerce_db'}</strong>
          <span>PostgreSQL 16 · {selectedDs?.rows ?? '5,21M dòng'}</span>
        </div>
        <CheckCircleFilled className="source-check" />
      </div>
      <div className="source-stats">
        <span><small>BẢNG</small><strong>8</strong></span>
        <span><small>DÒNG</small><strong>{selectedDs?.rows ?? '5,21M'}</strong></span>
        <span><small>KÍCH THƯỚC</small><strong>4,2 GB</strong></span>
      </div>
      <div className="source-actions">
        <button onClick={() => { setSourceOpen(false); setSourceModalOpen(true); }}>
          <CloudServerOutlined />
          <span>Kết nối PostgreSQL / Import Dataset</span>
          <DownOutlined />
        </button>
      </div>
      <div className="source-security">
        <SafetyCertificateOutlined />
        Chỉ đọc · Không ghi · Kết nối mã hóa TLS
      </div>
    </div>
  );

  return (
    <>
      {contextHolder}
      <header className="header-bar flex items-center justify-between px-6 py-3 border-b border-slate-700/60">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="logo-mark flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
            <ThunderboltOutlined className="text-cyan-400 text-sm" />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-[0.08em] uppercase">Big Data SQL <span className="text-cyan-400">Optimizer</span></div>
            <div className="text-[10px] text-slate-500 tracking-[0.25em] uppercase mt-0.5">Cố vấn hiệu năng truy vấn</div>
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
            <span className="text-xs text-slate-400 font-mono">{selectedDs?.rows ?? ''}</span>
          </div>
          <div className="w-px h-4 bg-slate-600" />
          <Select
            value={selectedDataset}
            onChange={onDatasetChange}
            size="small"
            className="dataset-select"
            suffixIcon={<DatabaseOutlined className="text-slate-400" />}
            options={datasets.map(d => ({
              label: <span className="font-mono text-xs">{d.label} <span className="text-slate-500">({d.rows})</span></span>,
              value: d.value,
            }))}
            style={{ width: 210 }}
            popupClassName="dark-select-popup"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
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
          <Dropdown menu={{ items: historyItems }} trigger={['click']} overlayClassName="dark-dropdown">
            <Button size="small" icon={<HistoryOutlined />} className="header-btn">
              Lịch Sử <DownOutlined className="text-xs" />
            </Button>
          </Dropdown>
        </div>
      </header>

      <Modal
        open={sourceModalOpen}
        onCancel={() => setSourceModalOpen(false)}
        footer={null}
        width={680}
        centered
        title={null}
        className="source-modal"
        destroyOnHidden
      >
        <div className="source-modal-head">
          <div className="source-modal-icon"><DatabaseOutlined /></div>
          <div>
            <span className="advisor-eyebrow">DATA SOURCE</span>
            <h2>Kết nối nguồn dữ liệu</h2>
            <p>Chọn PostgreSQL hiện có hoặc đưa dataset mới vào hệ thống phân tích.</p>
          </div>
        </div>
        <Tabs
          activeKey={sourceTab}
          onChange={setSourceTab}
          className="source-tabs"
          items={[
            {
              key: 'postgres',
              label: <span><CloudServerOutlined /> PostgreSQL</span>,
              children: (
                <div className="source-tab-content">
                  <div className="connection-notice">
                    <SafetyCertificateOutlined />
                    <span><strong>Kết nối chỉ đọc</strong>Dùng cho SELECT, EXPLAIN ANALYZE và đọc metadata hệ thống.</span>
                  </div>
                  <Form layout="vertical" initialValues={{ host: 'localhost', port: '5432', database: selectedDs?.label, username: 'postgres' }}>
                    <div className="form-grid">
                      <Form.Item label="Máy chủ" name="host"><Input prefix={<LinkOutlined />} /></Form.Item>
                      <Form.Item label="Cổng" name="port"><Input /></Form.Item>
                    </div>
                    <Form.Item label="Tên cơ sở dữ liệu" name="database"><Input prefix={<DatabaseOutlined />} /></Form.Item>
                    <div className="form-grid equal">
                      <Form.Item label="Tên đăng nhập" name="username"><Input /></Form.Item>
                      <Form.Item label="Mật khẩu" name="password"><Input.Password placeholder="Nhập mật khẩu" /></Form.Item>
                    </div>
                    {tested && (
                      <div className="connection-success">
                        <CheckCircleFilled />
                        <span><strong>Kết nối thành công</strong>PostgreSQL 16 · 8 bảng · 5.210.000 dòng</span>
                      </div>
                    )}
                    <div className="modal-actions">
                      <Button onClick={() => setSourceModalOpen(false)}>Hủy</Button>
                      {!tested ? (
                        <Button type="primary" loading={testing} onClick={testConnection}>Kiểm tra kết nối</Button>
                      ) : (
                        <Button type="primary" onClick={() => {
                          setSourceModalOpen(false);
                          api.success({ message: 'Đã kết nối PostgreSQL', description: 'e_commerce_db đã sẵn sàng để phân tích.' });
                        }}>
                          Sử dụng kết nối
                        </Button>
                      )}
                    </div>
                  </Form>
                </div>
              ),
            },
            {
              key: 'import',
              label: <span><InboxOutlined /> Import Dataset</span>,
              children: (
                <div className="source-tab-content">
                  <Upload.Dragger accept=".csv,.parquet" multiple beforeUpload={() => false} className="dataset-dragger">
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">Kéo thả CSV hoặc Parquet vào đây</p>
                    <p className="ant-upload-hint">Tối đa 2 GB mỗi file · Hệ thống sẽ tự động suy luận schema</p>
                    <Button>Chọn file từ máy</Button>
                  </Upload.Dragger>
                  <div className="import-pipeline">
                    {['Tải file', 'Suy luận schema', 'Tạo bảng', 'ANALYZE', 'Sẵn sàng'].map((step, index) => (
                      <React.Fragment key={step}>
                        <span><i>{index + 1}</i>{step}</span>
                        {index < 4 && <b>→</b>}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="modal-actions">
                    <Button onClick={() => setSourceModalOpen(false)}>Hủy</Button>
                    <Button type="primary" disabled>Import Dataset</Button>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
}
