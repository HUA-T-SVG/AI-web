import { describe, it, expect } from 'vitest';
import { profileDataset, type Dataset } from '@/core';
import { buildDataSummary, maskSample } from './summary';

function makeDataset(): Dataset {
  return {
    rowCount: 6,
    columns: [
      { name: '年龄', values: [23, 24, 22, 25, null, 23] },
      { name: '学历', values: ['本科', '本科', '本科', '硕士', '硕士', '本科在读'] },
    ],
  };
}

function summaryOf(dataset: Dataset, maskSamples?: boolean) {
  return buildDataSummary({
    dataset,
    profile: profileDataset(dataset),
    fileName: 'sample.csv',
    maskSamples,
  });
}

describe('结构摘要', () => {
  it('包含行列数与每列的聚合统计', () => {
    const summary = summaryOf(makeDataset());

    expect(summary.rowCount).toBe(6);
    expect(summary.columnCount).toBe(2);
    expect(summary.columns.map((column) => column.name)).toEqual(['年龄', '学历']);
  });

  it('数值列给出范围与均值，不发原始取值', () => {
    const summary = summaryOf(makeDataset());
    const age = summary.columns.find((column) => column.name === '年龄');

    expect(age?.numeric).toEqual({ min: 22, max: 25, mean: 23.4, median: 23 });
    // 数值列没有取值分布 —— 那是分类列才有的字段
    expect(age?.distribution).toBeUndefined();
  });

  it('绝不包含整列原始取值', () => {
    const summary = summaryOf(makeDataset());
    const serialized = JSON.stringify(summary);

    // 年龄列的完整取值序列不得出现
    expect(serialized).not.toContain('[23,24,22,25,null,23]');
    expect(serialized).not.toContain('23,24,22,25');
  });

  it('低频样例排在前面 —— 低频才是脏写法的信号', () => {
    const summary = summaryOf(makeDataset(), false);
    const education = summary.columns.find((column) => column.name === '学历');

    // 「本科在读」只出现 1 次，是最该被看见的写法；「本科」出现 3 次是正常取值。
    // 只有 3 个唯一值、上限 5，所以三个都会入选，能验的是顺序而不是取舍。
    expect(education?.samples[0]).toBe('本科在读');
    expect(education?.samples[1]).toBe('硕士');
  });

  it('唯一值多于上限时，高频取值被挤掉', () => {
    // 出现次数分别是 1、2、3、4、5、6；样例上限 5，出现 6 次的那个应被挤掉
    const values = [
      ...Array(6).fill('F'),
      ...Array(5).fill('E'),
      ...Array(4).fill('D'),
      ...Array(3).fill('C'),
      ...Array(2).fill('B'),
      'A',
    ];
    const dataset: Dataset = { rowCount: values.length, columns: [{ name: '取值', values }] };

    const samples = summaryOf(dataset, false).columns[0]?.samples ?? [];

    expect(samples.length).toBe(5);
    expect(samples).toContain('A');
    expect(samples).not.toContain('F');
  });

  it('样例数量与单个长度都有硬上限', () => {
    const values = Array.from({ length: 50 }, (_, index) => `取值${index}${'长'.repeat(60)}`);
    const dataset: Dataset = { rowCount: values.length, columns: [{ name: '备注', values }] };

    const samples = summaryOf(dataset, false).columns[0]?.samples ?? [];

    expect(samples.length).toBeLessThanOrEqual(5);
    for (const sample of samples) expect(sample.length).toBeLessThanOrEqual(40);
    // 超长的要留下截断痕迹，别让人以为原文就这么短
    expect(samples[0]?.endsWith('…')).toBe(true);
  });

  it('默认开启脱敏：样例给的是形状，不是原文', () => {
    const summary = summaryOf(makeDataset());
    const education = summary.columns.find((column) => column.name === '学历');

    expect(education?.samples.join('')).not.toContain('本科在读');
    // 但仍要能看出「有这么一类低频取值」，脱敏不等于删掉
    expect(education?.samples.length).toBeGreaterThan(0);
  });

  it('分类列的取值分布保留原始写法 —— 这是刻意的', () => {
    // 边界说明：脱敏保护的是「样例」，不是「取值分布」。
    // 类别归并必须看得见 硕士 / 研究生 / 硕士研究生 的具体写法，
    // 全抹掉这个功能就不成立了（设计文档 §3.3 的摘要示例本就带分布）。
    const summary = summaryOf(makeDataset());
    const education = summary.columns.find((column) => column.name === '学历');

    expect(education?.distribution).toEqual({ 本科: 3, 硕士: 2, 本科在读: 1 });
  });

  it('取值分布最多保留前 20 个，避免宽表把摘要撑爆', () => {
    const values = Array.from({ length: 40 }, (_, index) => `取值${index}`);
    const dataset: Dataset = { rowCount: values.length, columns: [{ name: '备注', values }] };

    const distribution = summaryOf(dataset).columns[0]?.distribution ?? {};
    expect(Object.keys(distribution).length).toBeLessThanOrEqual(20);
  });
});

describe('样例脱敏', () => {
  it('纯中文只保留长度', () => {
    expect(maskSample('本科在读')).toBe('4 个中文字符');
  });

  it('日期型取值只说明是日期', () => {
    expect(maskSample('2024-01-01')).toBe('日期型取值');
  });

  it('其他一律只报字符数', () => {
    expect(maskSample('abc123')).toBe('字符数 6');
  });

  it('超长取值报出真实长度', () => {
    expect(maskSample('长'.repeat(80))).toContain('80');
  });

  it('两端空白先进去，别让一个空格改变判定', () => {
    expect(maskSample('  本科  ')).toBe('2 个中文字符');
  });
});
