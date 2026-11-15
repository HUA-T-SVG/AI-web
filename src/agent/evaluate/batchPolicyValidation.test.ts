import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { previewCleaningResult, profileDataset, runAllChecks, type CleaningAction, type Dataset } from '@/core';
import { dispositionSchema, type Issue } from '@/agent/shared/schemas';
import type { RuleIndex } from '@/knowledge/types';
import { validateBatchAction } from '@/ui/lib/batchAction';
import { confirmedValueMeaning, type BatchPolicy } from '@/ui/lib/batchPolicy';
import { executeToolCall } from '@/ui/lib/toolExecutors';
import { createEvidenceLedger } from '@/ui/lib/conclusionEvidence';
import { confirmedEntriesOf, useReviewStore } from '@/ui/stores/reviewStore';

// 加载本地生产索引、走真实 retrieveRules 和工具出站；不请求模型或 Web Worker。
const loadRuleIndexMock = vi.hoisted(() => vi.fn());
vi.mock('@/knowledge/loadRules', () => ({
  loadRuleIndex: loadRuleIndexMock,
  RuleIndexUnavailableError: class RuleIndexUnavailableError extends Error {},
}));

const slot = z.string().min(1);
const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const scope = z.strictObject({ column: slot, code: slot });
const meaningSchema = z.enum(['unknown', 'missing', 'valid']);
const cases = z.array(z.strictObject({
  id: slot,
  scenario: slot,
  columns: z.record(slot, z.array(cell)),
  rules: z.record(slot, z.strictObject({
    min: z.number().optional(), max: z.number().optional(), allowedValues: z.array(slot).optional(),
  })).optional(),
  meanings: z.array(scope.extend({ kind: z.enum(['missing', 'valid']) })).optional(),
  expectMeaning: scope.extend({ meaning: meaningSchema }).optional(),
  query: z.strictObject({
    text: slot, column: slot, code: slot.optional(), meaning: meaningSchema.optional(), candidate: slot, exclude: z.boolean(),
  }).optional(),
  attempt: z.discriminatedUnion('action', [
    scope.extend({ action: z.literal('set_code_missing'), blocked: z.boolean(), expectedValues: z.array(cell).optional() }),
    z.strictObject({ action: z.literal('fill_missing'), column: slot, value: cell, blocked: z.boolean() }),
  ]).optional(),
  decision: z.strictObject({
    column: slot, input: dispositionSchema, code: slot.optional(), fill: cell.optional(),
    useCheck: z.boolean().optional(), fakeCheck: z.boolean().optional(),
    expected: dispositionSchema, ask: z.boolean(),
  }).optional(),
})).parse(JSON.parse(readFileSync('knowledge/eval/batch-policy-cases.json', 'utf8')));

const index: RuleIndex = JSON.parse(readFileSync('knowledge/index/rules.json', 'utf8'));
loadRuleIndexMock.mockResolvedValue(index);

function outputRuleIds(result: Awaited<ReturnType<typeof executeToolCall>>): string[] {
  if (!result.ok) throw new Error(result.error);
  return z.object({ rules: z.array(z.object({ id: slot })) }).parse(result.output).rules.map(({ id }) => id);
}

