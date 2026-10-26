import { describe, expect, it } from 'vitest';
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
