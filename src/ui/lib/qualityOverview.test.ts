import { describe, expect, it } from 'vitest';
import { summarizeChecks } from './qualityOverview';

/**
 * 看板的三种状态各一条。
 *
 * 这一组测试存在的理由：检查搬进 Worker 之后，「0 条问题」不再总是真的 ——
 * 它可能只是「还没跑完」。而看板那句话是**结论**，说错了比不显示更糟。
 */
describe('看板的检查结论表述', () => {
  it('检查跑完了才给数字与绿色结论', () => {
    const summary = summarizeChecks({ checksStatus: 'done', issueCount: 0, highCount: 0 });

    expect(summary).toEqual({ issueValue: '0 条', highValue: '0 条', verdict: 'done' });
  });

  it('检查还在跑时不说数字 —— 「0 条」会被读成「数据很干净」', () => {
    const summary = summarizeChecks({ checksStatus: 'running', issueCount: 0, highCount: 0 });

    expect(summary.issueValue).toBe('检查中…');
    expect(summary.highValue).toBe('—');
    // 关键：不能落到 done 分支，那一支会渲染「这份数据没检出问题」
    expect(summary.verdict).toBe('pending');
  });

  it('检查失败时说「未知」，而不是「0 条」', () => {
    const summary = summarizeChecks({ checksStatus: 'failed', issueCount: 0, highCount: 0 });

    expect(summary.issueValue).toBe('未知');
    expect(summary.verdict).toBe('failed');
  });

  it('已检出的条数在跑完之后照实显示', () => {
    const summary = summarizeChecks({ checksStatus: 'done', issueCount: 7, highCount: 2 });

    expect(summary.issueValue).toBe('7 条');
    expect(summary.highValue).toBe('2 条');
  });
});
