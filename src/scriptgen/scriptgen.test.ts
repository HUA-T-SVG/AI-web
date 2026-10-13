import { describe, expect, it } from 'vitest';
import { buildPandasScript } from './pandas';
import { toCsv } from './csv';
import { buildProvenance, datasetFingerprint } from './provenance';
import { applyCleaningActions, type AppliedAction, type Dataset } from '@/core';
import type { CleaningAction } from '@/agent/shared/schemas';

const dataset: Dataset = {
  rowCount: 4,
  columns: [
    { name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] },
    { name: '年龄', values: [23, null, 25, 24] },
  ],
};

const merge: CleaningAction = {
  action: 'merge_categories',
  params: { column: '学历', groups: [['硕士', '研究生']] },
  rationale: '同一类别',
  columns: ['学历'],
};

/** 用真正的执行器产出留痕，避免测试自己编一份与产品不一致的输入。 */
function appliedOf(actions: CleaningAction[]): AppliedAction[] {
  return applyCleaningActions(dataset, actions).applied;
}

describe('pandas 脚本生成', () => {
  it('归并动作生成可读的 replace 映射', () => {
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'survey.csv',
      actions: [merge],
    });
    expect(script).toContain(".replace(");
    expect(script).toContain('研究生');
    expect(script).toContain('硕士');
  });

  it('列名一律带引号 —— 中文与含空格的列名都不会把脚本写坏', () => {
    const spaced: Dataset = {
      rowCount: 1,
      columns: [{ name: '最 高 学 历', values: ['硕士'] }],
    };
    const script = buildPandasScript({
      dataset: spaced,
      sourceFileName: 'x.csv',
      actions: [
        {
          action: 'trim_whitespace',
          params: { columns: ['最 高 学 历'] },
          rationale: '取值可能带空白',
          columns: ['最 高 学 历'],
        },
      ],
    });
    expect(script).toContain("'最 高 学 历'");
  });

  it('列名里的单引号被转义 —— 否则脚本语法就是错的', () => {
    const quoted: Dataset = {
      rowCount: 1,
      columns: [{ name: "备注'栏", values: ['甲'] }],
    };
    const script = buildPandasScript({
      dataset: quoted,
      sourceFileName: 'x.csv',
      actions: [
        { action: 'trim_whitespace', params: { columns: ["备注'栏"] }, rationale: '去空白', columns: [] },
      ],
    });
    // 生成的是 '备注\'栏' 这种形式，至少不能出现未转义的裸引号把字符串截断
    expect(script).not.toContain("df['备注'栏']");
    expect(script).toContain('\\');
  });

  it('源文件名进脚本注释，用户能对上自己在清哪份数据', () => {
    const script = buildPandasScript({ dataset, sourceFileName: 'survey.csv', actions: [] });
    expect(script).toContain('survey.csv');
  });

  it('脚本头写明由谁生成 —— 留痕才可追溯', () => {
    const script = buildPandasScript({ dataset, sourceFileName: 'survey.csv', actions: [] });
    expect(script).toContain('数据质量治理 Agent');
  });

  it('没有动作时也生成一份能跑的脚本（读入 + 原样写出）', () => {
    const script = buildPandasScript({ dataset, sourceFileName: 'survey.csv', actions: [] });
    expect(script).toContain('read_csv');
    expect(script).toContain('to_csv');
  });

  it('脚本与界面执行的是同一套动作 —— 同一个动作序列生成的代码只出现一次', () => {
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'survey.csv',
      actions: [merge, merge],
    });
    // 两次同样的动作就生成两行，不做去重：执行器也是执行两次，
    // 脚本要能逐条对上「界面上发生过什么」
    expect(script.match(/\.replace\(/g)?.length).toBe(2);
  });

  it('未识别的动作在脚本里留一条注释，而不是静默丢掉', () => {
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'survey.csv',
      actions: [{ action: 'frobnicate', params: {}, rationale: '测试', columns: [] }],
    });
    expect(script).toContain('frobnicate');
  });
});

/**
 * 这一组是本文件里最要紧的：**脚本必须与界面执行的是同一件事**。
 *
 * 第一版有三处不一致，都是自审时逐条比对才发现的。它们的共同点是
 * 「测试数据恰好让两边结果相同」，所以原测试全绿却掩盖着真问题 ——
 * 下面每条都刻意构造出让两边**可能不同**的数据。
 */
