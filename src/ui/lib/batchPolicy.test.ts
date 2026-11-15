import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RuleIndex, RuleRecord } from '@/knowledge/types';
import { confirmedValueMeaning, ruleRelationship, summarizeBatchPolicy, type BatchPolicy } from './batchPolicy';

const index: RuleIndex = JSON.parse(readFileSync('knowledge/index/rules.json', 'utf8'));
const findRule = (id: string): RuleRecord => {
  const rule = index.entries.find((entry) => entry.id === id);
  if (!rule) throw new Error(`评测用规则不存在：${id}`);
  return rule;
};
const sentinel = findRule('general-missing-sentinel');
const negative = findRule('general-missing-negative-code');
const literal = findRule('general-missing-literal');
const rounding = findRule('ds-grade-curve-rounding');

const policy: BatchPolicy = {
  rules: {
    成绩: { id: 'grade', column: '成绩', min: 0, max: 1000, rationale: 'SENSITIVE RANGE NOTE' },
    期末成绩: { id: 'final', column: '期末成绩', min: 0, max: 1000 },
    状态: { id: 'status', column: '状态', allowedValues: ['SENSITIVE VALID VALUE', '无', '009'] },
  },
  codes: {
    成绩: [{ column: '成绩', code: '999', kind: 'valid', quote: 'SENSITIVE VALID QUOTE' }],
    模拟成绩: [{ column: '模拟成绩', code: '0999', quote: 'SENSITIVE MISSING QUOTE' }],
    温差: [{ column: '温差', code: '-9', kind: 'valid', quote: 'SENSITIVE NEGATIVE QUOTE' }],
  },
};

describe('本批已确认口径', () => {
  it('分别处理明示实义和明示缺失；范围内的 999 仍未确定缺失语义', () => {
    const meaning = (column: string, value: string | number) => confirmedValueMeaning(policy.rules, policy.codes, column, value);
    expect(meaning('成绩', 999)).toBe('valid');
    expect(meaning('期末成绩', 999)).toBeUndefined();
    expect(meaning('模拟成绩', '0999')).toBe('missing');
    expect(meaning('模拟成绩', 999)).toBeUndefined();
    expect(meaning('状态', ' 无 ')).toBe('valid');
    expect(meaning('状态', 9)).toBeUndefined();
    expect(meaning('英文别名', 999)).toBeUndefined();
  });

  it('异常旧配置同时明示了有效和缺失时，留待核对', () => {
    expect(confirmedValueMeaning(
      { 成绩: { id: 'x', column: '成绩', allowedValues: ['999'] } },
      { 成绩: [{ column: '成绩', code: '999', quote: '缺失定义' }] },
      '成绩', 999,
    )).toBeUndefined();
  });

  it('本批仅排除同一字段、同一编码的启发式参考，其它字段或议题继续检索', () => {
    expect(ruleRelationship(sentinel, ['成绩'], policy)).toBe('reference');
    expect(ruleRelationship(sentinel, ['成绩'], policy, '999')).toBe('conflict');
    expect(ruleRelationship(sentinel, ['成绩'], policy, '99')).toBe('reference');
    expect(ruleRelationship(sentinel, ['期末成绩'], policy, 999)).toBe('reference');
    expect(ruleRelationship(sentinel, ['成绩', '期末成绩'], policy, 999)).toBe('reference');
    expect(ruleRelationship(negative, ['温差'], policy, -9)).toBe('conflict');
    expect(ruleRelationship(rounding, ['成绩'], policy, 999)).toBe('reference');
    expect(ruleRelationship(rounding, ['模拟成绩'], policy)).toBe('out-of-scope');
    expect(ruleRelationship(rounding, [], policy)).toBe('out-of-scope');
    // 空适用字段是通用参考；文字缺失条目声明列名，不能强套到任意列。
    expect(ruleRelationship(sentinel, [], policy)).toBe('reference');
    expect(ruleRelationship(literal, ['状态'], policy, '无')).toBe('out-of-scope');
    expect(ruleRelationship(literal, ['备注'], {
      ...policy, rules: { 备注: { id: 'note', column: '备注', allowedValues: ['无'] } },
    }, '无')).toBe('conflict');
  });

  it('出站摘要只含列名与存在标记，不包含边界、码值或原文', () => {
    const summary = summarizeBatchPolicy(policy, ['成绩', '状态', '状态', '模拟成绩', '无关列']);
    expect(summary).toEqual([
      { column: '成绩', range: true, allowed: false, valid: true, missing: false },
      { column: '状态', range: false, allowed: true, valid: false, missing: false },
      { column: '模拟成绩', range: false, allowed: false, valid: false, missing: true },
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/SENSITIVE|1000|999|009/);
  });
});
