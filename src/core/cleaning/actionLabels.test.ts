import { describe, expect, it } from 'vitest';
import { ACTION_LABELS, actionDisplayName } from './actionLabels';

/**
 * 动作中文名是用户界面的最后一道「说人话」防线：
 * 真实运行里 AI 建议过 `normalize_type`、`unify_units` 这类自造动作名，
 * 报告里如果原样印出来，用户看到的就是一串英文标识符。
 */
describe('清洗动作的中文名', () => {
  it('会改数据的四个动作有固定中文名', () => {
    expect(actionDisplayName('merge_categories')).toBe('归并同类类别');
    expect(actionDisplayName('trim_whitespace')).toBe('去除首尾空格');
    expect(actionDisplayName('fill_missing')).toBe('填充缺失值');
    expect(actionDisplayName('remove_duplicates')).toBe('删除重复行');
  });

  it('AI 常用的别名与人工确认类动作也都翻成中文，并写明不改数据', () => {
    for (const action of [
      'normalize_type',
      'flag_missing_not_impute',
      'unify_units',
      'merge_categories_after_review',
      'review_outliers',
    ]) {
      const label = actionDisplayName(action);
      expect(label).not.toBe(action);
      expect(label).toContain('不改数据');
    }
  });

  it('未知动作回退成标识本身，不编一个假的中文名', () => {
    expect(actionDisplayName('frobnicate')).toBe('frobnicate');
    // 每个映射值都要是非空中文串，避免出现「空标签」导致界面上什么都不显示
    for (const [key, label] of Object.entries(ACTION_LABELS)) {
      expect(key.length).toBeGreaterThan(0);
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});
