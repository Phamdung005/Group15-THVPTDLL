import React, { useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Button, Select, Tooltip } from 'antd';
import { ThunderboltOutlined, ExpandOutlined, CompressOutlined } from '@ant-design/icons';
import type { OptimizationRule } from '../types';

interface SqlEditorProps {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;
  rule: OptimizationRule;
  onRuleChange: (r: OptimizationRule) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  showExpand?: boolean;
}

const RULES: Array<{ label: string; value: OptimizationRule }> = [
  { label: 'Tất cả quy tắc', value: 'all' },
  { label: 'Đẩy Index xuống (Index Pushdown)', value: 'index_pushdown' },
  { label: 'Sắp xếp lại JOIN', value: 'join_reorder' },
  { label: 'Cắt tỉa phân vùng', value: 'partition_pruning' },
  { label: 'Nội tuyến hóa CTE', value: 'cte_inline' },
];

const EDITOR_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '06b6d4', fontStyle: 'bold' },
    { token: 'string', foreground: '10b981' },
    { token: 'comment', foreground: '475569', fontStyle: 'italic' },
    { token: 'number', foreground: 'f59e0b' },
    { token: 'operator', foreground: 'a78bfa' },
    { token: 'identifier', foreground: 'e2e8f0' },
  ],
  colors: {
    'editor.background': '#0f172a',
    'editor.foreground': '#e2e8f0',
    'editorLineNumber.foreground': '#334155',
    'editorLineNumber.activeForeground': '#06b6d4',
    'editor.selectionBackground': '#06b6d430',
    'editor.lineHighlightBackground': '#1e293b',
    'editorCursor.foreground': '#06b6d4',
    'editorGutter.background': '#0b1220',
    'editorWidget.background': '#1e293b',
    'editorSuggestWidget.background': '#1e293b',
    'editorSuggestWidget.border': '#334155',
    'editorSuggestWidget.selectedBackground': '#06b6d420',
  },
};

export function SqlEditor({ value, onChange, onAnalyze, loading, rule, onRuleChange, expanded, onToggleExpand, showExpand = true }: SqlEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('sql-dark', EDITOR_THEME);
    monaco.editor.setTheme('sql-dark');
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onAnalyze);
    editor.focus();
  };

  return (
    <div className="editor-panel flex flex-col h-full">
      {/* Toolbar trên */}
      <div className="editor-toolbar flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Câu lệnh SQL</span>
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={rule}
            onChange={onRuleChange}
            size="small"
            options={RULES}
            style={{ width: 220 }}
            className="rule-select"
            popupClassName="dark-select-popup"
          />
          {showExpand && <Tooltip title={expanded ? 'Thu nhỏ editor' : 'Mở rộng editor'}>
            <Button
              size="small"
              icon={expanded ? <CompressOutlined /> : <ExpandOutlined />}
              className="header-btn"
              onClick={onToggleExpand}
            />
          </Tooltip>}
        </div>
      </div>

      {/* Khu vực Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="sql"
          value={value}
          onChange={v => onChange(v ?? '')}
          onMount={handleMount}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            renderLineHighlight: 'all',
            tabSize: 2,
            suggest: { showKeywords: true },
          }}
        />
      </div>

      {/* Thanh hành động dưới */}
      <div className="editor-action-bar flex items-center justify-between px-3 py-2.5 border-t border-slate-700/60">
        <span className="text-xs text-slate-500 font-mono">
          Nhấn <kbd className="kbd-hint">Ctrl+Enter</kbd> để phân tích
        </span>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={loading}
          onClick={onAnalyze}
          className="analyze-btn"
          size="middle"
        >
          {loading ? 'Đang phân tích…' : 'Phân Tích & Tối ưu Truy Vấn'}
        </Button>
      </div>
    </div>
  );
}
