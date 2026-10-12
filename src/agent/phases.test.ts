import { describe, it, expect } from 'vitest';
import { PHASES, nextPhase, isTerminal, phaseLabel, type PhaseId } from './phases';
import type { CheckPlan, IssueReport } from './schemas';

const plan: CheckPlan = {
  reasoning: '学历列取值有同义写法，先查重复与缺失。',
  checks: [{ checkId: 'missing', columns: [], priority: 'high' }],
};

const report: IssueReport = {
  summary: '发现一类问题。',
  issues: [
    {
      checkId: 'missing',
      severity: 'medium',
      title: '备注列缺失率偏高',
      description: '备注列缺失率 0.61。',
      columns: ['备注'],
      suggestion: { action: 'review_missing', params: {}, rationale: '先确认是否为必填项', columns: ['备注'] },
      confidence: 0.7,
    },
  ],
};

describe('六阶段定义', () => {
  it('阶段顺序与设计文档一致', () => {
    expect(PHASES.map((phase) => phase.id)).toEqual([
      'profiling',
      'planning',
      'execution',
      'synthesis',
      'review',
      'apply',
    ]);
  });

  it('每个阶段都有中文标签与一句说明', () => {
    for (const phase of PHASES) {
      expect(phase.label.length).toBeGreaterThan(0);
      expect(phase.description.length).toBeGreaterThan(5);
    }
  });

  it('标签是中文，不是内部标识', () => {
    for (const phase of PHASES) {
      expect(phase.label).toMatch(/[\u4e00-\u9fa5]/);
      expect(phase.label).not.toBe(phase.id);
    }
  });

  it('标出哪些阶段会把内容发出去 —— 界面上要能看出来', () => {
    // 阶段 3 标 true，因为「下一步调哪个工具」由大模型决定，
    // 这一步确实有请求出门；只是发给它的是检查结果，不是原始数据
    const usesLlm = PHASES.filter((phase) => phase.usesLlm).map((phase) => phase.id);
    expect(usesLlm).toEqual(['planning', 'execution', 'synthesis']);
  });
});

describe('阶段流转', () => {
  it('正常路径逐级前进', () => {
    expect(nextPhase('profiling', { type: 'profiled' })).toBe('planning');
    expect(nextPhase('planning', { type: 'planned', plan })).toBe('execution');
    expect(nextPhase('execution', { type: 'executed' })).toBe('synthesis');
    expect(nextPhase('synthesis', { type: 'synthesized', report })).toBe('review');
    expect(nextPhase('review', { type: 'confirmed' })).toBe('apply');
  });

  it('计划被否决时退回规划，而不是继续执行', () => {
    // 用户看完计划说「不查这些」，那就得重新规划 ——
    // 往前走等于执行一份用户已经否掉的东西
    expect(nextPhase('planning', { type: 'rejected' })).toBe('planning');
  });

  it('执行阶段部分工具失败仍可汇总', () => {
    // 与 runAllChecks 的策略一致：单个检查失败不该让整份分析出不来
    expect(nextPhase('execution', { type: 'executed', failedTools: 2 })).toBe('synthesis');
  });

  it('失败退回重试代价最小的那一级', () => {
    expect(nextPhase('planning', { type: 'failed', reason: '超时' })).toBe('profiling');
    // 执行失败退回规划而不是剖析：检查结果还在，不必重跑剖析
    expect(nextPhase('execution', { type: 'failed', reason: '工具全部超时' })).toBe('planning');
    expect(nextPhase('synthesis', { type: 'failed', reason: '输出不合契约' })).toBe('execution');
  });

  it('apply 与 review 的终点判定', () => {
    expect(isTerminal('apply')).toBe(true);
    expect(isTerminal('review')).toBe(false);
  });

  it('到达 apply 之后不再流转', () => {
    expect(nextPhase('apply', { type: 'failed', reason: '随便' })).toBe('apply');
    expect(nextPhase('apply', { type: 'confirmed' })).toBe('apply');
  });

  it('与当前阶段不相干的事件被忽略，不会把阶段推到别处', () => {
    expect(nextPhase('profiling', { type: 'executed' })).toBe('profiling');
    expect(nextPhase('review', { type: 'executed' })).toBe('review');
  });

  it('任何事件都不会产生未知阶段', () => {
    const events = [
      { type: 'profiled' },
      { type: 'planned', plan },
      { type: 'rejected' },
      { type: 'executed' },
      { type: 'synthesized', report },
      { type: 'confirmed' },
      { type: 'failed', reason: 'x' },
    ] as const;
    const known = new Set(PHASES.map((phase) => phase.id));

    for (const phase of PHASES) {
      for (const event of events) {
        expect(known.has(nextPhase(phase.id, event)), `${phase.id} + ${event.type}`).toBe(true);
      }
    }
  });
});

describe('阶段标签', () => {
  it('取得到中文名', () => {
    expect(phaseLabel('execution')).toBe('执行检查');
  });

  it('未知标识原样返回，不抛错', () => {
    // 界面上的兜底：宁可显示一个奇怪的标识，也不要因为标签查不到就白屏
    expect(phaseLabel('not-a-phase' as PhaseId)).toBe('not-a-phase');
  });
});
