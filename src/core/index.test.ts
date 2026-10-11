import { describe, it, expect } from 'vitest';
import type { Dataset } from './types';
import { profileDataset, runAllChecks, normalizeKey, parseNumeric } from './index';

describe('core 包出口', () => {
  it('导出画像、检查、规范化与数值解析能力', () => {
    expect(typeof profileDataset).toBe('function');
    expect(typeof runAllChecks).toBe('function');
    expect(typeof normalizeKey).toBe('function');
    expect(typeof parseNumeric).toBe('function');
  });

  it('通过出口调用能真正跑通，而不只是存在', () => {
    // Worker 与未来的 MCP Server 都从 barrel 导入，
    // 只断言 typeof 的话，漏掉某个 re-export 也不会被发现
    const dataset: Dataset = {
      rowCount: 3,
      columns: [
        { name: '年龄', values: [20, 999, null] },
        { name: '学历', values: ['本科', '硕士', '本科'] },
      ],
    };

    const profile = profileDataset(dataset);
    expect(profile.columns).toHaveLength(2);
    expect(profile.columns[0]?.type).toBe('number');

    const issues = runAllChecks(dataset, {
      rangeRules: [{ id: 'age', column: '年龄', min: 0, max: 120 }],
    });
    const checkIds = new Set(issues.map((i) => i.checkId));
    expect(checkIds.has('missing')).toBe(true);
    expect(checkIds.has('range-rules')).toBe(true);
  });
});
