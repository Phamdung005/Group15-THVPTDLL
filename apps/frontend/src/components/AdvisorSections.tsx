import React, { useState } from 'react';
import { Tag, Button } from 'antd';
import {
  CloseCircleFilled,
  WarningFilled,
  ApartmentOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  CrownOutlined,
  CodeOutlined,
  CheckCircleFilled,
  InfoCircleOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { Bottleneck, PlanNode, OptimizationResult, AnalyzedColumn, CandidateItem } from '../types';

const TYPE_COLORS: Record<string, string> = {
  'Quét Toàn Bảng (Seq Scan)': '#f43f5e',
  'Seq Scan': '#f43f5e',
  'Quét Index (Index Scan)': '#10b981',
  'Index Scan': '#10b981',
  'Bitmap Index Scan': '#10b981',
  'Bitmap Heap Scan': '#10b981',
  'Nối Bảng (Hash Join)': '#06b6d4',
  'Hash Join': '#06b6d4',
  'Vòng Lặp Lồng (Nested Loop)': '#f59e0b',
  'Nested Loop': '#f59e0b',
  'Bảng Băm (Hash)': '#8b5cf6',
  'Hash': '#8b5cf6',
  'Gom Nhóm (Hash Aggregate)': '#8b5cf6',
  'HashAggregate': '#8b5cf6',
  'Aggregate': '#8b5cf6',
  'Sắp Xếp (Sort)': '#f97316',
  'Sort': '#f97316',
  'Giới Hạn (Limit)': '#64748b',
  'Limit': '#64748b',
};

function SectionHeading({
  icon,
  eyebrow,
  title,
  aside,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
}) {
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

export function BottleneckSummary({ bottlenecks }: { bottlenecks?: Bottleneck[] }) {
  const items = bottlenecks || [];
  const hasItems = items.length > 0;
  const hasCritical = items.some(b => b.severity === 'critical');
  const hasWarning = items.some(b => b.severity === 'warning');

  return (
    <section className="top-analysis h-full">
      <div className="analysis-summary-head">
        <div>
          <span className="advisor-eyebrow">PHÂN TÍCH TỰ ĐỘNG</span>
          <h2>Điểm nghẽn truy vấn</h2>
        </div>
        <div className="risk-score">
          <span>RỦI RO</span>
          <strong style={{ color: hasCritical ? '#f43f5e' : (hasWarning ? '#f59e0b' : (hasItems ? '#06b6d4' : '#10b981')) }}>
            {hasCritical ? 'CAO' : (hasWarning ? 'TRUNG BÌNH' : (hasItems ? 'THẤP (TỐI ƯU)' : 'THẤP'))}
          </strong>
        </div>
      </div>

      <div className="bottleneck-list">
        {!hasItems ? (
          <div className="empty-advisor-box p-4 text-center text-slate-400">
            <InfoCircleOutlined className="text-xl mb-2 text-emerald-400 block" />
            <p className="text-sm">Không phát hiện điểm nghẽn nghiêm trọng.</p>
            <span className="text-xs text-slate-500">Truy vấn thực thi hiệu quả hoặc sử dụng Index tối ưu.</span>
          </div>
        ) : (
          items.slice(0, 4).map((item, index) => {
            const critical = item.severity === 'critical';
            const warning = item.severity === 'warning';
            return (
              <div className={`bottleneck-row ${critical ? 'critical' : (warning ? 'warning' : 'info')}`} key={item.id || index}>
                <div className="bottleneck-state">
                  {critical ? (
                    <CloseCircleFilled />
                  ) : warning ? (
                    <WarningFilled />
                  ) : (
                    <InfoCircleOutlined style={{ color: '#06b6d4' }} />
                  )}
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
          })
        )}
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
        <span className="plan-stat">{(node.rows || 0).toLocaleString('vi-VN')} dòng</span>
        <span className="plan-cost">chi phí {(node.cost || 0).toLocaleString('vi-VN')}</span>
        {node.actualTime !== undefined && (
          <span className="plan-time">{(node.actualTime || 0).toLocaleString('vi-VN')} ms</span>
        )}
      </button>
      {hasChildren && expanded && (
        <div className="plan-children" style={{ marginLeft: Math.min(depth + 1, 4) * 8 }}>
          {node.children!.map(child => <PlanBranch key={child.id} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export function ExecutionPlanSection({ plan }: { plan?: PlanNode }) {
  if (!plan) {
    return (
      <section className="advisor-section">
        <SectionHeading
          icon={<ApartmentOutlined />}
          eyebrow="EXPLAIN ANALYZE"
          title="Cây kế hoạch thực thi"
        />
        <div className="empty-advisor-box p-6 text-center text-slate-400">
          Chưa có cây kế hoạch thực thi. Vui lòng nhấn "Phân Tích & Tối Ưu Truy Vấn".
        </div>
      </section>
    );
  }

  return (
    <section className="advisor-section">
      <SectionHeading
        icon={<ApartmentOutlined />}
        eyebrow="EXPLAIN ANALYZE"
        title="Cây kế hoạch thực thi"
        aside={
          plan.actualTime !== undefined ? (
            <Tag className="plan-badge">{plan.actualTime.toLocaleString('vi-VN')} ms tổng thời gian</Tag>
          ) : (
            <Tag className="plan-badge">Ước lượng chi phí: {plan.cost.toLocaleString('vi-VN')}</Tag>
          )
        }
      />
      <div className="execution-tree">
        <div className="tree-guide">NHẤP VÀO NÚT ĐỂ THU GỌN NHÁNH</div>
        <PlanBranch node={plan} />
      </div>
    </section>
  );
}

export function ColumnRolesSection({ columns }: { columns?: AnalyzedColumn[] }) {
  const items = columns || [];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'FILTER_EQUAL':
        return { label: 'BỘ LỌC BẰNG (=)', tone: 'filter', desc: 'Điều kiện lọc bằng chính xác (Index Scan)' };
      case 'FILTER_RANGE':
        return { label: 'LỌC PHẠM VI (RANGE)', tone: 'range', desc: 'Quét theo khoảng giá trị hoặc thời gian (Index Range Scan)' };
      case 'JOIN':
        return { label: 'KHÓA NỐI (JOIN)', tone: 'join', desc: 'Điều kiện nối bảng ON / Foreign Key' };
      case 'AGGREGATE':
        return { label: 'TÍNH TOÁN (AGG)', tone: 'agg', desc: 'Cột trong hàm tổng hợp (SUM, COUNT, AVG)' };
      case 'SORT':
        return { label: 'SẮP XẾP (SORT)', tone: 'range', desc: 'Cột xuất hiện trong mệnh đề ORDER BY' };
      case 'GROUP':
        return { label: 'GOM NHÓM (GROUP)', tone: 'join', desc: 'Cột xuất hiện trong mệnh đề GROUP BY' };
      default:
        return { label: role, tone: 'filter', desc: 'Cột tham gia vào quá trình xử lý câu lệnh' };
    }
  };

  return (
    <section className="advisor-section">
      <SectionHeading
        icon={<DatabaseOutlined />}
        eyebrow="PHÂN TÍCH NGỮ NGHĨA"
        title="Vai trò các cột"
        aside={
          <span className="heading-note">
            {items.length > 0 ? `${items.length} cột ảnh hưởng đến phương án tối ưu` : 'Không có cột nào'}
          </span>
        }
      />
      {items.length === 0 ? (
        <div className="empty-advisor-box p-6 text-center text-slate-400">
          Chưa có phân tích vai trò cột. Hãy phân tích câu lệnh SQL để xem chi tiết.
        </div>
      ) : (
        <div className="roles-grid">
          {items.map((item, index) => {
            const roleInfo = getRoleBadge(item.role);
            return (
              <div className="role-card" key={`${item.tableName}.${item.columnName}.${index}`}>
                <code>{item.tableName ? `${item.tableName}.${item.columnName}` : item.columnName}</code>
                <span className={`role-tag ${roleInfo.tone}`}>{roleInfo.label}</span>
                <p>{item.expression ? `Biểu thức: ${item.expression}` : roleInfo.desc}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CandidateMatrix({ candidates }: { candidates?: CandidateItem[] }) {
  const items = candidates || [];

  return (
    <section className="advisor-section">
      <SectionHeading
        icon={<SafetyCertificateOutlined />}
        eyebrow={`SO SÁNH ${items.length} PHƯƠNG ÁN`}
        title="Ma trận ứng viên"
        aside={<span className="heading-note">Điểm càng cao, hiệu quả thực tế càng tốt</span>}
      />
      {items.length === 0 ? (
        <div className="empty-advisor-box p-6 text-center text-slate-400">
          Chưa có phương án ứng viên. Hãy phân tích câu lệnh để sinh và đo đạc các phương án tối ưu.
        </div>
      ) : (
        <div className="matrix-wrap">
          <table className="candidate-table">
            <thead>
              <tr>
                <th>Ứng viên</th>
                <th>Thời gian</th>
                <th>Đọc Blocks (I/O)</th>
                <th>Chi phí</th>
                <th>Điểm đánh giá</th>
              </tr>
            </thead>
            <tbody>
              {items.map((candidate) => {
                const time = candidate.benchmark?.executionTimeMs ?? 0;
                const reads = candidate.benchmark?.sharedReadBlocks ?? 0;
                const cost = candidate.benchmark?.totalCost ?? 0;
                const score = candidate.score ?? 0;
                const isWinner = candidate.isBest;

                return (
                  <tr key={candidate.id} className={isWinner ? 'winner-row' : ''}>
                    <td>
                      <div className="candidate-name">
                        {isWinner && <CrownOutlined style={{ color: '#06b6d4' }} />}
                        <div>
                          <strong>{candidate.name}</strong>
                          <span>{candidate.description}</span>
                        </div>
                        {isWinner && <Tag color="cyan">ĐỀ XUẤT</Tag>}
                      </div>
                    </td>
                    <td><strong>{time.toLocaleString('vi-VN')}</strong> ms</td>
                    <td>{reads.toLocaleString('vi-VN')}</td>
                    <td>{cost.toLocaleString('vi-VN')}</td>
                    <td>
                      <div className="score-cell">
                        <div className="score-track">
                          <i style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
                        </div>
                        <strong>{score}</strong>
                        <span>/100</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface RecommendationSectionProps {
  result?: OptimizationResult;
  onApply?: (candidate: any) => void;
  onRollback?: () => void;
  loadingAction?: boolean;
}

export function RecommendationSection({
  result,
  onApply,
  onRollback,
  loadingAction = false,
}: RecommendationSectionProps) {
  if (!result || !result.bestCandidate) {
    return null;
  }

  const best = result.bestCandidate;
  const isOptimal = best.strategy === 'BASELINE' || result.improvementPercent <= 0;

  // Lấy các lệnh DDL / SQL đề xuất
  const ddlCommands = best.changes?.map(c => c.sqlCommand).filter(Boolean) || [];
  const displaySql = ddlCommands.length > 0 ? ddlCommands.join('\n\n') : (best.sql || result.optimizedQuery);

  return (
    <section className="recommendation-section">
      <div className="recommendation-accent" />
      <div className="recommendation-copy">
        <div className="recommendation-label">
          <CrownOutlined /> {isOptimal ? 'TRẠNG THÁI HIỆN TẠI' : 'KHUYẾN NGHỊ TỐI ƯU'}
        </div>
        <h2>{best.name}</h2>
        <p>
          {isOptimal
            ? 'Câu truy vấn đã tối ưu sẵn trên cơ sở dữ liệu. Không cần áp dụng thêm chỉ mục hay thay đổi.'
            : `Giảm ${result.improvementPercent}% thời gian thực thi và ${result.readReductionPercent ?? 0}% lượt đọc đĩa mà không thay đổi kết quả dữ liệu.`}
        </p>
        <div className="impact-row">
          <span>
            <small>THỜI GIAN</small>
            <strong>
              {result.originalMetrics.executionTime.toLocaleString('vi-VN')} → {result.optimizedMetrics.executionTime.toLocaleString('vi-VN')} ms
            </strong>
          </span>
          <span>
            <small>LẦN ĐỌC BLOCKS</small>
            <strong>
              {result.originalMetrics.sharedReadBuffers.toLocaleString('vi-VN')} → {result.optimizedMetrics.sharedReadBuffers.toLocaleString('vi-VN')}
            </strong>
          </span>
          <span>
            <small>ĐIỂM ĐÁNH GIÁ</small>
            <strong>{best.score ?? 100}/100</strong>
          </span>
        </div>
      </div>

      <div className="recommendation-code">
        <div className="code-caption"><CodeOutlined /> LỆNH THỰC THI ĐỀ XUẤT</div>
        <pre>{displaySql}</pre>
        <div className="recommendation-actions">
          <Button
            className="rollback-btn"
            icon={<UndoOutlined />}
            loading={loadingAction}
            onClick={onRollback}
          >
            Hoàn tác
          </Button>
          {!isOptimal && (
            <Button
              type="primary"
              icon={<CheckCircleFilled />}
              className="apply-btn"
              loading={loadingAction}
              onClick={() => onApply && onApply(best)}
            >
              Áp dụng an toàn
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
