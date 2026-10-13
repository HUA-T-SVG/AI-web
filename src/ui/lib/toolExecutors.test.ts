import { describe, it, expect } from 'vitest';
import { profileDataset, type Dataset } from '@/core';
import { TOOL_INPUT_SCHEMAS } from '@/agent/shared/toolSchemas';
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

    const result = executeToolCall(
      'run_checks',
      { checkIds: ['duplicate-column-names'] },
      {
        dataset: withDuplicateNames,
        profile: profileDataset(withDuplicateNames),
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { count: number }).count).toBeGreaterThan(0);
    }
  });

  it('可以限定只在指定的列上跑检查', () => {
    const result = executeToolCall(
      'run_checks',
      { checkIds: ['missing'], columns: ['年龄'] },
      context,
    );

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
    const result = executeToolCall(
      'run_checks',
      { checkIds: ['missing'], columns: ['不存在的列'] },
      context,
    );

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

describe('工具结果的出站边界', () => {
  /**
   * 工具结果会经 addToolOutput 回填进 UI 消息，下一次 POST /api/agent 时
   * 随 messages 一起上行 —— 也就是说，它是原始数据离开浏览器的另一条通道，
   * 和结构摘要一样受「数据不出本机」这条承诺约束。
   */

  it('describe_column 的输出里不得出现原始样例', () => {
    // 全唯一的文本列：按 classify 的规则会被判成 text，而 text 列没有取值分布，
    // 所以只要原文出现在输出里，就一定是 samples 那条路漏出去的
    const dataset: Dataset = {
      rowCount: 3,
      columns: [
        { name: '备注', values: ['患者主诉头痛三天', '随访电话13800138000', '已完成问卷'] },
      ],
    };
    const leakContext = { dataset, profile: profileDataset(dataset) };
    expect(leakContext.profile.columns[0]?.type).toBe('text');

    const result = executeToolCall('describe_column', { column: '备注' }, leakContext);

    if (!result.ok) throw new Error(result.error);
    const serialized = JSON.stringify(result.output);
    expect(serialized).not.toContain('患者主诉头痛三天');
    expect(serialized).not.toContain('13800138000');
    // 但仍要给出形状，否则模型没法判断这一列该怎么处理
    expect(serialized).toContain('个中文字符');
  });

  it('run_checks 的结果里不得出现原始单元格值', () => {
    // mixed 列：数值占多数，混进一个非数值取值
    const dataset: Dataset = {
      rowCount: 6,
      columns: [{ name: '编号', values: [1, 2, 3, 4, 5, '内部代号XYZ'] }],
    };
    const leakContext = { dataset, profile: profileDataset(dataset) };

    const result = executeToolCall('run_checks', { checkIds: ['type-consistency'] }, leakContext);

    if (!result.ok) throw new Error(result.error);
    const serialized = JSON.stringify(result.output);
    expect((result.output as { count: number }).count).toBeGreaterThan(0);
    // 问题本身要照常给出，否则模型就失去判断依据了
    expect(serialized).toContain('type-consistency');
    // 但越界的那个原值不能跟着出去
    expect(serialized).not.toContain('内部代号XYZ');
  });

  it('涉及多少行会告诉模型，但不给具体行下标', () => {
    const dataset: Dataset = {
      rowCount: 6,
      columns: [{ name: '编号', values: [1, 2, 3, 4, 5, '内部代号XYZ'] }],
    };

    const result = executeToolCall(
      'run_checks',
      { checkIds: ['type-consistency'] },
      { dataset, profile: profileDataset(dataset) },
    );

    if (!result.ok) throw new Error(result.error);
    const issues = (
      result.output as { issues: { affectedRowCount: number; rowIndices?: unknown }[] }
    ).issues;
    expect(issues[0]?.affectedRowCount).toBe(1);
    // 位置信息对模型判断没有帮助，却更长
    expect(issues[0]?.rowIndices).toBeUndefined();
  });

  it('数值型聚合量不受影响 —— 它本来就是结构摘要会发出的东西', () => {
    // 这一条是边界说明，不是漏洞：设计文档 §3.3 的摘要示例里就有「范围: [17, 99]」，
    // 所以数值列的范围上界本来就会出门。真正不能出门的是「把一列的原值成串列出来」，
    // 也就是上面那条测的 offendingValues。
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '年龄', values: [23, 24, 25, 42] }],
    };

    const result = executeToolCall(
      'run_checks',
      { checkIds: ['missing'] },
      { dataset, profile: profileDataset(dataset) },
    );

    if (!result.ok) throw new Error(result.error);
    // 没有缺失就不该凭空生成问题
    expect((result.output as { count: number }).count).toBe(0);
  });
});

describe('submit_issue 的输入校验', () => {
  // 用共享 context 里真实存在的列：校验的对象就是「数据里有没有这一列」
  const validIssue = {
    checkId: 'type-consistency',
    severity: 'medium' as const,
    title: '年龄列类型不一致',
    description: '该列本应是数值，但混入了非数值取值。',
    columns: ['年龄'],
    suggestion: {
      action: 'normalize_type',
      params: {},
      rationale: '先核实这个取值的含义',
      columns: ['年龄'],
    },
    confidence: 0.9,
  };

  it('接受一条合法问题', () => {
    expect(executeToolCall('submit_issue', validIssue, context).ok).toBe(true);
  });

  it('拒绝不存在的检查项标识，并列出可用项', () => {
    // 编造的标识会以「已核实的检查结论」出现在审阅列表里，
    // 用户会照着它去执行清洗
    const result = executeToolCall(
      'submit_issue',
      { ...validIssue, checkId: '我编的检查项' },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('不存在的检查项');
      expect(result.error).toContain('type-consistency');
    }
  });

  it('拒绝数据里没有的列名', () => {
    const result = executeToolCall(
      'submit_issue',
      { ...validIssue, columns: ['我编的列'] },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('没有名为');
  });

  it('建议里指向不存在的列同样被拦下', () => {
    const result = executeToolCall(
      'submit_issue',
      { ...validIssue, suggestion: { ...validIssue.suggestion, columns: ['我编的列'] } },
      context,
    );

    expect(result.ok).toBe(false);
  });

  it('列名为空数组时通过 —— 有些问题本来就不针对具体列', () => {
    expect(executeToolCall('submit_issue', { ...validIssue, columns: [] }, context).ok).toBe(true);
  });
});
