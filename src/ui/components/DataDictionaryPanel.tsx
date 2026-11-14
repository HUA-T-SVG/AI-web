'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CleaningComparison, Dataset, RangeRule } from '@/core';
import {
  DICTIONARY_MAX_COLUMNS,
  DICTIONARY_MAX_TEXT_LENGTH,
  dictionaryRequestSchema,
  dictionaryResponseSchema,
  type DictionaryCandidate,
} from '@/agent/shared/dataDictionary';
import { compareMissingCode, formatComparisonMean, formatComparisonRate } from '@/ui/lib/cleaningComparison';
import { dictionaryCodeConflictsWithRule, prepareDictionaryCandidates, resolveDictionarySelection } from '@/ui/lib/dataDictionary';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useRangeRuleStore } from '@/ui/stores/rangeRuleStore';
import { Badge } from './base/Badge';
import { Button } from './base/Button';
import { Notice } from './base/Notice';
import { Spinner } from './base/Spinner';

type Prepared = ReturnType<typeof prepareDictionaryCandidates>;
type Drafts = Record<string, { column: string; selected: boolean }>;
type SavedCodes = ReturnType<typeof useRangeRuleStore.getState>['dictionaryCodes'];

const KIND_LABEL: Record<DictionaryCandidate['kind'], string> = {
  range: '数值范围',
  allowed: '允许取值',
  'missing-code': '缺失占位码',
};

function rangeDescription({ min, max }: Pick<RangeRule, 'min' | 'max'>) {
  return [min === undefined ? '' : `下限 ${min}`, max === undefined ? '' : `上限 ${max}`]
    .filter(Boolean).join('，');
}

function describeCandidate(candidate: DictionaryCandidate): string {
  switch (candidate.kind) {
    case 'range': return rangeDescription(candidate);
    case 'allowed': return candidate.values.join('、');
    case 'missing-code': return `「${candidate.code}」 · 仅记录，供本地试算`;
  }
}

function describeSavedRule(rule: RangeRule) {
  return [rangeDescription(rule), (rule.allowedValues ?? []).join('、')].filter(Boolean).join('；');
}