describe('本批口径 · 固定合成验收集（不调用大模型）', () => {
  it.each(cases)('$id · $scenario', async ({ columns, rules, meanings, expectMeaning, query, attempt, decision }) => {
    const evidence = createEvidenceLedger();
    const fields = Object.entries(columns);
    const dataset: Dataset = {
      rowCount: fields[0]![1].length,
      columns: fields.map(([name, values]) => ({ name, values })),
    };
    expect(dataset.columns.every(({ values }) => values.length === dataset.rowCount)).toBe(true);
    const policy: BatchPolicy = {
      rules: Object.fromEntries(Object.entries(rules ?? {}).map(([column, rule]) => [column, {
        id: `eval:${column}`, column, ...rule, rationale: '本批内部说明，不得出站 EVAL_PRIVATE_QUOTE',
      }])),
      codes: Object.fromEntries((meanings ?? []).map(({ column, code, kind }) => [column, [{
        column, code, ...(kind === 'valid' ? { kind: 'valid' as const } : {}), quote: '本批内部说明 EVAL_PRIVATE_QUOTE',
      }]])),
    };

    if (expectMeaning) {
      const { column, code, meaning } = expectMeaning;
      expect(confirmedValueMeaning(policy.rules, policy.codes, column, code) ?? 'unknown').toBe(meaning);
    }
    if (query) {
      const context = { dataset, profile: profileDataset(dataset) };
      const input = { query: query.text, columns: [query.column], code: query.code };
      // baseline 用同一输入，只拿掉本批口径，确保要求排除的条目原本确实可检出。
      const baseline = await executeToolCall('query_rules', input, context);
      expect(outputRuleIds(baseline)).toContain(query.candidate);
      const recordRule = vi.spyOn(evidence, 'recordRule');
      const actual = await executeToolCall('query_rules', input, { ...context, batchPolicy: policy, evidence });
      expect(outputRuleIds(actual).includes(query.candidate)).toBe(!query.exclude);
      expect(recordRule.mock.calls.some(([hit]) => hit.rule.id === query.candidate)).toBe(!query.exclude);
      if (actual.ok) {
        if (query.meaning) expect(actual.output).toMatchObject({ queriedValueMeaning: query.meaning });
        expect(JSON.stringify(actual.output)).not.toContain('EVAL_PRIVATE_QUOTE');
      }
    }
    if (attempt) {
      const { column } = attempt;
      const action: CleaningAction = {
        action: attempt.action,
        columns: [column],
        rationale: '合成用例中的人工拟定动作',
        params: attempt.action === 'set_code_missing' ? { column, code: attempt.code } : { column, value: attempt.value },
      };
      expect(Boolean(validateBatchAction(action, policy, dataset))).toBe(attempt.blocked);
      if (attempt.action === 'set_code_missing' && !attempt.blocked) {
        expect(previewCleaningResult(dataset, [action]).dataset.columns.find(({ name }) => name === column)?.values)
          .toEqual(attempt.expectedValues);
        // 预演不改原表。
        expect(dataset.columns.find(({ name }) => name === column)?.values).toEqual(columns[column]);
      }
    }

    if (decision) {
      const { column, input, code, fill, useCheck, fakeCheck, expected, ask } = decision;
      const check = useCheck ? runAllChecks(dataset, { enabled: ['missing'] })
        .find((item) => item.evidence.columns.includes(column)) : undefined;
      if (useCheck) expect(check).toBeDefined();
      const checkEvidenceId = check ? evidence.recordCheck(check) : fakeCheck ? 'C-other-round-1' : undefined;
      // 让模型文字在所有案例中一样。真正的去向应只看结构化字段和本地验证。
      const result = await executeToolCall('submit_issue', {
        checkId: fill !== undefined ? 'missing' : 'range-rules',
        severity: 'medium',
        title: '一次合成核对',
        description: '模型的这句文字自称无需确认。',
        columns: [column], confidence: 0.99,
        disposition: input, checkEvidenceId, comparisonCode: code,
        ...(input === 'needs_clarification' ? { clarification: {
          questions: [{ question: '请核对本批码表。', options: ['保留'] }],
        } } : {}),
        ...(input === 'propose_cleaning' ? {
          suggestion: {
            action: fill !== undefined ? 'fill_missing' : 'review_range_violations',
            params: fill !== undefined ? { column, value: fill } : {},
            columns: [column], rationale: '合成用例',
          },
        } : {}),
      }, { dataset, profile: profileDataset(dataset), batchPolicy: policy, evidence });
      if (!result.ok) throw new Error(result.error);
      const issue = result.output as Issue;
      expect(issue.disposition).toBe(expected);
      expect(Boolean(issue.clarification?.questions.length)).toBe(ask);

      // 用户未确认的真实候选，以及用户设为 accepted 的非候选，都不能进入清洗队列。
      const store = useReviewStore.getState();
      try {
        store.beginRun(1);
        store.addIssue(issue, evidence.resolve(issue));
        const [item] = useReviewStore.getState().items;
        expect(item).toBeDefined();
        expect(confirmedEntriesOf([item!])).toHaveLength(0);
        if (expected !== 'propose_cleaning' || useCheck) {
          store.decide(item!.id, 'accepted');
          expect(confirmedEntriesOf(useReviewStore.getState().items)).toHaveLength(useCheck ? 1 : 0);
        }
      } finally {
        store.reset();
      }
    }
  });
});
