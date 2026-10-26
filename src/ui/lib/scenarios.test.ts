import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAllChecks, type Dataset } from '@/core';
import { parseCsv } from '@/parser/csv';
import { ALL_CHECK_IDS, SCENARIOS, SCENARIO_IDS, isScenarioId, scenarioById } from './scenarios';

describe('研究场景定义', () => {
  it('恰好三个场景，id 与标题固定', () => {
    expect(SCENARIOS.map((scenario) => scenario.id)).toEqual(['survey', 'experiment', 'education']);
    expect(SCENARIOS.map((scenario) => scenario.title)).toEqual(['问卷数据', '实验数据', '教育数据']);
  });

  it('每个场景有说明、恰好三条关注点、示例入口', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.summary.length).toBeGreaterThan(10);
      expect(scenario.focusPoints).toHaveLength(3);
      expect(scenario.sample.url).toMatch(/^\/sample\/.+\.csv$/);
      expect(scenario.sample.fileName).toMatch(/^示例-.+\.csv$/);
    }
  });

  it('推荐检查是 8 项子集且不搬走任何一项', () => {
    expect(ALL_CHECK_IDS).toHaveLength(8);
    for (const scenario of SCENARIOS) {
      expect(scenario.recommendedCheckIds.length).toBeGreaterThan(0);
      expect(scenario.recommendedCheckIds.length).toBeLessThan(8);
      for (const checkId of scenario.recommendedCheckIds) expect(ALL_CHECK_IDS).toContain(checkId);
    }
  });

  it('场景不是学科：没有学科或知识库字段', () => {
    for (const scenario of SCENARIOS) expect(scenario).not.toHaveProperty('subject');
  });

  it('scenarioById / isScenarioId 只认已注册场景', () => {
    expect(scenarioById('survey')?.title).toBe('问卷数据');
    expect(scenarioById('chemistry')).toBeNull();
    expect(isScenarioId('experiment')).toBe(true);
    expect(isScenarioId('nope')).toBe(false);
    expect(SCENARIO_IDS).toHaveLength(3);
  });
});

/** 只要求「至少这些」：将来检查项增强不该让这条假红 */
const EXPECTED: Record<string, string[]> = {
  survey: ['duplicates', 'type-consistency', 'missing'],
  experiment: ['unit-consistency', 'duplicates', 'outliers'],
  education: ['type-consistency', 'missing', 'outliers', 'duplicates'],
};

function readSample(url: string): string {
  return readFileSync(resolve(process.cwd(), 'public', url.replace(/^\//, '')), 'utf8');
}

function loadSampleDataset(url: string): Dataset {
  const text = readSample(url);
  const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
  const result = parseCsv({ buffer, fileName: url, fileSize: buffer.byteLength });
  if ('kind' in result) throw new Error(`示例 ${url} 解析失败：${result.message}`);
  return result.dataset;
}

/**
 * 示例数据是演示时最先被点开的东西：卡片上写着「重点看单位混用」，
 * 检查页却一条都没有，比没有示例更糟。所以这里直接从真实的
 * parseCsv → runAllChecks 入口读文件，断言埋进去的问题真的能被检出。
 */
describe('示例数据：埋进去的问题必须真的能被检出（合成数据 7–15 行）', () => {
  for (const scenario of SCENARIOS) {
    // 逐场景取出预期项：没有登记的场景当作空数组，下面的断言会把它判红
    const expectedCheckIds = EXPECTED[scenario.id] ?? [];
    it(`${scenario.title}示例会报出：${expectedCheckIds.join('、')}`, () => {
      expect(expectedCheckIds.length).toBeGreaterThan(0);
      const checkIds = new Set(
        runAllChecks(loadSampleDataset(scenario.sample.url)).map((issue) => issue.checkId),
      );
      for (const expected of expectedCheckIds) expect([...checkIds]).toContain(expected);
      const rows = readSample(scenario.sample.url).trimEnd().split('\n').length - 1;
      expect(rows).toBeGreaterThanOrEqual(7);
      expect(rows).toBeLessThanOrEqual(15);
    });
  }
});