function DictionaryCodePreview({ dataset, column, code, quote }: {
  dataset: Dataset;
  column: string;
  code: string;
  quote: string;
}) {
  const [preview, setPreview] = useState<CleaningComparison | null>(null);
  const [failed, setFailed] = useState(false);
  const remove = () => useRangeRuleStore.getState().removeDictionaryCode(column, code);

  return (
    <li className="min-w-0 rounded-lg border border-line px-3 py-2.5" data-testid="dictionary-code">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm font-medium text-ink [overflow-wrap:anywhere]">
          「{column}」的占位码「{code}」
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="secondary" onClick={() => {
            if (preview) { setPreview(null); return; }
            const comparison = compareMissingCode(dataset, column, code);
            setPreview(comparison);
            setFailed(comparison === null);
          }}>{preview ? '收起试算' : '试算缺失口径'}</Button>
          <Button size="sm" variant="ghost" onClick={remove}>移除占位码</Button>
        </div>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted [overflow-wrap:anywhere]">字典原文：{quote}</p>
      {failed ? <p className="mt-2 text-xs text-warning-700" role="alert">无法试算。请检查当前数据的列名是否唯一。</p> : null}
      {preview ? (
        <div className="mt-2 border-t border-line pt-2 text-xs text-ink-muted" data-testid="dictionary-code-preview">
          <p role="status">本地匹配 {preview.matchingRows} 行，两种口径都保留原有行数，试算不会修改数据。</p>
          <table className="mt-2 w-full border-collapse text-left">
            <thead className="text-ink"><tr>
              <th scope="col" className="p-1.5 font-medium">口径</th>
              <th scope="col" className="p-1.5 text-right font-medium">有效数值</th>
              <th scope="col" className="p-1.5 text-right font-medium">缺失率</th>
              <th scope="col" className="p-1.5 text-right font-medium">均值</th>
            </tr></thead>
            <tbody>
              {([['保留原值', preview.keep], ['转为缺失', preview.asMissing]] as const).map(([label, metrics]) => (
                <tr key={label} className="border-t border-line">
                  <th scope="row" className="p-1.5 font-normal">{label}</th>
                  <td className="p-1.5 text-right tabular-nums">{metrics.validNumeric}</td>
                  <td className="p-1.5 text-right tabular-nums">{formatComparisonRate(metrics.missingRate)}</td>
                  <td className="p-1.5 text-right tabular-nums">{formatComparisonMean(metrics.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </li>
  );
}

/** 候选原文只在此组件中保存；明确确认后才更新当前数据的检查口径。 */
export function DataDictionaryPanel({ dataset, dataVersion, canApply }: {
  dataset: Dataset;
  dataVersion: number;
  canApply: boolean;
}) {
  const formId = useId();
  const rules = useRangeRuleStore((state) => state.rules);
  const codes = useRangeRuleStore((state) => state.dictionaryCodes);
  const [source, setSource] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [overwrite, setOverwrite] = useState<{
    rules: typeof rules;
    codes: SavedCodes;
    drafts: Drafts;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const columns = useMemo(() => dataset.columns.map(({ name }) => name), [dataset]);
  const candidateColumns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of columns) counts.set(name, (counts.get(name) ?? 0) + 1);
    return columns.filter((name) => name.trim() && counts.get(name) === 1);
  }, [columns]);
  const savedCodes = Object.values(codes).flat().filter(({ column }) => candidateColumns.includes(column));
  const selections = Object.entries(drafts).flatMap(([id, draft]) => draft.selected ? [{ id, column: draft.column }] : []);
  const resolution = prepared && selections.length ? resolveDictionarySelection(prepared, selections, columns) : null;
  const replacementRules = resolution?.ok ? resolution.rules.flatMap(({ column }) =>
    Object.hasOwn(rules, column) ? [{ column, previous: describeSavedRule(rules[column]!) }] : []) : [];
  const replacementCodes = resolution?.ok ? [...new Set(resolution.missingCodes.map(({ column }) => column))]
    .flatMap((column) => Object.hasOwn(codes, column) && codes[column]?.length
      ? [{ column, previous: codes[column].map(({ code }) => code).join('、') }] : []) : [];
  const savedConflict = resolution?.ok ? (() => {
    const newRanges = new Set(resolution.rules.map(({ column }) => column));
    const newCodes = new Set(resolution.missingCodes.map(({ column }) => column));
    for (const rule of resolution.rules) {
      if (newCodes.has(rule.column)) continue;
      const conflict = Object.hasOwn(codes, rule.column) && codes[rule.column]?.find(({ code }) =>
        dictionaryCodeConflictsWithRule(code, rule));
      if (conflict) return `「${rule.column}」已记录缺失占位码「${conflict.code}」，而新规则将它视为有效值。请修改选择，或先移除旧占位码。`;
    }
    for (const { column, code } of resolution.missingCodes) {
      if (newRanges.has(column)) continue;
      const saved = Object.hasOwn(rules, column) ? rules[column] : undefined;
      if (saved && dictionaryCodeConflictsWithRule(code, saved)) {
        return `「${column}」当前检查规则将「${code}」视为有效值。请修改选择，或先到覆盖地图调整适用范围。`;
      }
    }
    return '';
  })() : '';
  const needsReplacement = replacementRules.length > 0 || replacementCodes.length > 0;
  const replacementConfirmed = overwrite?.rules === rules && overwrite.codes === codes && overwrite.drafts === drafts;
  const busy = extracting || applying;

  async function extract() {
    if (busy || controller.current !== null) return;
    const input = dictionaryRequestSchema.safeParse({ text: source.trim(), columns: candidateColumns });
    if (!input.success) {
      setError(`请输入字典文本，并确认当前表含可匹配的列名（最多 ${DICTIONARY_MAX_COLUMNS} 列）。`);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setExtracting(true);
    setError('');
    setSuccess('');
    setPrepared(null);
    setDrafts({});
    setOverwrite(null);
    try {
      const response = await fetch('/api/data-dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data),
        signal: request.signal,
      });
      const payload: unknown = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
          typeof payload.error === 'string' ? payload.error : '暂时无法提取规则，请重试。';
        setError(message);
        return;
      }
      const parsed = dictionaryResponseSchema.safeParse(payload);
      if (!parsed.success) { setError('返回的规则格式无法识别，请重试。'); return; }
      const rows = prepareDictionaryCandidates(input.data.text, columns, parsed.data.candidates);
      setPrepared(rows);
      setDrafts(Object.fromEntries(rows.map(({ id, column }) => [id, { column: column ?? '', selected: false }])));
    } catch {
      if (!request.signal.aborted) setError('未能连接 AI 服务，请稍后重试。你也可以在覆盖地图里手动填写规则。');
    } finally {
      if (!request.signal.aborted) setExtracting(false);
      if (controller.current === request) controller.current = null;
    }
  }

  async function apply() {
    if (!canApply || busy || !resolution?.ok || savedConflict || (needsReplacement && !replacementConfirmed)) return;
    if (useRangeRuleStore.getState().dictionaryCodes !== codes) {
      setError('占位码配置已变更。请核对最新配置后再应用。');
      return;
    }
    setApplying(true);
    setError('');
    try {
      const accepted = await useDatasetStore.getState().applyDictionaryRules(
        dataVersion, dataset, rules, codes, resolution.rules, resolution.missingCodes,
      );
      if (accepted === 'stale') { setError('当前数据或规则已改变。请核对后再应用。'); return; }
      if (accepted === 'checks-not-done') {
        setError('有配置被更新，或值域检查未完成。请查看已记录的占位码和覆盖地图中的检查状态。');
        return;
      }
      const { rules: updatedRules, missingCodes } = resolution;
      setSuccess(`已保存 ${updatedRules.length} 条检查规则、${missingCodes.length} 个占位码。` +
        (updatedRules.length ? '值域检查结果可在下方覆盖地图与问题列表查看。' : '') +
        '本次没有改动数据。');
      setPrepared(null);
      setSource('');
      setDrafts({});
      setOverwrite(null);
    } catch {
      setError('未能应用这些规则。请查看覆盖地图中的当前配置后重试。');
    } finally {
      setApplying(false);
    }
  }

  return (
    <details data-testid="data-dictionary" className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(22,33,31,0.04)]">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-ink sm:px-5">
        从数据字典生成检查规则
        {savedCodes.length ? <span className="ml-2 text-xs font-normal text-ink-muted">{savedCodes.length} 个已记录的占位码</span> : null}
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void extract(); }}>
          <label htmlFor={formId} className="block text-sm font-medium text-ink">数据字典文本</label>
          <p id={`${formId}-help`} className="max-w-prose text-xs leading-relaxed text-ink-muted">
            粘贴字段说明、允许取值或缺失码。点击提取时会把这段文字和当前表的可匹配列名发给 AI 服务，不发送表里的记录。
            请勿粘贴姓名、学号或其他个人资料。提取后只生成候选，确认后才在本地应用。
          </p>
          <textarea
            id={formId}
            aria-describedby={`${formId}-help`}
            value={source}
            maxLength={DICTIONARY_MAX_TEXT_LENGTH}
            rows={4}
            disabled={busy}
            className="block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
            placeholder={'例：成绩：允许范围 0–100 分。\n成绩：999 表示缺考。\n学历：只允许本科、硕士。'}
            onChange={(event) => {
              setSource(event.target.value);
              setPrepared(null);
              setDrafts({});
              setOverwrite(null);
              setError('');
              setSuccess('');
            }}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button type="submit" size="sm" variant={prepared ? 'secondary' : 'primary'}
              disabled={busy || !source.trim() || candidateColumns.length === 0 || candidateColumns.length > DICTIONARY_MAX_COLUMNS}>
              {extracting ? <><Spinner className="size-3.5" />正在提取规则…</> : 'AI 提取候选规则'}
            </Button>
            <span className="text-xs tabular-nums text-ink-muted">{source.length} / {DICTIONARY_MAX_TEXT_LENGTH} 字</span>
          </div>
          {candidateColumns.length === 0 || candidateColumns.length > DICTIONARY_MAX_COLUMNS ? (
            <p className="text-xs text-warning-700">需要 1 到 {DICTIONARY_MAX_COLUMNS} 个非空且不重复的列名，才能提取规则。</p>
          ) : null}
        </form>

        {prepared?.length === 0 ? <Notice testId="dictionary-empty">没有识别出可供核对的规则。可以补充完整的字段名称和规则说明后再试。</Notice> : null}
        {prepared && prepared.length > 0 ? (
          <section aria-labelledby={`${formId}-preview`} className="space-y-3 border-t border-line pt-3">
            <div>
              <h3 id={`${formId}-preview`} className="text-sm font-medium text-ink">核对候选规则</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">对照原文检查字段与规则。默认不勾选任何候选，未匹配的字段可以手动选择对应列。</p>
            </div>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {prepared.map(({ id, candidate, error: invalid, column }) => {
                const draft = drafts[id];
                if (!draft) return null;
                const updateDraft = (next: Drafts[string]) => {
                  setDrafts((previous) => ({ ...previous, [id]: next }));
                  setOverwrite(null);
                  setError('');
                };
                return (
                  <li key={id} data-testid="dictionary-candidate" className="grid min-w-0 gap-3 p-3 md:grid-cols-[minmax(0,1fr)_14rem]">
                    <div className="min-w-0 space-y-1.5 [overflow-wrap:anywhere]">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={candidate.kind === 'missing-code' ? 'neutral' : 'brand'}>{KIND_LABEL[candidate.kind]}</Badge>
                        <p className="text-sm font-medium text-ink">{candidate.field}</p>
                        <span className="text-xs text-ink-muted">{describeCandidate(candidate)}</span>
                      </div>
                      <blockquote className="whitespace-pre-line border-l-2 border-line-strong pl-2 text-xs leading-relaxed text-ink-muted">
                        <span className="font-medium text-ink">字典原文：</span>{candidate.quote}
                      </blockquote>
                      {invalid ? <p className="text-xs text-warning-700">{invalid} 此条不能应用。</p>
                        : !column ? <p className="text-xs text-warning-700">未找到同名列，请核对后手动映射。</p>
                          : draft.column && draft.column !== column ? <p className="text-xs text-warning-700">你已更改映射，请确认两个字段含义一致。</p> : null}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 md:flex-col">
                      <label className="block min-w-0 text-xs text-ink-muted">
                        对应的数据列
                        <select value={draft.column} disabled={Boolean(invalid) || busy}
                          className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink max-md:min-h-11"
                          onChange={(event) => { updateDraft({ column: event.target.value, selected: false }); }}>
                          <option value="">请选择列</option>
                          {candidateColumns.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </label>
                      <label className="flex w-fit items-center gap-2 text-xs font-medium text-ink max-md:min-h-11">
                        <input type="checkbox" checked={draft.selected} disabled={Boolean(invalid) || !draft.column || busy}
                          className="accent-brand-700" onChange={(event) => updateDraft({ ...draft, selected: event.target.checked })} />
                        选中此规则
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
            {resolution && !resolution.ok ? <Notice tone="danger" testId="dictionary-conflict">{resolution.error} 请取消冲突的选项后再确认。</Notice> : null}
            {savedConflict ? <Notice tone="danger" testId="dictionary-saved-conflict">{savedConflict}</Notice> : null}
            {needsReplacement ? (
              <div className="space-y-2 rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-700">
                <p>所选候选将替换以下已有设置，请核对原设置后再确认：</p>
                <ul className="list-inside list-disc [overflow-wrap:anywhere]">
                  {replacementRules.map(({ column, previous }) => <li key={`rule:${column}`}>「{column}」当前检查规则：{previous}</li>)}
                  {replacementCodes.map(({ column, previous }) => <li key={`code:${column}`}>「{column}」当前占位码：{previous}</li>)}
                </ul>
                <label className="flex w-fit items-center gap-2 font-medium max-md:min-h-11">
                  <input type="checkbox" className="accent-brand-700" checked={replacementConfirmed} disabled={busy}
                    onChange={(event) => setOverwrite(event.target.checked ? { rules, codes, drafts } : null)} />
                  确认替换已有设置
                </label>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button size="sm" disabled={!canApply || busy || !resolution?.ok || Boolean(savedConflict) || (needsReplacement && !replacementConfirmed)}
                onClick={() => void apply()}>
                {applying ? <><Spinner className="size-3.5" />正在应用规则…</> : '确认并应用所选规则'}
              </Button>
              <span className="text-xs text-ink-muted">已选 {selections.length} 条；应用只更新检查设置和占位码记录。</span>
              {!canApply ? <span className="text-xs text-warning-700">请等当前数据检查完成后再应用。</span> : null}
            </div>
          </section>
        ) : null}

        {error ? <Notice tone="danger" testId="dictionary-error">{error}</Notice> : null}
        {success ? <Notice tone="success" testId="dictionary-success">{success}</Notice> : null}

        {savedCodes.length ? (
          <section aria-labelledby={`${formId}-codes`} className="space-y-2 border-t border-line pt-3">
            <h3 id={`${formId}-codes`} className="text-sm font-medium text-ink">已记录的缺失占位码</h3>
            <p className="text-xs text-ink-muted">这里只对比两种缺失口径。实际清洗仍需在审阅中单独确认。</p>
            <ul className="space-y-2">
              {savedCodes.map(({ column, code, quote }) => (
                <DictionaryCodePreview key={JSON.stringify([column, code])} dataset={dataset} column={column} code={code} quote={quote} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