describe('脚本与执行器逐条对齐', () => {
  it('归并方向按「出现次数最多」选 —— 频率不等时两边必须指同一个方向', () => {
    // 组是 ['研究生','硕士']，而「硕士」出现 3 次、「研究生」1 次。
    // 第一版的脚本永远取 group[0]（研究生），于是它把硕士并成研究生，
    // 而界面把研究生并成硕士 —— 方向相反。测试数据频率相等时看不出来。
    const skewed: Dataset = {
      rowCount: 4,
      columns: [{ name: '学历', values: ['硕士', '硕士', '硕士', '研究生'] }],
    };
    const action: CleaningAction = {
      action: 'merge_categories',
      params: { column: '学历', groups: [['研究生', '硕士']] },
      rationale: '同一类别',
      columns: ['学历'],
    };

    // 先确认执行器确实并成「硕士」
    const applied = applyCleaningActions(skewed, [action]).dataset;
    expect(applied.columns[0]?.values).toEqual(['硕士', '硕士', '硕士', '硕士']);

    // 脚本必须同向
    const script = buildPandasScript({
      dataset: skewed,
      sourceFileName: 'survey.csv',
      actions: [action],
    });
    expect(script).toContain("'研究生': '硕士'");
    expect(script).not.toContain("'硕士': '研究生'");
  });

  it('频率相等时取组内第一个 —— 与执行器的并列规则一致', () => {
    const tied: Dataset = {
      rowCount: 2,
      columns: [{ name: '学历', values: ['研究生', '硕士'] }],
    };
    // 组内顺序是 ['研究生','硕士']，两者各出现 1 次 → 并列 → 取组内第一个
    const tiedAction: CleaningAction = {
      action: 'merge_categories',
      params: { column: '学历', groups: [['研究生', '硕士']] },
      rationale: '同一类别',
      columns: ['学历'],
    };
    const applied = applyCleaningActions(tied, [tiedAction]).dataset;
    expect(applied.columns[0]?.values).toEqual(['研究生', '研究生']);

    const script = buildPandasScript({
      dataset: tied,
      sourceFileName: 'survey.csv',
      actions: [tiedAction],
    });
    expect(script).toContain("'硕士': '研究生'");
  });

  it('trim 只作用于字符串 —— 不能用 .str.strip()，那会把数值变成 NaN', () => {
    const mixed: Dataset = {
      rowCount: 2,
      columns: [{ name: '编号', values: [' 001', 2] }],
    };
    const script = buildPandasScript({
      dataset: mixed,
      sourceFileName: 'x.csv',
      actions: [
        { action: 'trim_whitespace', params: { columns: ['编号'] }, rationale: '去空白', columns: [] },
      ],
    });
    expect(script).not.toContain('.str.strip()');
    expect(script).toContain('isinstance(v, str)');
  });

  it('填空用执行器同一套缺失判据 —— .fillna() 会漏掉空白字符串', () => {
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'x.csv',
      actions: [
        { action: 'fill_missing', params: { column: '年龄', value: 0 }, rationale: '补缺失', columns: [] },
      ],
    });
    expect(script).not.toContain('.fillna(');
    expect(script).toContain('_is_missing_cell');
  });

  it('布尔填充值渲染成 Python 的 True/False —— 小写 true 是语法错误', () => {
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'x.csv',
      actions: [
        {
          action: 'fill_missing',
          params: { column: '年龄', value: true },
          rationale: '补缺失',
          columns: [],
        },
      ],
    });
    expect(script).toContain('True');
    expect(script).not.toMatch(/\btrue\b/);
  });

  it('没有填空动作时不输出缺失判据，脚本里不留用不上的函数', () => {
    const script = buildPandasScript({ dataset, sourceFileName: 'x.csv', actions: [merge] });
    expect(script).not.toContain('_is_missing_cell');
  });

  it('去重保留首次出现的一行，且不传 subset 时按整行比较', () => {
    const withSubset = buildPandasScript({
      dataset,
      sourceFileName: 'x.csv',
      actions: [
        { action: 'remove_duplicates', params: { columns: ['学历'] }, rationale: '按学历去重', columns: [] },
      ],
    });
    expect(withSubset).toContain("drop_duplicates(subset=['学历'])");

    const withoutSubset = buildPandasScript({
      dataset,
      sourceFileName: 'x.csv',
      actions: [{ action: 'remove_duplicates', params: {}, rationale: '整行去重', columns: [] }],
    });
    expect(withoutSubset).toContain('df = df.drop_duplicates()');
  });
});

