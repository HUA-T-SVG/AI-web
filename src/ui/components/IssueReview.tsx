'use client';

import { useMemo, useState } from 'react';
import type { Dataset, Severity } from '@/core';
import { actionDisplayName, previewCleaningImpact } from '@/core';
import { CleaningComparisonPanel } from './CleaningComparisonPanel';
import { ConclusionEvidencePanel } from './ConclusionEvidencePanel';
import {
  MAX_ISSUES,
  canReviewCleaning,
  canReviewComparison,
  confirmedEntriesOf,
  isVerifiableItem,
  reviewHeldByClarification,
  reviewPolicyIsCurrent,
  useReviewStore,
  type ReviewDecision,
  type ReviewItem,
} from '@/ui/stores/reviewStore';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Notice } from '@/ui/components/base/Notice';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { useRangeRuleStore } from '@/ui/stores/rangeRuleStore';
import {
  draftOf,
  isEditableAction,
  parseDraft,
  validateReviewAction,
  type ActionParamDraft,
} from '@/ui/lib/actionParams';
import { cn } from '@/ui/lib/cn';
import { REVIEW_STATUS_LABEL } from '@/ui/lib/reviewStatus';
import { missingCodePolicyError, validateBatchAction, validateBatchActions } from '@/ui/lib/batchAction';

/**
 * 严重度用「文字 + 颜色」双重表达。
 *
 * 只靠颜色的话，色觉障碍的读者拿不到这个信息 —— 而严重度直接决定他去不去看。
 */
const SEVERITY: Record<Severity, { label: string; tone: 'high' | 'medium' | 'low' }> = {
  high: { label: '严重', tone: 'high' },
  medium: { label: '中等', tone: 'medium' },
  low: { label: '轻微', tone: 'low' },
};

const DECISION_LABEL: Record<ReviewDecision, string> = {
  pending: '待确认',
  accepted: '已接受',
  modified: '已修改',
  rejected: '已拒绝',
};

const ACTION_LABEL: Record<string, string> = {
  merge_categories: '类别归并',
  trim_whitespace: '去除首尾空白',
  fill_missing: '填补缺失',
  remove_duplicates: '去重',
};

