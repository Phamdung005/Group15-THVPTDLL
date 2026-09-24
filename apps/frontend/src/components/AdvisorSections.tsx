import React, { useState } from 'react';
import { Tag, notification } from 'antd';
import {
  CloseCircleFilled,
  WarningFilled,
  ApartmentOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  CrownOutlined,
  CodeOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { Button } from 'antd';
import type { Bottleneck, PlanNode, OptimizationResult } from '../types';
import { COLUMN_ROLES, CANDIDATES } from '../data/mockData';

const TYPE_COLORS: Record<string, string> = {
  'Quét Toàn Bảng (Seq Scan)': '#f43f5e',
  'Quét Index (Index Scan)': '#10b981',
  'Nối Bảng (Hash Join)': '#06b6d4',
  'Vòng Lặp Lồng (Nested Loop)': '#f59e0b',
  'Bảng Băm (Hash)': '#8b5cf6',
  'Gom Nhóm (Hash Aggregate)': '#8b5cf6',
  'Sắp Xếp (Sort)': '#f97316',
  'Giới Hạn (Limit)': '#64748b',
};

function SectionHeading({ icon, eyebrow, title, aside }: { icon: React.ReactNode; eyebrow: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="advisor-heading">
      <div className="advisor-heading-icon">{icon}</div>
      <div>
        <div className="advisor-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {aside && <div className="advisor-heading-aside">{aside}</div>}
    </div>
  );
}

export function BottleneckSummary({ bottlenecks }: { bottlenecks: Bottleneck[] }) {
  return (
    <section className="top-analysis h-full">
      <div className="analysis-summary-head">
        <div>
          <span className="advisor-eyebrow">PHÂN TÍCH TỰ ĐỘNG</span>
          <h2>Điểm nghẽn truy vấn</h2>
        </div>
        <div className="risk-score">
          <span>RỦI RO</span>
          <strong>CAO</strong>
        </div>
      </div>
      <div className="bottleneck-list">
        {bottlenecks.slice(0, 4).map((item, index) => {
          const critical = item.severity === 'critical';
          return (
            <div className={`bottleneck-row ${critical ? 'critical' : 'warning'}`} key={item.id}>
              <div className="bottleneck-state">
                {critical ? <CloseCircleFilled /> : <WarningFilled />}
              </div>
              <div className="bottleneck-copy">
                <div className="flex items-center gap-2">
                  <strong>{item.type.split(' (')[0]}</strong>
                  {item.table && <code>{item.table}</code>}
                </div>
                <p>{item.message.replace(/`/g, '')}</p>
              </div>
              <span className="issue-number">0{index + 1}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PlanBranch({ node, depth = 0 }: { node: PlanNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Boolean(node.children?.length);
  const color = TYPE_COLORS[node.type] ?? '#94a3b8';

  return (
    <div className="plan-branch">
      <button
        type="button"
        className="plan-card"
        style={{ '--node-color': color } as React.CSSProperties}
        onClick={() => hasChildren && setExpanded(value => !value)}
      >
        <span className="plan-toggle">{hasChildren ? (expanded ? '▾' : '+') : '·'}</span>
        <span className="plan-node-name">{node.type.split(' (')[0]}</span>
        {node.relation && <span className="plan-relation">{node.relation}</span>}
        <span className="plan-stat">{node.rows.toLocaleString('vi-VN')} dòng</span>
        <span className="plan-cost">chi phí {node.cost.toLocaleString('vi-VN')}</span>
        {node.actualTime !== undefined && <span className="plan-time">{node.actualTime.toLocaleString('vi-VN')} ms</span>}
      </button>
      {hasChildren && expanded && (
        <div className="plan-children" style={{ marginLeft: Math.min(depth + 1, 4) * 8 }}>
          {node.children!.map(child => <PlanBranch key={child.id} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export function ExecutionPlanSection({ plan }: { plan: PlanNode }) {
  return (
    <section className="advisor-section">
      <SectionHeading
        icon={<ApartmentOutlined />}
        eyebrow="EXPLAIN ANALYZE"
        title="Cây kế hoạch thực thi"
        aside={<Tag className="plan-badge">1.250 ms tổng thời gian</Tag>}
      />
      <div className="execution-tree">
        <div className="tree-guide">NHẤP VÀO NÚT ĐỂ THU GỌN NHÁNH</div>
        <PlanBranch node={plan} />
      </div>
    </section>
  );
}

export function ColumnRolesSection() {
  return (
    <section className="advisor-section">
      <SectionHeading
        icon={<DatabaseOutlined />}
        eyebrow="PHÂN TÍCH NGỮ NGHĨA"
        title="Vai trò các cột"
        aside={<span className="heading-note">4 cột ảnh hưởng đến phương án tối ưu</span>}
      />
      <div className="roles-grid">
        {COLUMN_ROLES.map(item => (
          <div className="role-card" key={item.column}>
            <code>{item.column}</code>
            <span className={`role-tag ${item.tone}`}>{item.role}</span>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CandidateMatrix() {
  return (
    <section className="advisor-section">
      <SectionHeading
        icon={<SafetyCertificateOutlined />}
        eyebrow="SO SÁNH 5 PHƯƠNG ÁN"
        title="Ma trận ứng viên"
        aside={<span className="heading-note">Điểm càng cao, hiệu quả càng tốt</span>}
      />
      <div className="matrix-wrap">
        <table className="candidate-table">
          <thead>
            <tr>
              <th>Ứng viên</th>
              <th>Thời gian</th>
              <th>Lần đọc</th>
              <th>Chi phí</th>
              <th>Điểm đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {CANDIDATES.map(candidate => (
              <tr key={candidate.name} className={candidate.winner ? 'winner-row' : ''}>
                <td>
                  <div className="candidate-name">
                    {candidate.winner && <CrownOutlined />}
                    <div><strong>{candidate.name}</strong><span>{candidate.detail}</span></div>
                    {candidate.winner && <Tag color="cyan">ĐỀ XUẤT</Tag>}
                  </div>
                </td>
                <td><strong>{candidate.time.toLocaleString('vi-VN')}</strong> ms</td>
                <td>{candidate.reads}</td>
                <td>{candidate.cost}</td>
                <td>
                  <div className="score-cell">
                    <div className="score-track"><i style={{ width: `${candidate.score}%` }} /></div>
                    <strong>{candidate.score}</strong><span>/100</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RecommendationSection({ result }: { result?: OptimizationResult }) {
  const [api, contextHolder] = notification.useNotification();

  const notify = (message: string, description: string) => {
    api.success({ message, description, placement: 'topRight', duration: 3 });
  };

  return (
    <section className="recommendation-section">
      {contextHolder}
      <div className="recommendation-accent" />
      <div className="recommendation-copy">
        <div className="recommendation-label"><CrownOutlined /> KHUYẾN NGHỊ TỐI ƯU</div>
        <h2>Index tổng hợp cho bảng <code>orders</code></h2>
        <p>Giảm 67,2% thời gian thực thi và 83,2% lượt đọc đĩa mà không thay đổi kết quả truy vấn.</p>
        <div className="impact-row">
          <span><small>THỜI GIAN</small><strong>1.250 → 410 ms</strong></span>
          <span><small>LẦN ĐỌC</small><strong>48,3K → 8,1K</strong></span>
          <span><small>ĐỘ TIN CẬY</small><strong>91%</strong></span>
        </div>
      </div>
      <div className="recommendation-code">
        <div className="code-caption"><CodeOutlined /> SQL ĐỀ XUẤT</div>
        <pre><span>CREATE INDEX CONCURRENTLY</span>{'\n'}idx_orders_status_created_at{'\n'}<span>ON</span> orders (status, created_at){'\n'}<span>WHERE</span> status = <em>'completed'</em>;</pre>
        <div className="recommendation-actions">
          <Button
            className="rollback-btn"
            onClick={() => notify('Đã hoàn tác', 'Thay đổi index gần nhất đã được đưa vào hàng đợi hoàn tác.')}
          >
            Hoàn tác
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleFilled />}
            className="apply-btn"
            onClick={() => notify('Đã áp dụng khuyến nghị', 'Index đang được tạo đồng thời, không khóa bảng orders.')}
          >
            Áp dụng an toàn
          </Button>
        </div>
      </div>
    </section>
  );
}
