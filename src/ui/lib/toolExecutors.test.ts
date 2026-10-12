import { describe, it, expect } from 'vitest';
import { profileDataset, type Dataset } from '@/core';
import { TOOL_INPUT_SCHEMAS } from '@/agent/toolSchemas';
import { executeToolCall } from './toolExecutors';

const dataset: Dataset = {
  rowCount: 4,
  columns: [
    { name: '年龄', values: [23, 24, 999, 25] },
    { name: '姓名', values: ['甲', '乙', '甲', '丁'] },
  ],
};

const context = { dataset, profile: profileDataset(dataset) };

describe('工具执行器', () => {
  it('跑通一个真实检查并返回问题列表', () => {
    const withDuplicateNames: Dataset = {
      rowCount: 2,
      columns: [
        { name: '年龄', values: [20, 21] },
        { name: '年龄', values: [30, 31] },
      ],
    };

    const result = executeToolCall('run_checks', { checkIds: ['duplicate-column-names'] }, {
      dataset: withDuplicateNames,
      profile: profileDataset(withDuplicateNames),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { count: number }).count).toBeGreaterThan(0);
    }
  });

  it('可以限定只在指定的列上跑检查', () => {
    const result = executeToolCall('run_checks', { checkIds: ['missing'], columns: ['年龄'] }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const issues = (result.output as { issues: { evidence: { columns: string[] } }[] }).issues;
      // 限定到「年龄」之后，不该冒出涉及「姓名」的问题
      for (const issue of issues) {
        expect(issue.evidence.columns).not.toContain('姓名');
      }
    }
  });

  it('describe_column 返回该列的画像', () => {
    const result = executeToolCall('describe_column', { column: '姓名' }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { name: string }).name).toBe('姓名');
    }
  });
});

describe('工具执行器的输入校验', () => {
  it('未知工具名给出可读错误而不是抛异常', () => {
    const result = executeToolCall('drop_database', {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不认识的工具');
  });

  it('不存在的检查项被拦在执行之前', () => {
    // 参数由大模型生成，检查项标识可能是它编的。
    // 放它进 core 会抛异常，而异常穿过流式通道后只剩「An error occurred」，
    // 用户既不知道哪一步错了，也不知道怎么办。
    const result = executeToolCall('run_checks', { checkIds: ['not-a-check'] }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('不存在的检查项');
      // 报错要顺手给出可用项，让模型下一轮能自己纠正
      expect(result.error).toContain('missing');
    }
  });

  it('不存在的列名不会让 core 抛错穿透到界面', () => {
    const result = executeToolCall('describe_column', { column: '我编的列名' }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('没有名为');
      expect(result.error).toContain('年龄');
    }
  });

  it('限定列时给出不存在的列名同样被拦下', () => {
    const result = executeToolCall('run_checks', { checkIds: ['missing'], columns: ['不存在的列'] }, context);

    expect(result.ok).toBe(false);
    // 与 describe_column 用同一套措辞：同一类错误只该有一种说法
    if (!result.ok) expect(result.error).toContain('没有名为');
  });

  it('输入结构不对时返回校验错误', () => {
    const result = executeToolCall('run_checks', { checkIds: 'missing' }, context);

    expect(result.ok).toBe(false);
  });

  it('输入为 null 或 undefined 时也不抛异常', () => {
    for (const input of [null, undefined, 42, '字符串']) {
      const result = executeToolCall('describe_column', input, context);
      expect(result.ok, `input=${String(input)}`).toBe(false);
    }
  });

  it('空字符串列名被拦下', () => {
    const result = executeToolCall('describe_column', { column: '' }, context);

    expect(result.ok).toBe(false);
  });
});

describe('工具契约', () => {
  it('每个工具的输入契约都是可用的 zod schema', () => {
    for (const [name, schema] of Object.entries(TOOL_INPUT_SCHEMAS)) {
      expect(typeof schema.safeParse, `${name} 应能被校验`).toBe('function');
    }
  });

  it('校验失败时不抛异常，只返回 ok:false', () => {
    // executeToolCall 是流式通道里的回调，抛出的异常会变成一句
    // 「An error occurred」，排查线索全丢
    for (const name of Object.keys(TOOL_INPUT_SCHEMAS)) {
      expect(() => executeToolCall(name, { 乱来: true }, context)).not.toThrow();
    }
  });
});
