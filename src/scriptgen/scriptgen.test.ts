import { describe, expect, it } from 'vitest';
import { buildPandasScript } from './pandas';
import { toCsv } from './csv';
import { buildProvenance, datasetFingerprint } from './provenance';
import {
  applyCleaningActions,
  type AppliedAction,
  type CleaningAction,
  type Dataset,
} from '@/core';

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
    expect(script).toContain('.replace(');
    expect(script).toContain('研究生');
    expect(script).toContain('硕士');
  });

  it('连续归并按执行时记录的方向重放，不拿最终数据重算', () => {
    // 界面执行：a,b,b,c,c,c,c → 先并 a/b（b 胜）→ 再并 b/c（c 胜）→ 全 c。
    // 旧脚本拿最终数据重算第一步，会给 a/b 都记 0 次、选组内第一个 a，
    // 于是脚本结果是三个 a + 四个 c —— 与界面不一致。
    const original: Dataset = {
      rowCount: 7,
      columns: [{ name: '类别', values: ['a', 'b', 'b', 'c', 'c', 'c', 'c'] }],
    };
    const steps = applyCleaningActions(original, [
      {
        action: 'merge_categories',
        params: { column: '类别', groups: [['a', 'b']] },
        rationale: '先把 a 并到 b',
        columns: ['类别'],
      },
      {
        action: 'merge_categories',
        params: { column: '类别', groups: [['b', 'c']] },
        rationale: '再把 b 并到 c',
        columns: ['类别'],
      },
    ]);

    const script = buildPandasScript({
      dataset: steps.dataset,
      sourceFileName: 'x.csv',
      actions: steps.applied.map((step) => step.action),
      applied: steps.applied,
    });

    expect(script).toContain("'a': 'b'");
    expect(script).toContain("'b': 'c'");
    // 绝不能出现旧实现算出的反方向
    expect(script).not.toContain("'b': 'a'");

    // 按脚本的 replace 顺序在内存里重放一遍，最终必须与界面一致
    let replayed = [...original.columns[0]!.values];
    for (const step of steps.applied) {
      for (const group of step.mergeResolution?.groups ?? []) {
        replayed = replayed.map((value) =>
          typeof value === 'string' && value in group.mapping ? group.mapping[value]! : value,
        );
      }
    }
    expect(new Set(replayed)).toEqual(new Set(['c']));
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
        {
          action: 'trim_whitespace',
          params: { columns: ["备注'栏"] },
          rationale: '去空白',
          columns: [],
        },
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

  describe('读入口径：只有空字段才是缺失（T7）', () => {
    /** 含 "NA"/"N/A"/"NULL" 字面值与空字段的数据集（与界面里看到的一致） */
    const withNaText: Dataset = {
      rowCount: 3,
      columns: [
        { name: '备注', values: ['NA', null, 'NULL'] },
        { name: '年龄', values: [23, null, 25] },
      ],
    };

    it('关掉 pandas 的默认缺失值表，只认空字段为缺失', () => {
      const script = buildPandasScript({
        dataset: withNaText,
        sourceFileName: 'x.csv',
        actions: [],
      });

      // 不这么写，"NA"/"N/A"/"NULL" 会被 pandas 读成缺失 —— 界面里它们是普通文本，
      // 于是脚本跑出来的数据与界面看到的不是同一份
      expect(script).toContain('keep_default_na=False');
      expect(script).toContain('na_values=[""]');
      // Excel 与 CSV 两条路都要带上，只在一条上修等于没修
      expect(script.match(/keep_default_na=False/g)).toHaveLength(2);
    });

    it('读入后按解析层的口径规范化一次：trim，空串转缺失', () => {
      const script = buildPandasScript({
        dataset: withNaText,
        sourceFileName: 'x.csv',
        actions: [],
      });

      // 解析层（csv.ts / excel.ts）对每个字段 trim、空串转 null，pandas 不做 ——
      // 不补这一步，" 001 " 与纯空白字段的等价性仍差一截
      expect(script).toContain('_normalize_cell');
      expect(script).toContain('df[_column].map(_normalize_cell)');
    });
  });

  describe('读回时保留前导零（学号、编号这类字段）', () => {
    /** 学号是文本列：'001' 在界面里是字符串，pandas 默认会读成数字 1 */
    const withIdColumn: Dataset = {
      rowCount: 3,
      columns: [
        { name: '学号', values: ['001', '002', '010'] },
        { name: '成绩', values: [90, 85, 77] },
      ],
    };

    it('会把前导零改掉的列，必须以文本读回', () => {
      const script = buildPandasScript({
        dataset: withIdColumn,
        sourceFileName: 'x.csv',
        actions: [],
      });

      // 只看列名不够：真正决定行为的是 dtype。少了它，用户本机跑出来是 1,2,10
      expect(script).toContain("'学号': str");
      expect(script).toContain('dtype=');
    });

    it('数值列不跟着被改成文本 —— 一刀切 dtype=str 会改掉写出结果', () => {
      const script = buildPandasScript({
        dataset: withIdColumn,
        sourceFileName: 'x.csv',
        actions: [],
      });

      // '成绩' 读成字符串再写出，与界面里的数值不是一回事（比较、舍入、空值都会变）
      expect(script).not.toContain("'成绩': str");
    });

    it('不需要保留文本时，读入语句不带 dtype —— 不生成用户看不懂的多余参数', () => {
      const clean: Dataset = {
        rowCount: 2,
        columns: [
          { name: '成绩', values: [90, 85] },
          { name: '学历', values: ['硕士', '博士'] },
        ],
      };
      const script = buildPandasScript({ dataset: clean, sourceFileName: 'x.csv', actions: [] });

      expect(script).not.toContain('dtype=');
    });

    it('文本列同样按扩展名走 read_excel，Excel 后缀也要保留前导零', () => {
      const script = buildPandasScript({
        dataset: withIdColumn,
        sourceFileName: 'x.xlsx',
        actions: [],
      });

      expect(script).toContain('read_excel');
      expect(script).toContain("'学号': str");
    });

    it('列名里的单引号在 dtype 字典里也要转义', () => {
      const quoted: Dataset = {
        rowCount: 1,
        columns: [{ name: "编号'栏", values: ['001'] }],
      };
      const script = buildPandasScript({ dataset: quoted, sourceFileName: 'x.csv', actions: [] });

      expect(script).toContain("'编号\\'栏': str");
    });

    it('科学计数法这类写法也要以文本读回 —— pandas 会把它展开成 1000', () => {
      const scientific: Dataset = {
        rowCount: 2,
        columns: [{ name: '编号', values: ['1e3', '2e3'] }],
      };
      const script = buildPandasScript({
        dataset: scientific,
        sourceFileName: 'x.csv',
        actions: [],
      });

      expect(script).toContain("'编号': str");
    });
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
        {
          action: 'trim_whitespace',
          params: { columns: ['编号'] },
          rationale: '去空白',
          columns: [],
        },
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
        {
          action: 'fill_missing',
          params: { column: '年龄', value: 0 },
          rationale: '补缺失',
          columns: [],
        },
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
        {
          action: 'remove_duplicates',
          params: { columns: ['学历'] },
          rationale: '按学历去重',
          columns: [],
        },
      ],
    });
    expect(withSubset).toContain("_dedupe_columns = ['学历']");
    expect(withSubset).toContain('_dedupe_key');
    expect(withSubset).toContain('df = df[~_dedupe_keys.duplicated()]');
    // 不能退回 drop_duplicates：那会把数字 1 与文本 "1" 按 pandas 的相等规则混在一起
    expect(withSubset).not.toContain('drop_duplicates');

    const withoutSubset = buildPandasScript({
      dataset,
      sourceFileName: 'x.csv',
      actions: [{ action: 'remove_duplicates', params: {}, rationale: '整行去重', columns: [] }],
    });
    expect(withoutSubset).toContain('_dedupe_columns = list(df.columns)');
    expect(withoutSubset).toContain('df = df[~_dedupe_keys.duplicated()]');
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
    const rows = csv
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n');
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
    const other: Dataset = {
      rowCount: 4,
      columns: [{ name: '学历', values: ['甲', '乙', '甲', '乙'] }],
    };
    expect(datasetFingerprint(dataset)).toBe(datasetFingerprint(dataset));
    expect(datasetFingerprint(dataset)).not.toBe(datasetFingerprint(other));
  });

  it('归并的实际方向写进留痕与导出脚本', () => {
    const original: Dataset = {
      rowCount: 7,
      columns: [{ name: '类别', values: ['a', 'b', 'b', 'c', 'c', 'c', 'c'] }],
    };
    const first: CleaningAction = {
      action: 'merge_categories',
      params: { column: '类别', groups: [['a', 'b']] },
      rationale: '先把 a 并到 b',
      columns: ['类别'],
    };
    const second: CleaningAction = {
      action: 'merge_categories',
      params: { column: '类别', groups: [['b', 'c']] },
      rationale: '再把 b 并到 c',
      columns: ['类别'],
    };
    const result = applyCleaningActions(original, [first, second]);

    const provenance = buildProvenance({
      dataset: result.dataset,
      original,
      applied: result.applied,
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: 'x', embeddingModel: 'y' },
    });

    expect(provenance.steps[0]?.mergeResolution).toEqual({
      column: '类别',
      groups: [{ winner: 'b', mapping: { a: 'b' } }],
    });
    expect(provenance.steps[1]?.mergeResolution).toEqual({
      column: '类别',
      groups: [{ winner: 'c', mapping: { b: 'c' } }],
    });
    expect(provenance.generatedScript).toContain("'a': 'b'");
    expect(provenance.generatedScript).toContain("'b': 'c'");
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

  it('指纹与列序无关 —— 同一张表调整列顺序仍算同一份', () => {
    const reorderedColumns: Dataset = {
      rowCount: dataset.rowCount,
      columns: [dataset.columns[1]!, dataset.columns[0]!],
    };
    expect(datasetFingerprint(dataset)).toBe(datasetFingerprint(reorderedColumns));
  });

  it('同一列的值被分配给不同记录时必须能识别出来', () => {
    // 这正是旧实现的漏洞：按列分别排序后取哈希，只保留「每列取值多重集」，
    // 行与行之间的对应关系丢了。下面两份数据编号相同、分数只是交换了归属，
    // 但显然是两份不同的表（张三考了 80 还是 90）。
    const scores: Dataset = {
      rowCount: 2,
      columns: [
        { name: '编号', values: ['001', '002'] },
        { name: '分数', values: [90, 80] },
      ],
    };
    const swapped: Dataset = {
      rowCount: 2,
      columns: [
        { name: '编号', values: ['001', '002'] },
        { name: '分数', values: [80, 90] },
      ],
    };

    expect(datasetFingerprint(scores)).not.toBe(datasetFingerprint(swapped));
  });

  it('指纹保留取值类型 —— 数字 1、字符串 "1"、null 与字符串 "null" 不能混为一谈', () => {
    const asNumber: Dataset = { rowCount: 1, columns: [{ name: '值', values: [1] }] };
    const asString: Dataset = { rowCount: 1, columns: [{ name: '值', values: ['1'] }] };
    const asNull: Dataset = { rowCount: 1, columns: [{ name: '值', values: [null] }] };
    const asNullText: Dataset = { rowCount: 1, columns: [{ name: '值', values: ['null'] }] };

    expect(datasetFingerprint(asNumber)).not.toBe(datasetFingerprint(asString));
    expect(datasetFingerprint(asNull)).not.toBe(datasetFingerprint(asNullText));
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

  it('人工决定与理由进 JSON 留痕 —— 被拒绝的建议不在 steps，但必须留下原因', () => {
    // 界面文案承诺「动作、人工决定与数据指纹」。steps 只装真正执行的动作，
    // 拒绝/只写理由的建议不会进去；不单独记 decisions，导出的文件就缺了「为什么」。
    const provenance = buildProvenance({
      dataset,
      applied: appliedOf([merge]),
      decisions: [
        {
          title: '学历列有同义写法',
          severity: 'medium',
          decision: 'modified',
          note: '按团队口径合并成两组',
          suggestionAction: 'merge_categories',
          suggestionRationale: '同义写法应归并',
          suggestionParams: { column: '学历' },
          overrideAction: 'merge_categories',
          overrideParams: { column: '学历', groups: [['硕士', '研究生']] },
        },
        {
          title: '年龄列有越界取值',
          severity: 'high',
          decision: 'rejected',
          note: '999 是缺失编码，保留原值',
          suggestionAction: 'review_range_violations',
          suggestionRationale: '需人工核对',
          suggestionParams: {},
        },
      ],
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: 'x', embeddingModel: 'y' },
    });

    const parsed = JSON.parse(JSON.stringify(provenance)) as {
      decisions: { decision: string; note: string | null; overrideAction?: string }[];
    };
    expect(parsed.decisions).toHaveLength(2);
    expect(parsed.decisions[0]).toMatchObject({
      decision: 'modified',
      note: '按团队口径合并成两组',
      overrideAction: 'merge_categories',
    });
    expect(parsed.decisions[1]).toMatchObject({
      decision: 'rejected',
      note: '999 是缺失编码，保留原值',
    });
  });

  it('没有人工决定时 decisions 是空数组，不是缺字段', () => {
    const provenance = buildProvenance({
      dataset,
      applied: [],
      sessionStartedAt: '2026-10-13T00:00:00.000Z',
      environment: { appVersion: '0.1.0', ruleLibraryVersion: 'x', embeddingModel: 'y' },
    });
    expect(provenance.decisions).toEqual([]);
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
      columns: [
        ...dataset.columns,
        { name: '姓名', values: ['张三丰', '李四光', '王五常', '赵六合'] },
      ],
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
