'use client';

import { useMemo, useState } from 'react';
import type { Dataset } from '@/core';
import { Badge } from './base/Badge';
import { Button } from './base/Button';
import { DataTable } from './DataTable';
import type { ConclusionEvidence } from '@/ui/lib/conclusionEvidence';
import { extractSourceMeta } from '@/ui/lib/ruleSource';
import { evidenceLabel } from '@/ui/lib/evidenceLabels';

export function ConclusionEvidencePanel({
  evidence, dataset, version, historical, ruleChanged,
}: {
  evidence: ConclusionEvidence;
  dataset: Dataset | null;
  version: number | null;
  historical: boolean;
  ruleChanged: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const check = evidence.check;
  const rows = useMemo(() => [...new Set(check?.evidence.rowIndices ?? [])], [check]);
  const stats = Object.entries(check?.evidence.statistics ?? {})
    .filter(([key, value]) => key === 'method' ||
      (key !== 'columnNumber' && typeof value === 'number' && Number.isFinite(value)));
  const currentCheck = check && !historical && !ruleChanged;
  const status = historical || ruleChanged ? '历史依据' : check ? '有本地检查依据' : '待复核';
  const columnIndex = check?.columnIndex ?? (
    dataset && check?.evidence.columns.length === 1 &&
      dataset.columns.filter((column) => column.name === check.evidence.columns[0]).length === 1
      ? dataset.columns.findIndex((column) => column.name === check.evidence.columns[0]) : -1
  );
  return (
    <details
      className="mt-2 rounded-lg border border-line px-3 py-1.5"
      data-testid="conclusion-evidence"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer py-1 text-xs font-medium text-brand-800 max-md:min-h-11">
        核对依据 <span className="ml-1"><Badge tone={currentCheck ? 'success' : 'medium'}>{status}</Badge></span>
      </summary>
      <div className="space-y-3 border-t border-line py-2 text-xs leading-relaxed text-ink-muted">
        {historical || ruleChanged ? (
          <p>以下依据来自分析时的数据与规则{version === null ? '' : `（数据 v${version}）`}，不定位到现在的表格。</p>
        ) : null}
        {check ? (
          <div>
            <p className="font-medium text-ink">本地检查 · {check.title}</p>
            <p>{check.description}</p>
            {rows.length > 0 ? <p>涉及 {rows.length} 个数据行（行号从 1 开始，不含表头）。</p>
              : <p>此检查结果只提供字段或整表统计，未提供具体行号。</p>}
            {stats.length > 0 ? (
              <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {stats.map(([key, value]) => (
                  <div key={key} className="flex gap-1"><dt>{evidenceLabel(key)}</dt><dd>
                    {key === 'missingRate' && typeof value === 'number'
                      ? value.toLocaleString('zh-CN', { style: 'percent', maximumFractionDigits: 2 })
                      : key === 'method' && value === 'iqr' ? '四分位距（IQR）' : String(value)}
                  </dd></div>
                ))}
              </dl>
            ) : null}
            {open && currentCheck && dataset && rows.length > 0 ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {rows.slice(0, 5).map((row) => (
                    <Button key={row} size="sm" variant="secondary" onClick={() => setFocusedRow(row)}>
                      定位第 {row + 1} 行
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setFocusedRow(rows[0]!)}>
                    查看相关记录
                  </Button>
                </div>
                {focusedRow !== null ? (
                  <DataTable dataset={dataset} visibleRows={rows} highlightRows={rows}
                    focusedRow={focusedRow} focusedColumn={columnIndex} />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p>{evidence.invalidCheck ? '引用与本轮检查结果不匹配。' : '这条结论没有引用本轮检查结果。'}请核对数据后再采纳。</p>
        )}
        {evidence.rules.length > 0 ? (
          <div>
            <p className="font-medium text-ink">知识库参考 · 请自行核对适用条件</p>
            <ul className="mt-1 space-y-2">
              {evidence.rules.map((rule) => {
                const { url, verifiedAt } = extractSourceMeta(rule.source);
                return (
                  <li key={rule.id} className="rounded-lg bg-canvas p-2 [overflow-wrap:anywhere]">
                    <p className="font-medium text-ink">{rule.title}（{rule.id}）</p>
                    <p>{rule.content}</p>
                    <p>适用字段：{rule.fields.join('、') || '未限定'} · 触发条件：{rule.condition || '未提供'}</p>
                    <p>权威度：{rule.authority || '未提供'} · 核验状态：{rule.verification || '未提供'} · 核验日期：{verifiedAt || '未提供'}</p>
                    {rule.source ? <p className="whitespace-pre-line">来源：{rule.source}</p> : <p>来源：未提供</p>}
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block py-1 text-brand-800 underline max-md:min-h-11">打开规则来源</a> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {evidence.invalidRules > 0 ? <p>{evidence.invalidRules} 条规则引用未匹配本轮检索或相关字段，未列作依据。</p> : null}
      </div>
    </details>
  );
}
