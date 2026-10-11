import { describe, it, expect } from 'vitest';
import { profileDataset, checkMissing, runAllChecks, normalizeKey } from './index';

describe('core 包出口', () => {
  it('导出画像、检查与规范化能力', () => {
    expect(typeof profileDataset).toBe('function');
    expect(typeof checkMissing).toBe('function');
    expect(typeof runAllChecks).toBe('function');
    expect(typeof normalizeKey).toBe('function');
  });
});