/** 只有会改数据的动作才显示参数编辑器；其余建议只允许写备注 */
function ParamFields({
  item,
  draft,
  onChange,
  error,
}: {
  item: ReviewItem;
  draft: ActionParamDraft;
  onChange: (next: ActionParamDraft) => void;
  error: string | null;
}) {
  const suggestion = item.issue.suggestion;
  const column = typeof suggestion.params.column === 'string' ? suggestion.params.column : '';
  const fieldClass =
    'mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand-400 max-md:min-h-11';

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-canvas p-2.5">
      <p className="text-xs leading-relaxed text-ink-muted">
        这条建议会改数据。下面是可编辑参数，确认后按新参数执行，并写进处理留痕。
      </p>

      {suggestion.action === 'merge_categories' ? (
        <>
          <p className="text-xs text-ink">
            目标列：<span className="font-medium">{column}</span>
          </p>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-groups`}>
            类别分组（一行一组，组内用逗号/顿号分隔）
          </label>
          <textarea
            id={`${item.id}-groups`}
            rows={3}
            value={draft.groups}
            onChange={(event) => onChange({ ...draft, groups: event.target.value })}
            className={fieldClass}
            placeholder={'例如：\n硕士、研究生\n本科、本科在读'}
          />
        </>
      ) : null}

      {suggestion.action === 'trim_whitespace' ? (
        <>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-columns`}>
            要处理的列（逗号或顿号分隔）
          </label>
          <input
            id={`${item.id}-columns`}
            value={draft.columns}
            onChange={(event) => onChange({ ...draft, columns: event.target.value })}
            className={fieldClass}
          />
        </>
      ) : null}

      {suggestion.action === 'fill_missing' ? (
        <>
          <p className="text-xs text-ink">
            目标列：<span className="font-medium">{column}</span>
          </p>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-value`}>
            填入值（数字按数值处理，其余按文本）
          </label>
          <input
            id={`${item.id}-value`}
            value={draft.value}
            onChange={(event) => onChange({ ...draft, value: event.target.value })}
            className={fieldClass}
          />
        </>
      ) : null}

      {suggestion.action === 'remove_duplicates' ? (
        <>
          <label className="block text-xs text-ink" htmlFor={`${item.id}-columns`}>
            按哪些列判重（留空表示按整行）
          </label>
          <input
            id={`${item.id}-columns`}
            value={draft.columns}
            onChange={(event) => onChange({ ...draft, columns: event.target.value })}
            className={fieldClass}
          />
        </>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-xs text-danger-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IssueCard({ item, dataset, dataVersion, runVersion, historical, ruleChanged, canCompare, readOnly, held }: {
  item: ReviewItem;
  dataset: Dataset | null;
  dataVersion: number;
  runVersion: number | null;
  historical: boolean;
  ruleChanged: boolean;
  canCompare: boolean;
  readOnly: boolean;
  held: boolean;
}) {
  const decide = useReviewStore((state) => state.decide);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<ActionParamDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const severity = SEVERITY[item.issue.severity];
  const canReview = canReviewCleaning(item) && !held;
  const runCodes = useReviewStore((state) => state.runDictionaryCodes);
  const comparisonOnly = !canReview && !held && canReviewComparison(item, runCodes);
  const informOnly = item.issue.disposition === 'inform_only';
  const decided = item.decision !== 'pending';
  const editable = isEditableAction(item.issue.suggestion.action);
  const check = item.evidence?.check;
  const suggestion = item.override ?? item.issue.suggestion;
  const rules = useRangeRuleStore((state) => state.rules);
  const codes = useRangeRuleStore((state) => state.dictionaryCodes);
  const policy = { rules, codes };
  const policyError = canReview && dataset && !historical && !ruleChanged ? validateBatchAction(suggestion, policy, dataset) : null;
  const actionScope = canReview && dataset && !historical
    ? validateReviewAction(suggestion, item.issue.columns, dataset) : null;
  const column = item.issue.columns.length === 1 ? item.issue.columns[0] : undefined;
  const dictionaryCode = column === undefined ? undefined : codes[column]?.find((entry) => entry.kind !== 'valid')?.code;
  const checkCode = (code: string) => {
    if (column === undefined) return null;
    const conflict = missingCodePolicyError(policy, column, code);
    if (conflict) return conflict;
    return item.issue.disposition === 'propose_cleaning' && code !== dictionaryCode
      ? '该编码的缺失含义尚未确认。请先核对本批数据字典。' : null;
  };
  const aiCode = item.issue.comparisonCode;
  const comparisonCode = dictionaryCode ?? (aiCode && !checkCode(aiCode) ? aiCode : undefined);
  const compare = (canReview || comparisonOnly) && canCompare && !decided && !modifyOpen && !rejectOpen && column !== undefined &&
    (item.issue.disposition === 'propose_cleaning' ? dictionaryCode !== undefined : Boolean(comparisonCode) ||
      ['missing', 'outliers', 'range-rules', 'type-consistency'].includes(item.issue.checkId));

  const startModify = () => {
    if (modifyOpen) {
      if (!editable) {
        decide(item.id, 'modified', note || undefined);
        setModifyOpen(false);
        return;
      }
      if (dataset === null) {
        setError('数据不在内存里（刷新过页面？）。重新导入后再改参数。');
        return;
      }
      const parsed = parseDraft(
        item.issue.suggestion,
        draft ?? draftOf(item.issue.suggestion),
        dataset,
      );
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const validated = validateReviewAction(parsed.action, item.issue.columns, dataset);
      if (!validated.ok) {
        setError(validated.error);
        return;
      }
      const { rules: currentRules, dictionaryCodes } = useRangeRuleStore.getState();
      const blocked = validateBatchAction(parsed.action, { rules: currentRules, codes: dictionaryCodes }, dataset);
      if (blocked) { setError(blocked); return; }
      decide(item.id, 'modified', note || undefined, parsed.action);
      setError(null);
      setModifyOpen(false);
      return;
    }

    setRejectOpen(false);
    setError(null);
    setDraft(editable ? draftOf(item.issue.suggestion) : null);
    setModifyOpen(true);
  };

  const startReject = () => {
    if (rejectOpen) {
      decide(item.id, 'rejected', note || undefined);
      setRejectOpen(false);
      return;
    }
    setModifyOpen(false);
    setError(null);
    setRejectOpen(true);
  };

  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={severity.tone}>{severity.label}</Badge>
        <p className="min-w-0 flex-1 text-sm font-medium text-ink">
          {check ? <>本地检查：{check.title}</> : <>待核对：<span>{item.issue.title}</span></>}
        </p>
        {comparisonOnly && !decided ? <Badge tone="neutral">已确认缺失码</Badge> : null}
        {!canReview && !comparisonOnly ? <Badge tone={informOnly ? 'neutral' : 'medium'}>
          {informOnly ? '仅展示' : '待核对'}
        </Badge> : decided ? <Badge tone="neutral">{DECISION_LABEL[item.decision]}</Badge> : null}
        {item.execution ? <Badge tone={item.execution.status === 'skipped' ? 'medium' : 'neutral'}>
          {REVIEW_STATUS_LABEL[item.execution.status]} · v{item.execution.version}
        </Badge> : null}
        {item.verified ? <Badge tone="success">已人工核对</Badge> : null}
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        AI 解释（文字与数字待核对）：{check ? <><span>{item.issue.title}</span>。 </> : null}{item.issue.description}
      </p>
      {item.execution?.status === 'skipped' ? <p className="mt-1 text-xs text-warning-700">{item.execution.reason}</p> : null}

      {/* 只给列名与行数，不复述整行原始数据：用户在自己的浏览器里看得到，
          我们没必要再抄一遍，抄了反而多一处泄露面 */}
      <p className="mt-1 text-xs text-ink-muted">
        涉及列：{item.issue.columns.length > 0 ? item.issue.columns.join('、') : '全表'}
      </p>

      {canReview ? <p className="mt-2 rounded-lg bg-canvas px-2.5 py-1.5 text-xs leading-relaxed text-ink">
        建议：{item.issue.suggestion.rationale}
      </p> : <p className="mt-2 rounded-lg bg-canvas px-2.5 py-1.5 text-xs leading-relaxed text-ink" data-testid="review-disposition">
        {comparisonOnly
          ? '本批字典只支持对该缺失码试算。选定试算口径并填写理由后，才可以执行。'
          : informOnly
          ? '仅展示结果，不加入清洗队列。'
          : held && canReviewCleaning(item) ? '相关字段仍待核对，本轮不能执行这条建议。请核对口径后重新分析。'
            : '口径或依据还需核对，这条不会加入清洗队列。'}
      </p>}
      {actionScope?.ok && actionScope.scope ? <p className="mt-1 text-xs text-ink" data-testid="cleaning-scope">
        实际动作：{actionDisplayName(suggestion.action)} · {actionScope.scope}
      </p> : null}
      {actionScope && !actionScope.ok ? <p className="mt-1 text-xs text-warning-700">{actionScope.error}</p> : null}
      {policyError ? <p className="mt-1 text-xs text-warning-700" role="alert">{policyError}</p> : null}
      <ConclusionEvidencePanel
        evidence={item.evidence ?? { rules: [], invalidCheck: false, invalidRules: 0 }}
        dataset={dataset} version={runVersion} historical={historical} ruleChanged={ruleChanged}
      />
      {compare && dataset && column !== undefined ? (
        <CleaningComparisonPanel key={comparisonCode ?? ''} dataset={dataset} column={column} suggestedCode={comparisonCode}
          suggestedCodeSource={dictionaryCode ? 'dictionary' : 'ai'}
          dataVersion={dataVersion} checkCode={checkCode} onChoose={(action) => {
            const review = useReviewStore.getState();
            const { rules: currentRules, dictionaryCodes } = useRangeRuleStore.getState();
            if (useDatasetStore.getState().dataVersion !== dataVersion ||
                useProvenanceStore.getState().current !== dataset ||
                !reviewPolicyIsCurrent(review) ||
                validateBatchAction(action, { rules: currentRules, codes: dictionaryCodes }, dataset)) return false;
            return review.chooseComparison(item.id, action);
          }} />
      ) : null}

      {canReview && !readOnly && !decided && modifyOpen && editable ? (
        <ParamFields
          item={item}
          draft={draft ?? draftOf(item.issue.suggestion)}
          onChange={setDraft}
          error={error}
        />
      ) : null}

      {canReview && !readOnly && !decided && modifyOpen && !editable ? (
        <p className="mt-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs leading-relaxed text-ink-muted">
          这条建议是「请人工判断」，执行器不会改数据（{actionDisplayName(item.issue.suggestion.action)}
          ）。确认后只记录理由。
        </p>
      ) : null}

      {canReview && !readOnly && !decided && (modifyOpen || rejectOpen) ? (
        <div className="mt-2">
          <label className="text-xs text-ink-muted" htmlFor={`note-${item.id}`}>
            {rejectOpen ? '填写拒绝理由，会记入处理日志' : '填写理由，会记入处理日志'}
          </label>
          <input
            id={`note-${item.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs text-ink focus:border-brand-400 max-md:min-h-11"
          />
        </div>
      ) : null}

      {(canReview || comparisonOnly) && (decided ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span>
            你的决定：
            {item.decision === 'accepted' ? (
              '接受'
            ) : item.decision === 'modified' ? (
              item.override !== undefined ? (
                <>
                  修改后执行：{ACTION_LABEL[item.override.action] ?? actionDisplayName(item.override.action)}
                  <code className="ml-1 break-all text-[11px]">
                    {JSON.stringify(item.override.params)}
                  </code>
                </>
              ) : (
                '已备注（这条建议不改数据）'
              )
            ) : (
              '拒绝'
            )}
            {item.note ? ` · ${item.note}` : ''}
          </span>
          {!readOnly ? <button
            type="button"
            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 max-md:min-h-11"
            onClick={() => {
              decide(item.id, 'pending');
              setModifyOpen(false);
              setRejectOpen(false);
              setNote('');
              setError(null);
            }}
          >
            撤销
          </button> : null}
        </p>
      ) : !readOnly && canReview ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={actionScope?.ok === false || Boolean(policyError)} onClick={() => decide(item.id, 'accepted')}>
            接受
          </Button>
          <Button size="sm" variant="secondary" onClick={startModify}>
            {modifyOpen ? '确认修改' : '修改'}
          </Button>
          <Button size="sm" variant="secondary" onClick={startReject}>
            {rejectOpen ? '确认拒绝' : '拒绝'}
          </Button>
        </div>
      ) : null)}
    </li>
  );
}

