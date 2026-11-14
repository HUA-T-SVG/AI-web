import { describe, expect, it } from 'vitest';
import { dictionaryRequestSchema, dictionaryResponseSchema, type DictionaryCandidate } from '@/agent/shared/dataDictionary';
import { checkRangeRules } from '@/core';
import { dictionaryCodeConflictsWithRule, prepareDictionaryCandidates, resolveDictionarySelection } from './dataDictionary';

const columns = ['成绩', '学历', '部门'];
const range = (quote: string, min?: number, max?: number): DictionaryCandidate =>
  ({ kind: 'range', field: '成绩', quote, min, max });
const allowed = (quote: string, values: string[]): DictionaryCandidate =>
  ({ kind: 'allowed', field: '学历', quote, values });
const code = (quote: string, value: string): DictionaryCandidate =>
  ({ kind: 'missing-code', field: '成绩', quote, code: value });

function select(candidates: readonly DictionaryCandidate[], text = candidates.map(({ quote }) => quote).join('\n')) {
  const rows = prepareDictionaryCandidates(text, columns, candidates);
  return resolveDictionarySelection(rows, rows.map(({ id, column }) => ({ id, column: column ?? '' })), columns);
}

describe('数据字典确认', () => {
  it('闭区间和清单进入已有本地引擎，原文留痕，缺失码只给试算', () => {
    const result = select([
      range('成绩：允许范围 0–100 分；缺考码为 999', 0, 100),
      allowed('学历：只允许本科、硕士。', ['本科', '硕士']),
      code('成绩：允许范围 0–100 分；缺考码为 999', '999'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const original = { rowCount: 2, columns: [
      { name: '成绩', values: [60, 999] },
      { name: '学历', values: ['本科', '小学'] },
    ] };
    expect(checkRangeRules(original, result.rules).map((issue) => issue.evidence.rowIndices)).toEqual([[1], [1]]);
    expect(result.rules[0]?.rationale).toContain('成绩：允许范围 0–100 分');
    expect(result.missingCodes).toEqual([{ column: '成绩', code: '999', quote: '成绩：允许范围 0–100 分；缺考码为 999' }]);
    expect(original.columns[0]?.values).toEqual([60, 999]);
  });

  it('拒绝编造引文、偷掉否定前缀、篡改上下界和把正常数字当成缺失', () => {
    const text = '成绩：999 为正常取值，不是缺考。\n成绩：满分 1000。\n成绩：范围 [0,100]。\n成绩单：999 表示缺考。';
    const rows = prepareDictionaryCandidates(text, columns, [
      code('成绩：999 表示缺考。', '999'),
      code('999 为正常取值，不是缺考。', '999'),
      code('成绩：999 为正常取值，不是缺考。', '999'),
      code('成绩：满分 1000。', '999'),
      range('成绩：范围 [0,100]。', 0, 10),
      range('成绩：范围 [0,100]。', 0, 100),
      { ...code('成绩单：999 表示缺考。', '999'), field: '成绩' },
    ]);
    expect(rows.map(({ error }) => error === null)).toEqual([false, false, false, false, false, true, false]);
  });

  it('保守跳过半开区间、带单位换算的上下限、示例、码值丢失前导零和不完整清单', () => {
    const rules = [
      range('成绩：范围 0 至 100，不含 100。', 0, 100),
      range('成绩：范围 (0,100]。', 0, 100),
      range('成绩：满分 10 万。', undefined, 10),
      range('成绩：满分 1e3。', undefined, 1),
      range('成绩：范围为 [0,0.125]。', 0, 0.125),
      range('成绩：范围 2025-01-02。', 1, 2),
      allowed('学历：可取本科、硕士、博士。', ['本科', '硕士']),
      allowed('学历：示例允许本科或硕士。', ['本科', '硕士']),
      code('成绩：缺考码为 0999。', '999'),
      code('成绩：缺考码为 0999。', '0999'),
      code('成绩：-999 表示缺考。', '999'),
      code('成绩：-999 表示缺考。', '-999'),
      code('成绩：-999 表示未填写。', '-999'),
    ];
    expect(prepareDictionaryCandidates(rules.map(({ quote }) => quote).join('\n'), columns, rules)
      .map(({ error }) => error === null)).toEqual([false, false, false, false, true, false, false, false, false, true, false, true, true]);
  });

  it('别名只能人工选列，同名列或过期候选不能执行', () => {
    const candidate: DictionaryCandidate = { kind: 'range', field: '分数', quote: '分数：满分 100', max: 100 };
    const [row] = prepareDictionaryCandidates(candidate.quote, columns, [candidate]);
    expect(row).toMatchObject({ column: null, error: null });
    expect(resolveDictionarySelection([row!], [{ id: row!.id, column: '成绩' }], columns)).toMatchObject({
      ok: true, rules: [{ column: '成绩', max: 100 }],
    });
    expect(resolveDictionarySelection([row!], [{ id: row!.id, column: '成绩' }], [...columns, '成绩']).ok).toBe(false);
    expect(resolveDictionarySelection([row!], [{ id: 'old', column: '成绩' }], columns).ok).toBe(false);
  });

  it('不能在分号提前截断引文来跳过适用条件', () => {
    const full = '成绩：满分 100；仅适用 A 班。';
    const quotes = [full, '成绩：满分 100', '成绩：满分 100；'];
    expect(prepareDictionaryCandidates(full, columns, quotes.map((quote) => range(quote, undefined, 100)))
      .every(({ error }) => error !== null)).toBe(true);
  });

  it('同一字段用分号拆开的允许值或上下界必须一起核对', () => {
    const list = '学历：允许本科、硕士；也允许博士。';
    const bounds = '成绩：下限 0；上限 100。';
    const contradictoryLists = '学历：只允许本科；学历：只允许硕士。';
    const candidates = [allowed(list, ['本科', '硕士']), allowed(list, ['本科', '硕士', '博士']),
      range(bounds, undefined, 100), range(bounds, 0, 100), allowed(contradictoryLists, ['本科', '硕士'])];
    expect(prepareDictionaryCandidates([list, bounds, contradictoryLists].join('\n'), columns, candidates)
      .map(({ error }) => error === null)).toEqual([false, true, false, true, false]);
  });

  it('同列互补上下界可以合并，但冲突不能静默取值', () => {
    expect(select([range('成绩下限 0', 0), range('成绩上限 100', undefined, 100)]))
      .toMatchObject({ ok: true, rules: [{ min: 0, max: 100 }] });
    expect(select([range('成绩满分 100', undefined, 100), range('成绩满分 1000', undefined, 1000)]))
      .toMatchObject({ ok: false, error: expect.stringContaining('冲突') });
    expect(select([range('成绩满分 1000', undefined, 1000), code('成绩：999 表示缺考。', '999')]))
      .toMatchObject({ ok: false, error: expect.stringContaining('同时被选作') });
    expect(select([code('成绩：999 表示缺考。', '999'), code('成绩：998 表示缺考。', '998')]))
      .toMatchObject({ ok: false, error: expect.stringContaining('不同的缺失码') });
    expect(dictionaryCodeConflictsWithRule('009', { id: 'case', column: '成绩', allowedValues: ['9'] })).toBe(false);
  });

  it('共享契约限制输入体积，拒绝模型附加或输出非结构化值', () => {
    expect(dictionaryRequestSchema.safeParse({ columns, text: '\n\t' }).success).toBe(false);
    expect(dictionaryRequestSchema.safeParse({ columns, text: '长'.repeat(6001) }).success).toBe(false);
    expect(dictionaryRequestSchema.safeParse({ columns, text: '规则', rows: [[60]] }).success).toBe(false);
    expect(dictionaryResponseSchema.safeParse({ candidates: [{ ...code('成绩：999 表示缺考。', '999'), code: 999 }] }).success).toBe(false);
  });
});
