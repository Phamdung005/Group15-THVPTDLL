import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';

interface BenchmarkChartsProps {
  executionTimeBefore: number;
  executionTimeAfter: number;
  totalCostBefore: number;
  totalCostAfter: number;
  improvementPercent: number;
}

const CHART_STYLE = { background: 'transparent', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" };
const TICK_STYLE = { fill: '#64748b', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" };

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.fill, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>{p.name}:</span>
          <span style={{ fontSize: 11, fontWeight: 'bold', fontFamily: "'JetBrains Mono', monospace", color: p.fill }}>
            {Number(p.value).toLocaleString('vi-VN')}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BenchmarkCharts({ executionTimeBefore, executionTimeAfter, totalCostBefore, totalCostAfter, improvementPercent }: BenchmarkChartsProps) {
  const timeData = [
    { label: 'Trước', value: executionTimeBefore, fill: '#f43f5e' },
    { label: 'Sau', value: executionTimeAfter, fill: '#10b981' },
  ];

  const costData = [
    { label: 'Trước', value: Math.round(totalCostBefore), fill: '#f59e0b' },
    { label: 'Sau', value: Math.round(totalCostAfter), fill: '#10b981' },
  ];

  const bufferData = [
    { name: 'Trước', 'RAM (nhanh)': 8200, 'Đĩa cứng (chậm)': 40120 },
    { name: 'Sau', 'RAM (nhanh)': 2090, 'Đĩa cứng (chậm)': 50 },
  ];

  const costReduction = (((totalCostBefore - totalCostAfter) / totalCostBefore) * 100).toFixed(1);

  return (
    <div className="flex flex-col gap-5">
      {/* Thẻ tổng kết */}
      <div className="summary-badge flex items-center justify-between p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🚀</span>
            <span className="text-sm font-bold text-emerald-400">Tối ưu Hóa Thành Công!</span>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Thời gian thực thi:{' '}
            <span className="text-rose-400">{executionTimeBefore.toLocaleString('vi-VN')}ms</span>
            {' → '}
            <span className="text-emerald-400">{executionTimeAfter.toLocaleString('vi-VN')}ms</span>
            {' · '}
            Chi phí truy vấn giảm{' '}
            <span className="text-amber-400">{costReduction}%</span>
          </p>
        </div>
        <div className="text-right">
          <div
            className="text-4xl font-black tabular-nums"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: '#10b981' }}
          >
            ↑{improvementPercent}%
          </div>
          <div className="text-xs text-slate-500 font-mono">nhanh hơn</div>
        </div>
      </div>

      {/* 3 biểu đồ */}
      <div className="grid grid-cols-3 gap-4">
        {/* Thời gian thực thi */}
        <div className="chart-panel border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">
            Thời Gian Thực Thi (ms)
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={timeData} style={CHART_STYLE} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <ReTooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Thời gian (ms)">
                {timeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-2 text-xs font-mono">
            <span className="text-rose-400">{executionTimeBefore.toLocaleString('vi-VN')}ms</span>
            <span className="text-emerald-400">→ {executionTimeAfter.toLocaleString('vi-VN')}ms</span>
          </div>
        </div>

        {/* Chi phí truy vấn */}
        <div className="chart-panel border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">
            Chi Phí Truy Vấn
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={costData} style={CHART_STYLE} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <ReTooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Chi phí">
                {costData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-2 text-xs font-mono">
            <span className="text-amber-400">{totalCostBefore.toLocaleString('vi-VN')}</span>
            <span className="text-emerald-400">→ {totalCostAfter.toLocaleString('vi-VN')}</span>
          </div>
        </div>

        {/* Lần đọc bộ nhớ đệm */}
        <div className="chart-panel border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">
            Đọc Bộ Nhớ (RAM vs Đĩa)
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={bufferData} style={CHART_STYLE} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
              <ReTooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#64748b' }} />
              <Bar dataKey="RAM (nhanh)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Đĩa cứng (chậm)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-2 text-xs font-mono">
            <span className="text-cyan-400">RAM → tốt hơn</span>
            <span className="text-rose-400">Đĩa ↓ giảm</span>
          </div>
        </div>
      </div>
    </div>
  );
}
