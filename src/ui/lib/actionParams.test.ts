import { describe, it, expect } from 'vitest';
import type { Dataset } from '@/core';
import type { CleaningAction } from '@/agent/shared/schemas';
import { draftOf, isEditableAction, parseDraft } from './actionParams';

const dataset: Dataset = {
  rowCount: 4,
  columns: [
    { name: '学历', values: ['本科', '硕士', '研究生', '本科在读'] },
    { name: '年龄', values: [20, null, 22, 23] },
    { name: '学号', values: ['001', '002', '003', '004'] },
  ],
};

function action(overrides: Partial<CleaningAction> = {}): CleaningAction {
  return {
    action: 'merge_categories',
    params: { column: '学历', groups: [['硕士', '研究生']] },
    rationale: '同义写法应归并',
    columns: ['学历'],
    ...overrides,
  };
}

describe('isEditableAction', () => {
  it('只给会改数据的动作开放参数编辑', () => {
    expect(isEditableAction('merge_categories')).toBe(true);
    expect(isEditableAction('fill_missing')).toBe(true);
    expect(isEditableAction('trim_whitespace')).toBe(true);
    expect(isEditableAction('remove_duplicates')).toBe(true);
    // 人工判断类：执行器本来就不改数据，编辑参数会造成「改了却没生效」的错觉
    expect(isEditableAction('fill_or_drop')).toBe(false);
    expect(isEditableAction('review_unit_mix')).toBe(false);
  });
});

describe('draftOf', () => {
  it('把建议参数摊平成可编辑文本', () => {
    const draft = draftOf(action());
    expect(draft.groups).toBe('硕士、研究生');
    expect(draft.columns).toBe('学历');
  });

  it('填值建议带出原参数', () => {
    const draft = draftOf(
      action({ action: 'fill_missing', params: { column: '年龄', value: 0 } }),
    );
    expect(draft.value).toBe('0');
  });
});

describe('parseDraft · merge_categories', () => {
  it('多组写法解析成二维数组', () => {
    const parsed = parseDraft(action(), { groups: '硕士、研究生\n本科 本科在读', columns: '', value: '' }, dataset);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.action.params).toEqual({
        column: '学历',
        groups: [
          ['硕士', '研究生'],
          ['本科', '本科在读'],
        ],
      });
      expect(parsed.action.columns).toEqual(['学历']);
    }
  });

  it('每组只有一个写法时拒绝 —— 那不是归并', () => {
    const parsed = parseDraft(action(), { groups: '硕士', columns: '', value: '' }, dataset);
    expect(parsed).toMatchObject({ ok: false });
    if (!parsed.ok) expect(parsed.error).toContain('至少要有两个写法');
  });

  it('列不存在时给出可读错误', () => {
    const parsed = parseDraft(
      action({ params: { column: '不存在的列', groups: [['甲', '乙']] } }),
      { groups: '甲、乙', columns: '', value: '' },
      dataset,
    );
    expect(parsed).toMatchObject({ ok: false });
    if (!parsed.ok) expect(parsed.error).toContain('没有名为「不存在的列」的列');
  });

  it('空分组拒绝', () => {
    const parsed = parseDraft(action(), { groups: '   ', columns: '', value: '' }, dataset);
    expect(parsed).toMatchObject({ ok: false });
  });
});

describe('parseDraft · 其它动作', () => {
  it('trim_whitespace 校验列名并保留顺序', () => {
    const parsed = parseDraft(
      action({ action: 'trim_whitespace', params: {}, columns: ['学号'] }),
      { groups: '', columns: '学号、年龄', value: '' },
      dataset,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.action.params).toEqual({ columns: ['学号', '年龄'] });
  });

  it('trim_whitespace 遇到不存在的列报错', () => {
    const parsed = parseDraft(
      action({ action: 'trim_whitespace' }),
      { groups: '', columns: '学号、不存在的列', value: '' },
      dataset,
    );
    expect(parsed).toMatchObject({ ok: false });
  });

  it('fill_missing 把数字字面量解析成 number，文本保持字符串', () => {
    const numeric = parseDraft(
      action({ action: 'fill_missing', params: { column: '年龄' } }),
      { groups: '', columns: '', value: '0' },
      dataset,
    );
    expect(numeric.ok && numeric.action.params.value).toBe(0);

    const text = parseDraft(
      action({ action: 'fill_missing', params: { column: '年龄' } }),
      { groups: '', columns: '', value: '缺考' },
      dataset,
    );
    expect(text.ok && text.action.params.value).toBe('缺考');
  });

  it('fill_missing 的空值拒绝 —— 填空等于没填', () => {
    const parsed = parseDraft(
      action({ action: 'fill_missing', params: { column: '年龄' } }),
      { groups: '', columns: '', value: '  ' },
      dataset,
    );
    expect(parsed).toMatchObject({ ok: false });
  });

  it('remove_duplicates 留空表示按整行判重', () => {
    const parsed = parseDraft(
      action({ action: 'remove_duplicates', params: {}, columns: [] }),
      { groups: '', columns: '', value: '' },
      dataset,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.action.params).toEqual({ columns: [] });
  });
});
