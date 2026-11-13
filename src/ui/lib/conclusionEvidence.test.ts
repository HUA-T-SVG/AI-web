import { describe, expect, it } from 'vitest';
import type { Issue } from '@/agent/shared/schemas';
import { profileDataset, type Dataset } from '@/core';
import type { RuleHit } from '@/knowledge/types';
import { createEvidenceLedger } from './conclusionEvidence';
import { executeToolCall } from './toolExecutors';

const dataset: Dataset = { rowCount: 3, columns: [
  { name: '成绩', values: ['70', '999', '80'] },
  { name: '年龄', values: ['18', '19', '20'] },
] };
const issue: Issue = {
  checkId: 'range-rules', severity: 'high', columns: ['成绩'], title: '疑似占位码',
  description: '建议核对数据字典', confidence: 0.8, rowIndices: [9999],
  suggestion: { action: 'review_range_violations', columns: ['成绩'], rationale: '核对后再处理', params: {} },
};
const reference = (field: string, id = field): RuleHit => ({
  score: 1, reason: '命中列名',
  rule: { id, 学科: ['教育'], 适用字段: [field], embedding: [], sparse: {},
    entry: { id, 标题: '检查规则', 类别: '值域', 规则内容: '根据数据字典确认', 核验状态: '已核对' } },
});

describe('AI 结论依据', () => {
  it('只发编号与聚合量；本地行号取自实际检查，旧轮次与错误字段不能复用', async () => {
    const evidence = createEvidenceLedger();
    const result = await executeToolCall('run_checks', { checkIds: ['range-rules'], columns: ['成绩'] }, {
      dataset, profile: profileDataset(dataset), rangeRules: [{ id: '本地规则', column: '成绩', max: 100 }], evidence,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const outbound = (result.output as { issues: { evidenceId: string }[] }).issues[0]!;
    expect(outbound).toMatchObject({ affectedRowCount: 1, statistics: { violationCount: 1 } });
    expect(JSON.stringify(outbound)).not.toMatch(/rowIndices|allowedValues|"values"|999/);
    const cited = { ...issue, checkEvidenceId: outbound.evidenceId };
    expect(evidence.resolve(cited).check?.evidence.rowIndices).toEqual([1]);
    expect(evidence.resolve({ ...cited, columns: ['年龄'] })).toMatchObject({ check: undefined, invalidCheck: true });
    expect(evidence.resolve({ ...cited, checkId: 'outliers' }).check).toBeUndefined();
    expect(createEvidenceLedger().resolve(cited)).toMatchObject({ check: undefined, invalidCheck: true });
  });

  it('规则引用必须来自本轮检索，并且匹配字段；规则本身不能代替本地检查', () => {
    const evidence = createEvidenceLedger();
    const correct = evidence.recordRule(reference('成绩'), ['成绩']);
    const wrongField = evidence.recordRule(reference('年龄'), ['成绩', '年龄']);
    const wrongQuery = evidence.recordRule(reference('成绩', 'other'), ['年龄']);
    const resolved = evidence.resolve({ ...issue, ruleEvidenceIds: [correct, wrongField, wrongQuery, 'invented'] });
    expect(resolved.check).toBeUndefined();
    expect(resolved.rules).toMatchObject([{ id: '成绩', verification: '已核对' }]);
    expect(resolved.invalidRules).toBe(3);
  });

  it('模型不能直接提交占位码清洗动作', async () => {
    const result = await executeToolCall('submit_issue', { ...issue, comparisonCode: '999',
      suggestion: { ...issue.suggestion, action: 'set_code_missing', params: { column: '成绩', code: '999' } },
    }, { dataset, profile: profileDataset(dataset) });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('用户选择') });
  });
});
