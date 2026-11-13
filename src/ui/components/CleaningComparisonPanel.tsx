'use client';

import { useId, useState } from 'react';
import type { CleaningAction, CleaningComparison, CleaningComparisonDecision, Dataset } from '@/core';
import {
  actionForComparison, compareMissingCode, COMPARISON_LABELS, formatComparisonMean, formatComparisonRate,
} from '@/ui/lib/cleaningComparison';
import { Button } from './base/Button';

export function CleaningComparisonPanel({
  dataset, column, suggestedCode, dataVersion, onChoose,
}: {
  dataset: Dataset;
  column: string;
  suggestedCode?: string;
  dataVersion: number;
  onChoose: (action: CleaningAction) => boolean;
}) {
  const id = useId();
  const [code, setCode] = useState(suggestedCode ?? '');
  const [result, setResult] = useState<CleaningComparison | null>(null);
  const [choice, setChoice] = useState<CleaningComparisonDecision['choice'] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <details className="mt-2 rounded-lg border border-line px-3 py-1.5" data-testid="cleaning-comparison">
      <summary className="cursor-pointer py-1 text-xs font-medium text-brand-800 max-md:min-h-11">对比清洗口径</summary>
      <div className="space-y-2 border-t border-line py-2 text-xs text-ink-muted">
        <p>
          在「{column}」中试算一个疑似缺失占位码。按原写法匹配，例如 999 不匹配 0999 或 999.0 的文本。
          {suggestedCode ? '输入框中的编码由 AI 建议，请先查对数据字典。' : null}
        </p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          const comparison = compareMissingCode(dataset, column, code.trim());
          setResult(comparison);
          setError(comparison === null ? '未能试算，请核对字段与占位码。' : '');
        }}>
          <label className="min-w-0" htmlFor={`${id}-code`}>
            疑似占位码
            <input id={`${id}-code`} value={code} maxLength={80} placeholder="例如 999"
              className="mt-1 block w-44 max-w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-ink max-md:min-h-11"
              onChange={(event) => { setCode(event.target.value); setResult(null); setError(''); }} />
          </label>
          <Button type="submit" size="sm" variant="secondary" disabled={!code.trim()}>试算两种口径</Button>
        </form>
        {result ? (
          <>
            <p role="status">匹配 {result.matchingRows} 行。两种口径均保留全部数据行；试算没有改动数据。</p>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">选择清洗口径</legend>
              {(['as-missing', 'keep'] as const).map((key) => {
                const metrics = key === 'as-missing' ? result.asMissing : result.keep;
                return (
                  <label key={key} className="rounded-lg border border-line bg-canvas p-2.5 has-checked:border-brand-500">
                    <span className="flex items-center gap-2 font-medium text-ink max-md:min-h-11">
                      <input type="radio" name={`${id}-choice`} checked={choice === key} disabled={result.matchingRows === 0}
                        className="accent-brand-700" onChange={() => setChoice(key)} />
                      {COMPARISON_LABELS[key]}
                    </span>
                    <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1">
                      <dt>有效数值样本</dt><dd>{metrics.validNumeric}</dd>
                      <dt>缺失率</dt><dd>{formatComparisonRate(metrics.missingRate)}（{metrics.missing} 行）</dd>
                      <dt>数值均值</dt><dd>{formatComparisonMean(metrics.mean)}</dd>
                    </dl>
                  </label>
                );
              })}
            </fieldset>
            <p>均值只用可解析的数值，带前导零的编号不计入。缺失率以当前数据行数为分母。试算只衡量本条口径的影响。</p>
            {result.matchingRows > 0 ? (
              <>
                <label className="block" htmlFor={`${id}-reason`}>
                  选择理由（会写入报告）
                  <textarea id={`${id}-reason`} value={reason} maxLength={200} rows={2}
                    className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-ink"
                    onChange={(event) => setReason(event.target.value)} />
                </label>
                <Button size="sm" disabled={!choice || !reason.trim()} onClick={() => {
                  if (!choice) return;
                  if (!onChoose(actionForComparison({ ...result, choice, reason: reason.trim(), dataVersion }))) {
                    setError('这条试算已失效，或同一字段已选择口径，请返回审阅重新确认。');
                  }
                }}>采用此口径</Button>
                <p>采用后仍须点击「执行清洗」；执行前可以撤销这项决定。</p>
              </>
            ) : <p>没有匹配的记录，换一个编码再试。</p>}
          </>
        ) : null}
        {error ? <p role="alert" className="text-danger-700">{error}</p> : null}
      </div>
    </details>
  );
}
