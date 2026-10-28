import { describe, it, expect, vi, beforeEach } from 'vitest';
import { profileDataset, runAllChecks, type Dataset } from '@/core';
import { TOOL_INPUT_SCHEMAS } from '@/agent/shared/toolSchemas';
import { executeToolCall } from './toolExecutors';

/**
 * `query_rules` 会去加载 920 KB 的规则索引，而单测不该碰网络（也不该依赖 public/）。
 * 这里只替换**索引加载**这一步：检索算法本身由 `src/knowledge/retrieve.test.ts`
 * 用真实索引测，执行器这一层要测的是校验与出站塑形。
 */
const { loadRuleIndexMock, runChecksInWorkerMock } = vi.hoisted(() => ({
  loadRuleIndexMock: vi.fn(),
  runChecksInWorkerMock: vi.fn(),
}));

vi.mock('@/knowledge/loadRules', () => ({
  loadRuleIndex: loadRuleIndexMock,
  RuleIndexUnavailableError: class RuleIndexUnavailableError extends Error {},
}));

/**
 * 执行器的 `run_checks` 走 Worker 客户端（T2），而 node 里没有 Worker。
 * 这里换成「同一个 core 实现」：既让结果保持真实，又能断言**它确实走了客户端**
 * 而不是直接在主线程调 core。
 */
vi.mock('@/ui/lib/workerChecks', () => ({
  runChecksInWorker: runChecksInWorkerMock,
  profileInWorker: vi.fn(),
  isChecksWorkerAvailable: () => true,
}));

const dataset: Dataset = {
  rowCount: 4,
  columns: [
    { name: '年龄', values: [23, 24, 999, 25] },
    { name: '姓名', values: ['甲', '乙', '甲', '丁'] },
  ],
};

const context = { dataset, profile: profileDataset(dataset) };

