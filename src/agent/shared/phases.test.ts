import { describe, it, expect } from 'vitest';
import { PHASES } from './phases';

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

  it('阶段标识不重复', () => {
    const ids = PHASES.map((phase) => phase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('标出哪些阶段会把内容发出去 —— 界面上要能看出来', () => {
    // 阶段 3 标 true，因为「下一步调哪个工具」由大模型决定，
    // 这一步确实有请求出门；只是发给它的是检查结果，不是原始数据
    const usesLlm = PHASES.filter((phase) => phase.usesLlm).map((phase) => phase.id);
    expect(usesLlm).toEqual(['planning', 'execution', 'synthesis']);
  });

  it('本地执行的两个阶段不会被标成联网', () => {
    // 剖析在浏览器内完成，人工确认与执行留痕是用户自己的动作 ——
    // 标错了会让「数据不出浏览器」这句话变得不可信
    const local = PHASES.filter((phase) => !phase.usesLlm).map((phase) => phase.id);
    expect(local).toEqual(['profiling', 'review', 'apply']);
  });
});