/**
 * 人工核对里的一行：只记录「人看过这条待核对结论」，不改变数据与口径。
 * 备注会随报告与留痕导出，便于答辩时说明「哪些是我们人工判断过的」。
 */
function ManualVerifyRow({ item, disabled }: { item: ReviewItem; disabled: boolean }) {
  const markVerified = useReviewStore((state) => state.markVerified);
  const unmarkVerified = useReviewStore((state) => state.unmarkVerified);
  const [note, setNote] = useState(item.verified?.note ?? '');
  const title = item.evidence?.check?.title ?? `待核对：${item.issue.title}`;
  return (
    <li className="rounded-lg border border-line bg-surface p-3" data-testid="manual-verify-item">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-ink [overflow-wrap:anywhere]">{title}</p>
        {item.verified ? <Badge tone="success">已核对</Badge> : <Badge tone="medium">待核对</Badge>}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        涉及列：{item.issue.columns.length > 0 ? item.issue.columns.join('、') : '全表'}
        {' · '}
        {item.evidence?.check ? '有本地检查依据' : '无本地引用，需要人工判断'}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        AI 解释（文字与数字待核对）：{item.issue.description}
      </p>
      {item.verified ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xs text-success-700">
            已于 {item.verified.at.slice(0, 10)} 人工核对
            {item.verified.note ? `：${item.verified.note}` : '（未填备注）'}
          </p>
          {!disabled ? (
            <Button size="sm" variant="ghost" onClick={() => unmarkVerified(item.id)}>
              撤销核对
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block text-xs text-ink-muted">
            核对备注（可选，会写入报告）
            <textarea
              value={note}
              maxLength={200}
              rows={2}
              disabled={disabled}
              className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-ink"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <Button size="sm" disabled={disabled} onClick={() => markVerified(item.id, note)}>
            标记为已核对
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * 问题审阅与人工确认。
 *
 * 这是安全设计的核心：AI 提出建议，但是否执行由人逐条决定。
 * 界面上不存在任何「自动全部接受」的路径 —— 那正是最容易被顺手加进来、
 * 也最容易让「人在环路」变成一句空话的东西。
 */
export function IssueReview({ analysisPending = false }: { analysisPending?: boolean }) {
  // selector 只取 items（引用稳定），派生计算放在组件里做。
  // 把 confirmedActionsOf 写进 selector 会每次返回新数组，
  // zustand 判定「变了」→ 无限重渲染 → 整页白屏。这个坑真踩过。
  const items = useReviewStore((state) => state.items);
  const clarificationHolds = useReviewStore((state) => state.clarificationHolds);
  const droppedCount = useReviewStore((state) => state.droppedCount);
  const dataVersion = useDatasetStore((state) => state.dataVersion);
  const cleaningBase = useProvenanceStore((state) => state.current);
  const runVersion = useReviewStore((state) => state.runVersion);
  const runRuleMap = useReviewStore((state) => state.runRuleMap);
  const currentRuleMap = useRangeRuleStore((state) => state.rules);
  const runCodes = useReviewStore((state) => state.runDictionaryCodes);
  const currentCodes = useRangeRuleStore((state) => state.dictionaryCodes);
  const executedVersion = useReviewStore((state) => state.executedVersion);
  // 表头重名时，所有「按列名定位」的清洗都不安全 —— 执行入口必须禁用，
  // 不能只在执行器里兜底（按钮可点却什么都没做，用户会以为程序坏了）
  const profile = useDatasetStore((state) => state.profile);
  const duplicateColumns = profile?.duplicateColumnNames ?? [];
  const hasDuplicateColumns = duplicateColumns.length > 0;
  const historical = runVersion !== null && runVersion !== dataVersion;
  const ruleChanged = (runRuleMap !== null && runRuleMap !== currentRuleMap) ||
    (runCodes !== null && runCodes !== currentCodes);
  const isStale = historical || ruleChanged;
  const isExecuted = executedVersion !== null;
  const canPreview = !isStale && !isExecuted && !hasDuplicateColumns;
  // 确认/改参数只改 items；用 items 做依赖，试算就不必跟着筛选与输入框重跑
  const entries = useMemo(() => confirmedEntriesOf(items, clarificationHolds, runCodes).map(({ item, action }) =>
    ({ item, action: { ...action } })), [items, clarificationHolds, runCodes]);
  const confirmed = useMemo(() => entries.map(({ action }) => action), [entries]);
  const invalidAction = useMemo(() => cleaningBase && canPreview &&
    (entries.some(({ item, action }) => !validateReviewAction(action, item.issue.columns, cleaningBase).ok) ||
      Boolean(validateBatchActions(entries.map(({ action }) => action), { rules: currentRuleMap, codes: currentCodes }, cleaningBase))),
  [entries, cleaningBase, canPreview, currentRuleMap, currentCodes]);
  const conflict = confirmed.find(({ comparison }) => comparison?.choice === 'as-missing' &&
    confirmed.some((other) => other.action === 'fill_missing' && other.params.column === comparison.column));
  const preview = useMemo(
    () =>
      canPreview && !conflict && !invalidAction && cleaningBase !== null && confirmed.length > 0
        ? previewCleaningImpact(cleaningBase, confirmed)
        : null,
    [canPreview, cleaningBase, confirmed, conflict, invalidAction],
  );
  const [lastAttempt, setLastAttempt] = useState<{
    items: ReviewItem[];
    result: ReturnType<ReturnType<typeof useProvenanceStore.getState>['apply']>;
  } | null>(null);
  const outcome = lastAttempt?.items === items ? lastAttempt.result : null;
  const [status, setStatus] = useState<'all' | 'info' | 'verify' | 'verified' | ReviewDecision>('all');
  const [field, setField] = useState('all');
  const [verifyMode, setVerifyMode] = useState(false);
  const heldIds = useMemo(() => new Set(items.filter((item) =>
    reviewHeldByClarification(item, items, clarificationHolds)).map(({ id }) => id)), [items, clarificationHolds]);

  const fields = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      for (const column of item.issue.columns) names.add(column);
    }
    return [...names];
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const itemStatus = item.verified ? 'verified'
          : (canReviewCleaning(item) || canReviewComparison(item, runCodes)) && !heldIds.has(item.id)
            ? item.decision : item.issue.disposition === 'inform_only' ? 'info' : 'verify';
        if (status !== 'all' && itemStatus !== status) return false;
        if (field === 'all') return true;
        return item.issue.columns.includes(field);
      }),
    [items, status, field, heldIds, runCodes],
  );

  if (items.length === 0) return null;

  const cleaningItems = items.filter((item) => canReviewCleaning(item) && !heldIds.has(item.id));
  const pending = cleaningItems.filter((item) => item.decision === 'pending').length;
  const handled = cleaningItems.length - pending;
  const optionalComparisons = items.filter((item) => !canReviewCleaning(item) &&
    !heldIds.has(item.id) && canReviewComparison(item, runCodes)).length;
  const infoCount = items.filter((item) => item.issue.disposition === 'inform_only').length;
  const verifiableItems = items.filter((item) => isVerifiableItem(item, items, clarificationHolds, runCodes));
  const verifyCount = verifiableItems.filter((item) => !item.verified).length;
  const verifiedCount = verifiableItems.filter((item) => item.verified).length;

  const cannotExecute =
    isExecuted ||
    isStale ||
    analysisPending ||
    Boolean(conflict) ||
    Boolean(invalidAction) ||
    hasDuplicateColumns ||
    pending > 0 ||
    confirmed.length === 0 ||
    cleaningBase === null;

  const hint = isExecuted
    ? '这批建议的尝试已结束。需要继续处理失败项时，请按当前数据重新分析。'
    : isStale
      ? '数据或本批口径已变更，请重新分析。'
      : cleaningBase === null
        ? '数据不在内存里（刷新过页面？），先重新导入。'
        : pending > 0
          ? '还有未确认的条目，先逐条处理完。'
          : confirmed.length === 0
            ? '没有已确认的条目，清洗会改不动数据。'
            : '只对已确认的条目生效；原始数据不会被改动，可以随时撤销。';

  return (
    <Card className="mt-4" data-testid="issue-review">
      <CardHeader>
        <div>
          <CardTitle>发现的问题</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            {pending > 0
              ? `还有 ${pending} 条未确认，确认之前不会对数据做任何改动`
              : cleaningItems.length === 0 && confirmed.length === 0
                ? '当前没有可以确认执行的清洗建议。'
              : confirmed.length >= cleaningItems.length
                ? `已确认 ${confirmed.length} 条`
                : // 说「已确认 N 条」会把拒绝掉的那些从用户视野里抹掉：
                  // 他明明处理了 3 条，界面却说「已确认 1 条」
                  `已处理 ${cleaningItems.length} 条，其中 ${confirmed.length} 条将执行`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="neutral">待确认 {pending}</Badge>
          <Badge tone={handled > 0 ? 'success' : 'neutral'}>已处理 {handled}</Badge>
          {infoCount > 0 ? <Badge tone="neutral">仅展示 {infoCount}</Badge> : null}
          {verifyCount > 0 ? <Badge tone="medium">待核对 {verifyCount}</Badge> : null}
          {verifiedCount > 0 ? <Badge tone="success">已核对 {verifiedCount}</Badge> : null}
          {verifiableItems.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              data-testid="manual-verify-toggle"
              onClick={() => setVerifyMode((open) => !open)}
            >
              {verifyMode ? '收起人工核对' : '人工核对'}
            </Button>
          ) : null}
          {optionalComparisons > 0 ? <Badge tone="neutral">缺失口径可试算 {optionalComparisons}</Badge> : null}
        </div>
      </CardHeader>
      <CardBody>
        {/* 截断要如实说：不说的话，用户以为模型只报了这些 */}
        {droppedCount > 0 ? (
          <p className="mb-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-700">
            模型还报了 {droppedCount} 条，为避免一次要确认太多，只保留了前 {MAX_ISSUES} 条。
          </p>
        ) : null}

        {/* 人工核对：只记录「人看过」，不改数据、不解除字段的清洗限制 */}
        {verifyMode ? (
          <section
            className="mb-3 rounded-lg border border-line bg-canvas p-3"
            data-testid="manual-verify-panel"
            aria-label="人工核对"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                人工核对（待核对 {verifyCount} 条 · 已核对 {verifiedCount} 条）
              </p>
              <span className="text-xs text-ink-muted">只记录核对结论，不改数据</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              逐条看过结论后点「标记为已核对」，可留备注。核对不会解除该字段本轮的清洗限制；
              要清洗仍需更新本批口径并重新分析。已核对条目会进报告与留痕。
            </p>
            {verifiableItems.length === 0 ? (
              <p className="mt-2 text-xs text-ink-muted">当前没有需要人工核对的条目。</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {verifiableItems.map((item) => (
                  <ManualVerifyRow key={item.id} item={item} disabled={isStale || isExecuted} />
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            状态
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink max-md:h-11"
            >
              <option value="all">全部状态</option>
              <option value="pending">待确认</option>
              <option value="accepted">已接受</option>
              <option value="modified">已修改</option>
              <option value="rejected">已拒绝</option>
              {infoCount > 0 ? <option value="info">仅展示</option> : null}
              {verifyCount > 0 ? <option value="verify">待核对</option> : null}
              {verifiedCount > 0 ? <option value="verified">已核对</option> : null}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            字段
            <select
              value={field}
              onChange={(event) => setField(event.target.value)}
              className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink max-md:h-11"
            >
              <option value="all">全部字段</option>
              {fields.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {status !== 'all' || field !== 'all' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus('all');
                setField('all');
              }}
            >
              清除筛选
            </Button>
          ) : null}
          <span className="ml-auto text-xs text-ink-muted">
            显示 {filtered.length} / {items.length} 条
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="没有符合筛选条件的条目" description="换一个状态或字段试试。" />
        ) : (
          <ul className="space-y-2">
            {filtered.map((item) => (
              <IssueCard key={item.id} item={item} dataset={cleaningBase} dataVersion={dataVersion}
                runVersion={runVersion} historical={historical} ruleChanged={ruleChanged}
                canCompare={canPreview && !analysisPending} readOnly={isStale || isExecuted} held={heldIds.has(item.id)} />
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-line pt-3">
          {invalidAction ? <Notice tone="warning" className="mb-3">有动作超出本条问题范围或参数有误，请撤销该决定并重新确认。</Notice> : null}
          {conflict ? (
            <Notice tone="warning" className="mb-3">「{conflict.comparison?.column}」同时选择了转为缺失和填充缺失值。请撤销其中一项后再执行。</Notice>
          ) : null}
          {hasDuplicateColumns && !isExecuted ? (
            <Notice tone="warning" testId="review-duplicate-columns" className="mb-3">
              表头里有重名列（{duplicateColumns.join('、')}）：按列名执行清洗只会命中第一列，
              可能改错单元格或把不同记录误删。已禁用「执行清洗」—— 请先把表头改成唯一列名，
              重新导入并分析后再处理。
            </Notice>
          ) : null}

          {isStale && !isExecuted ? (
            <Notice tone="warning" testId="review-stale-version" className="mb-3">
              {ruleChanged ? '本批口径已变更，这批建议已失效。请重新分析后再执行。'
                : `这批建议属于旧版本 v${runVersion}，当前数据是 v${dataVersion}，已失效。请重新分析后再执行。`}
            </Notice>
          ) : null}

          {/* 手机上操作区固定到底部：审阅列表一长，执行入口就滚出屏幕，
              而「确认」这件事不该藏在滚动里。md 起回到文档流，桌面版式不变 */}
          <div
            className={cn(
              'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-4 py-3',
              'shadow-[0_-2px_12px_rgba(22,33,31,0.08)]',
              'md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none',
            )}
            data-testid="cleaning-actions"
          >
            {preview !== null ? (
              <p className="mb-2 text-xs text-ink-muted" data-testid="cleaning-preview">
                执行前预览：改动 {preview.changedCells} 个单元格、删除 {preview.deletedRows} 行；
                {preview.skippedActions} 条动作无法执行。
                <span className="ml-1">只是试算，点执行之前不会改动任何数据。</span>
              </p>
            ) : null}
            {preview && preview.samples.length > 0 ? <details className="mb-2 text-xs text-ink-muted">
              <summary className="cursor-pointer">查看最多 3 格的修改示例</summary>
              <ul className="max-h-20 overflow-auto">
                {preview.samples.map((sample, index) => <li key={index} className="[overflow-wrap:anywhere]">
                  「{sample.column}」执行时第 {sample.row + 1} 行：{sample.before === null ? '（缺失）' : JSON.stringify(sample.before)}
                  {' → '}{sample.after === null ? '（缺失）' : JSON.stringify(sample.after)}
                </li>)}
              </ul>
            </details> : null}

            <div className="flex flex-wrap items-center gap-2">
              {/* 解禁条件写死在 disabled 上，而不是靠 onClick 里的判断：
                  按钮可点却什么都不做，用户会以为程序坏了；
                  更糟的是会以为数据已经被清洗过 */}
              <Button
                size="md"
                className="w-full md:w-auto"
                disabled={cannotExecute}
                onClick={() => {
                  const review = useReviewStore.getState();
                  const { rules, dictionaryCodes } = useRangeRuleStore.getState();
                  if (cannotExecute || review.items !== items || review.clarificationHolds !== clarificationHolds ||
                      review.executedVersion !== null ||
                      useDatasetStore.getState().dataVersion !== dataVersion ||
                      !reviewPolicyIsCurrent(review) || !cleaningBase ||
                      validateBatchActions(confirmed, { rules, codes: dictionaryCodes }, cleaningBase) ||
                      useProvenanceStore.getState().current !== cleaningBase) return;
                  const result = useProvenanceStore.getState().apply(confirmed);
                  const current = useProvenanceStore.getState().current;
                  const version = current !== null && current !== cleaningBase
                    ? useDatasetStore.getState().syncWorkingDataset(current) : dataVersion;
                  const outcomes = new Map(entries.flatMap(({ item, action }) => {
                    const execution = result.actions.get(action);
                    return execution ? [[item.id, execution] as const] : [];
                  }));
                  useReviewStore.getState().recordExecution(version, outcomes, result.applied > 0);
                  setLastAttempt({ items: useReviewStore.getState().items, result });
                }}
              >
                执行清洗（{confirmed.length} 条）
              </Button>
              {isExecuted ? <Badge tone="neutral">处理记录 v{executedVersion}</Badge> : null}
            </div>

            {outcome && (
              <p
                className={cn(
                  'mt-1.5 rounded-lg px-3 py-2 text-xs',
                  outcome.skipped > 0
                    ? 'bg-warning-50 text-warning-700'
                    : 'bg-success-50 text-success-700',
                )}
                data-testid="cleaning-outcome"
              >
                已应用 {outcome.applied} 条动作、改动 {outcome.changedCells} 个单元格
                {outcome.deletedRows > 0 ? `、删除 ${outcome.deletedRows} 行` : ''}
                {outcome.skipped > 0 ? `；${outcome.skipped} 条未能执行，原因见对应条目` : ''}。
              </p>
            )}
            <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
          </div>

          {/* 固定条脱离文档流，用等高空位把卡片底部垫起来，否则最后几条会被挡住 */}
          <div aria-hidden="true" className="h-40 md:hidden" />
        </div>
      </CardBody>
    </Card>
  );
}