describe('工具执行器', () => {
  beforeEach(() => {
    // 默认走「真算一遍」的假客户端：结果来自同一份 core，但路径经过客户端
    runChecksInWorkerMock.mockReset().mockImplementation(
      async (target: Dataset, options?: Parameters<typeof runAllChecks>[1]) =>
        runAllChecks(target, options),
    );
  });

  it('跑通一个真实检查并返回问题列表', async () => {
    const withDuplicateNames: Dataset = {
      rowCount: 2,
      columns: [
        { name: '年龄', values: [20, 21] },
        { name: '年龄', values: [30, 31] },
      ],
    };

    const result = await executeToolCall(
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

  it('检查经由 Worker 客户端执行，而不是在主线程直接调 core', async () => {
    // 这条盯的是「AI 分析时跑检查会不会卡界面」：只要执行器绕开客户端，
    // 主线程就会同步跑 3 秒，而界面上看不出任何区别
    await executeToolCall('run_checks', { checkIds: ['missing'] }, context);

    expect(runChecksInWorkerMock).toHaveBeenCalledTimes(1);
    const [target, options] = runChecksInWorkerMock.mock.calls[0]!;
    expect(target).toBe(context.dataset);
    expect(options).toEqual({ enabled: ['missing'] });
  });

  it('检查失败时返回可读错误，而不是让工具循环崩掉', async () => {
    runChecksInWorkerMock.mockReset().mockRejectedValue(new Error('Worker 返回的检查结果不完整'));

    const result = await executeToolCall('run_checks', { checkIds: ['missing'] }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 模型拿到这句还能重试；异常穿过流通道只会变成一句「An error occurred」
      expect(result.error).toContain('执行检查时出错');
      expect(result.error).toContain('不完整');
    }
  });

  it('可以限定只在指定的列上跑检查', async () => {
    const result = await executeToolCall(
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

  it('describe_column 返回该列的画像', async () => {
    const result = await executeToolCall('describe_column', { column: '姓名' }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { name: string }).name).toBe('姓名');
    }
  });
});

describe('工具执行器的输入校验', () => {
  it('未知工具名给出可读错误而不是抛异常', async () => {
    const result = await executeToolCall('drop_database', {}, context);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不认识的工具');
  });

  it('不存在的检查项被拦在执行之前', async () => {
    // 参数由大模型生成，检查项标识可能是它编的。
    // 放它进 core 会抛异常，而异常穿过流式通道后只剩「An error occurred」，
    // 用户既不知道哪一步错了，也不知道怎么办。
    const result = await executeToolCall('run_checks', { checkIds: ['not-a-check'] }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('不存在的检查项');
      // 报错要顺手给出可用项，让模型下一轮能自己纠正
      expect(result.error).toContain('missing');
    }
  });

  it('不存在的列名不会让 core 抛错穿透到界面', async () => {
    const result = await executeToolCall('describe_column', { column: '我编的列名' }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('没有名为');
      expect(result.error).toContain('年龄');
    }
  });

  it('限定列时给出不存在的列名同样被拦下', async () => {
    const result = await executeToolCall(
      'run_checks',
      { checkIds: ['missing'], columns: ['不存在的列'] },
      context,
    );

    expect(result.ok).toBe(false);
    // 与 describe_column 用同一套措辞：同一类错误只该有一种说法
    if (!result.ok) expect(result.error).toContain('没有名为');
  });

  it('输入结构不对时返回校验错误', async () => {
    const result = await executeToolCall('run_checks', { checkIds: 'missing' }, context);

    expect(result.ok).toBe(false);
  });

  it('输入为 null 或 undefined 时也不抛异常', async () => {
    for (const input of [null, undefined, 42, '字符串']) {
      const result = await executeToolCall('describe_column', input, context);
      expect(result.ok, `input=${String(input)}`).toBe(false);
    }
  });

  it('空字符串列名被拦下', async () => {
    const result = await executeToolCall('describe_column', { column: '' }, context);

    expect(result.ok).toBe(false);
  });

  it('追问工具不在这里执行：它的「执行」是界面呈现给用户回答', async () => {
    // 这一步必须早退并给出可读原因。若它悄悄返回 ok，界面就不知道该停下来等用户
    const result = await executeToolCall(
      'ask_clarification',
      { questions: [{ question: '「重点」指什么？' }] },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('界面');
  });
});

describe('工具契约', () => {
  it('每个工具的输入契约都是可用的 zod schema', async () => {
    for (const [name, schema] of Object.entries(TOOL_INPUT_SCHEMAS)) {
      expect(typeof schema.safeParse, `${name} 应能被校验`).toBe('function');
    }
  });

  it('校验失败时不抛异常，只返回 ok:false', async () => {
    // executeToolCall 是流式通道里的回调，抛出的异常会变成一句
    // 「An error occurred」，排查线索全丢
    for (const name of Object.keys(TOOL_INPUT_SCHEMAS)) {
      await expect(executeToolCall(name, { 乱来: true }, context)).resolves.toBeDefined();
    }
  });
});

describe('工具结果的出站边界', () => {
  /**
   * 工具结果会经 addToolOutput 回填进 UI 消息，下一次 POST /api/agent 时
   * 随 messages 一起上行 —— 也就是说，它是原始数据离开浏览器的另一条通道，
   * 和结构摘要一样受「数据不出本机」这条承诺约束。
   */

  it('describe_column 的输出里不得出现原始样例', async () => {
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

    const result = await executeToolCall('describe_column', { column: '备注' }, leakContext);

    if (!result.ok) throw new Error(result.error);
    const serialized = JSON.stringify(result.output);
    expect(serialized).not.toContain('患者主诉头痛三天');
    expect(serialized).not.toContain('13800138000');
    // 但仍要给出形状，否则模型没法判断这一列该怎么处理
    expect(serialized).toContain('个中文字符');
  });

  it('run_checks 的结果里不得出现原始单元格值', async () => {
    // mixed 列：数值占多数，混进一个非数值取值
    const dataset: Dataset = {
      rowCount: 6,
      columns: [{ name: '编号', values: [1, 2, 3, 4, 5, '内部代号XYZ'] }],
    };
    const leakContext = { dataset, profile: profileDataset(dataset) };

    const result = await executeToolCall('run_checks', { checkIds: ['type-consistency'] }, leakContext);

    if (!result.ok) throw new Error(result.error);
    const serialized = JSON.stringify(result.output);
    expect((result.output as { count: number }).count).toBeGreaterThan(0);
    // 问题本身要照常给出，否则模型就失去判断依据了
    expect(serialized).toContain('type-consistency');
    // 但越界的那个原值不能跟着出去
    expect(serialized).not.toContain('内部代号XYZ');
  });

  /**
   * 这条是整分支审查抓出来的**出站泄漏**，也是我上一轮「出站面没有绕过白名单的路径」
   * 那个结论被推翻的地方。
   *
   * 上面那条测试挑的是 `type-consistency` —— 它的原值恰好在被过滤的 `statistics` 里，
   * 所以测试通过。而 `issueForModel` 对 `title`/`description` 是**原样透传**的，
   * `checkCategorySynonyms` 又把取值写进了 `description` 正文：**换个检查项就漏了**。
   *
   * 教训：机械核对只能证明「我查过的通道是干净的」，不能证明「没有别的通道」。
   * 所以这条测试紧跟着加在最容易漏的那条路径上。
   */
  it.each([
    ['type-consistency', '内部代号XYZ'],
    // 用一对**该被归并**的写法（`硕士／硕士研究生`），而不是反义对：
    // 反义对现在被护栏拦下、产不出问题，拿它测泄漏会变成空跑
    ['category-synonyms', '硕士研究生'],
  ])('run_checks 走 %s 时，原始取值也不得出现在出站载荷里', async (checkId, rawValue) => {
    const dataset: Dataset = {
      rowCount: 6,
      columns:
        checkId === 'category-synonyms'
          ? [
              {
                name: '学历',
                values: ['硕士', '硕士研究生', '硕士', '硕士研究生', '硕士', '硕士研究生'],
              },
            ]
          : [{ name: '编号', values: [1, 2, 3, 4, 5, '内部代号XYZ'] }],
    };
    const leakContext = { dataset, profile: profileDataset(dataset) };

    const result = await executeToolCall('run_checks', { checkIds: [checkId] }, leakContext);
    if (!result.ok) throw new Error(result.error);

    const serialized = JSON.stringify(result.output);
    // 问题本身要照常给出，否则模型失去判断依据
    expect(serialized).toContain(checkId);
    expect(serialized.length).toBeGreaterThan(50);
    // 但取值一个字都不能跟着出去
    expect(serialized).not.toContain(rawValue);
  });

  it('涉及多少行会告诉模型，但不给具体行下标', async () => {
    const dataset: Dataset = {
      rowCount: 6,
      columns: [{ name: '编号', values: [1, 2, 3, 4, 5, '内部代号XYZ'] }],
    };

    const result = await executeToolCall(
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

  it('数值型聚合量不受影响 —— 它本来就是结构摘要会发出的东西', async () => {
    // 这一条是边界说明，不是漏洞：设计文档 §3.3 的摘要示例里就有「范围: [17, 99]」，
    // 所以数值列的范围上界本来就会出门。真正不能出门的是「把一列的原值成串列出来」，
    // 也就是上面那条测的 offendingValues。
    const dataset: Dataset = {
      rowCount: 4,
      columns: [{ name: '年龄', values: [23, 24, 25, 42] }],
    };

    const result = await executeToolCall(
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

  it('接受一条合法问题', async () => {
    expect((await executeToolCall('submit_issue', validIssue, context)).ok).toBe(true);
  });

  it('拒绝不存在的检查项标识，并列出可用项', async () => {
    // 编造的标识会以「已核实的检查结论」出现在审阅列表里，
    // 用户会照着它去执行清洗
    const result = await executeToolCall(
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

  it('拒绝数据里没有的列名', async () => {
    const result = await executeToolCall(
      'submit_issue',
      { ...validIssue, columns: ['我编的列'] },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('没有名为');
  });

  it('建议里指向不存在的列同样被拦下', async () => {
    const result = await executeToolCall(
      'submit_issue',
      { ...validIssue, suggestion: { ...validIssue.suggestion, columns: ['我编的列'] } },
      context,
    );

    expect(result.ok).toBe(false);
  });

  it('列名为空数组时通过 —— 有些问题本来就不针对具体列', async () => {
    expect((await executeToolCall('submit_issue', { ...validIssue, columns: [] }, context)).ok).toBe(true);
  });
});

describe('检查计划工具', () => {
  const plan = {
    reasoning: '年龄列有 999 这类可疑取值，先查值域与异常值',
    checks: [
      { checkId: 'outliers', targetColumns: ['年龄'], reason: '999 疑似缺失编码', priority: 'high' },
    ],
  };

  it('合法计划原样返回 —— 界面据此展示「AI 打算做什么」', async () => {
    const result = await executeToolCall('plan_checks', plan, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toEqual(plan);
  });

  it('编造的检查项被拦下，并告知可用的有哪些', async () => {
    const result = await executeToolCall(
      'plan_checks',
      { ...plan, checks: [{ ...plan.checks[0], checkId: '我编的检查' }] },
      context,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 报错要说清「什么不对 + 现在能用的是什么」，模型下一轮才能自己改
      expect(result.error).toContain('不存在的检查项');
      expect(result.error).toContain('outliers');
    }
  });

  it('编造的列名被拦下', async () => {
    const result = await executeToolCall(
      'plan_checks',
      { ...plan, checks: [{ ...plan.checks[0], targetColumns: ['我编的列'] }] },
      context,
    );
    expect(result.ok).toBe(false);
  });

  it('空计划被 schema 拦下 —— 一份什么都不查的计划没有意义', async () => {
    expect((await executeToolCall('plan_checks', { reasoning: '随便看看', checks: [] }, context)).ok).toBe(
      false,
    );
  });

  it('超过 8 条被拦下 —— 与 submit_issue 同一个载荷理由', async () => {
    const tooMany = {
      reasoning: '查个遍',
      checks: Array.from({ length: 9 }, () => plan.checks[0]),
    };
    expect((await executeToolCall('plan_checks', tooMany, context)).ok).toBe(false);
  });
});

/**
 * `query_rules` 的学科参数。
 *
 * 索引里的学科层（真实索引 21 条 / 18.6%）原先**结构上不可达**：
 * 检索在 `subject` 没传时把候选集缩到「通用」，而运行时没有任何一处会传它。
 * 现在检索改成「学科只加权、不排除」，这个参数则让模型能在数据明显属于某学科时
 * 把该学科的规则排到前面。**参数一旦可传，就必须校验** —— 编造的学科名
 * 既加不了权，还会让模型以为「这个字段没有相关规则」而丢掉本该命中的领域知识。
 */
describe('query_rules 的学科参数', () => {
  /**
   * 一份最小可用的索引。
   *
   * `sparse` 必须是**真实的 2-gram → 词频**：检索的稀疏路按它算 BM25，
   * 给个空对象会让任何查询都召不到东西（那不是执行器的问题，是假数据不成立）。
   * 这两个 bigram 取自查询词「绩点」。
   */
  const fakeIndex = {
    dim: 2,
    rrfK: 60,
    topK: 5,
    model: 'test-stub',
    builtAt: '2026-01-01T00:00:00.000Z',
    entries: [
      {
        id: 'r-general',
        学科: ['通用'],
        适用字段: ['绩点'],
        entry: { 标题: '通用规则', 类别: '数据标准', 规则内容: '绩点列的通用口径。' },
        embedding: [1, 0],
        sparse: { 绩点: 1, 点列: 1 },
      },
      {
        id: 'r-subject',
        学科: ['数据科学与大数据技术'],
        适用字段: ['绩点'],
        entry: { 标题: '学科规则', 类别: '数据标准', 规则内容: '绩点与学分口径。' },
        embedding: [1, 0],
        sparse: { 绩点: 1, 点与: 1 },
      },
    ],
  };

  beforeEach(() => {
    loadRuleIndexMock.mockReset();
    loadRuleIndexMock.mockResolvedValue(fakeIndex);
  });

  it('编造的学科名被拦下，并告知可用的学科', async () => {
    const result = await executeToolCall(
      'query_rules',
      { query: '绩点 3.5', subject: '我编的学科' },
      context,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('我编的学科');
      // 报错要说清「现在能用的是什么」，模型下一轮才能自己改
      expect(result.error).toContain('数据科学与大数据技术');
    }
  });

  it('不传学科时照常检索 —— 学科是可选加权，不是必填闸门', async () => {
    const result = await executeToolCall('query_rules', { query: '绩点 3.5' }, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.output as { count: number }).count).toBeGreaterThan(0);
    expect(loadRuleIndexMock).toHaveBeenCalled();
  });

  it('传合法学科时检索照常，且不报错', async () => {
    const result = await executeToolCall(
      'query_rules',
      { query: '绩点 3.5', subject: '数据科学与大数据技术' },
      context,
    );
    expect(result.ok).toBe(true);
    expect(loadRuleIndexMock).toHaveBeenCalled();
  });
});