describe('CSV 导出', () => {
  it('开头写 UTF-8 BOM —— 不写的话 Excel 打开就是乱码', () => {
    expect(toCsv(dataset).startsWith('\uFEFF')).toBe(true);
  });

  it('换行用 CRLF（RFC 4180），且最后一行也带换行', () => {
    const csv = toCsv(dataset);
    expect(csv).toContain('\r\n');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('含逗号、引号、换行的字段被正确转义', () => {
    const tricky: Dataset = {
      rowCount: 2,
      columns: [{ name: '备注', values: ['含,逗号', '含"引号"\n换行'] }],
    };
    const csv = toCsv(tricky);
    expect(csv).toContain('"含,逗号"');
    expect(csv).toContain('"含""引号""\n换行"');
  });

  it('缺失值写空字段，而不是字面量 null', () => {
    const csv = toCsv({ rowCount: 1, columns: [{ name: '年龄', values: [null] }] });
    expect(csv).toContain('年龄\r\n\r\n');
    expect(csv).not.toContain('null');
  });

  it('列名与行数对得上 —— 转义出错最容易在这里暴露', () => {
    const csv = toCsv(dataset);
    const rows = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(rows).toHaveLength(dataset.rowCount + 1);
    expect(rows[0]).toBe('学历,年龄');
  });
});

describe('处理留痕', () => {
  it('基本字段齐全，时间可被解析', () => {
    const provenance = buildProvenance({
      dataset,
      applied: appliedOf([merge]),
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: '113 条', embeddingModel: 'test' },
    });
    expect(provenance.datasetFingerprint).toMatch(/^[0-9a-f]{8,}$/);
    expect(Date.parse(provenance.completedAt)).not.toBeNaN();
    expect(provenance.steps).toHaveLength(1);
    expect(provenance.generatedScript).toContain('read_csv');
  });

  it('每一步记下动作、目标列、参数与改了多少钱 —— 只看结果说不出为什么变了', () => {
    const provenance = buildProvenance({
      dataset,
      applied: appliedOf([merge]),
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: 'x', embeddingModel: 'y' },
    });
    const step = provenance.steps[0];
    expect(step?.actionType).toBe('merge_categories');
    expect(step?.targetColumns).toContain('学历');
    expect(step?.params.column).toBe('学历');
    expect(step?.changedCells).toBe(2);
    expect(step?.beforeRowCount).toBe(4);
    expect(step?.afterRowCount).toBe(4);
  });

  it('指纹对同一份数据稳定，数据变了就变', () => {
    const other: Dataset = { rowCount: 4, columns: [{ name: '学历', values: ['甲', '乙', '甲', '乙'] }] };
    expect(datasetFingerprint(dataset)).toBe(datasetFingerprint(dataset));
    expect(datasetFingerprint(dataset)).not.toBe(datasetFingerprint(other));
  });

  it('指纹与行序无关 —— 同一批数据换个顺序不该被当成另一份', () => {
    const reordered: Dataset = {
      rowCount: 4,
      columns: [
        { name: '学历', values: ['研究生', '硕士', '研究生', '硕士'] },
        { name: '年龄', values: [24, 25, null, 23] },
      ],
    };
    expect(datasetFingerprint(dataset)).toBe(datasetFingerprint(reordered));
  });

  it('没有动作时 steps 为空，但仍然产出完整的留痕', () => {
    const provenance = buildProvenance({
      dataset,
      applied: [],
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: 'x', embeddingModel: 'y' },
    });
    expect(provenance.steps).toEqual([]);
    expect(provenance.generatedScript).toContain('read_csv');
  });

  it('留痕可以被 JSON 序列化 —— 它要作为文件下载', () => {
    const provenance = buildProvenance({
      dataset,
      applied: appliedOf([merge]),
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: 'x', embeddingModel: 'y' },
    });
    expect(() => JSON.parse(JSON.stringify(provenance))).not.toThrow();
  });

  it('不把与该次清洗无关的取值写进留痕', () => {
    // 这条守的是什么，要说准：
    //   - 动作**自己点名**的取值必须出现（「把研究生并成硕士」当然要写出这两个词），
    //     否则留痕就说不清「改了什么」
    //   - 但**没被任何动作涉及的列，其取值不该被顺带带出去** ——
    //     留痕是会被分享、会被贴进报告的文件
    // 用「姓名」而不是「年龄」来测：短数字会偶然出现在指纹的十六进制里，
    // 那样测的是运气而不是行为（第一版就是这么写的，然后失败了）。
    const withNames: Dataset = {
      ...dataset,
      columns: [...dataset.columns, { name: '姓名', values: ['张三丰', '李四光', '王五常', '赵六合'] }],
    };
    const provenance = buildProvenance({
      dataset: withNames,
      applied: applyCleaningActions(withNames, [merge]).applied,
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: 'x', embeddingModel: 'y' },
    });
    const serialized = JSON.stringify(provenance);
    for (const name of ['张三丰', '李四光', '王五常', '赵六合']) {
      expect(serialized).not.toContain(name);
    }
    // 而动作点名的取值必须在 —— 否则这份留痕说不清改了什么
    expect(serialized).toContain('研究生');
    expect(serialized).toContain('硕士');
  });
});
