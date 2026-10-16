import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAllChecks, type Dataset, type QualityIssue } from '@/core';

/**
 * 评测数据集的**语义**验证。
 *
 * 数据集是「注入已知缺陷 + 记录标准答案」，所以有两件事必须成立，缺一件整套评测
 * 就没有意义：
 *
 *   1. **底表真的干净** —— 它跑 `runAllChecks` 必须一条问题都不报。不成立的话，
 *      评测的「误报」里会混进底表自带的噪声，而那是我们自己的数据问题、不是
 *      被测实现的错。
 *   2. **注入了的缺陷真的会被检出** —— 这条现在就该通过（它是**当前实现**的基线），
 *      所以它同时是「检出率基线」：以后谁把某检查改弱了，这里会红。
 *
 * 为什么不做成 `injector.mjs` 的自测：那要 import 项目的 TS，而 Node 跑不了
 * `src/core`（无扩展名的目录导入）。硬要为它造一条路径，就会有人去「抄一份 core」
 * —— 标准答案与实现同源，正是评测最该避免的自欺。
 *
 * 数据是真源，测试不重新生成它：`injector.mjs --write` 是唯一的产出者，
 * 这里只读。要改数据集就改 `defects.json` 再重跑那个命令。
 */

const DATASET_DIR = resolve(process.cwd(), 'knowledge/eval/dataset');

/** 极简 CSV 读取：评测集是自己的脚本生成的，格式受控（引号只在必要时出现）。 */
function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.trimEnd().split('\n');
  const cells = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const ch = line[index];
      if (quoted) {
        if (ch === '"' && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else if (ch === '"') quoted = false;
        else current += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        out.push(current);
        current = '';
      } else current += ch;
    }
    out.push(current);
    return out;
  };
  const columns = cells(lines[0] ?? '');
  const rows = lines.slice(1).map(cells);
  return { columns, rows };
}

/** 空单元格读成 null，与解析层的行为一致 —— 空字符串与「没有值」在 core 里等价。 */
function toDataset(columns: string[], rows: string[][]): Dataset {
  return {
    rowCount: rows.length,
    columns: columns.map((name, index) => ({
      name,
      values: rows.map((row) => {
        const cell = row[index] ?? '';
        return cell === '' ? null : cell;
      }),
    })),
  };
}

interface Answer {
  kind: string;
  /** `column` 是列级（core 不给行号），`row` 是行级，`table` 是整表级 */
  scope: 'column' | 'row' | 'table';
  row?: number;
  /**
   * 重复对记的是**一对行号**（原行 + 复制行）。
   *
   * 不记单个复制行，是因为同一处重复在问题的 `rowIndices` 里列哪几行取决于分桶
   * 顺序：实测「复制 400/401 两行」时检出的证据是 `[401, 1001]` —— 把 400/1000
   * 那一对合进了同一个桶（两行只差学号一位数字）。判据放宽成「这一对里有一行
   * 落在证据里」，那才是「这处重复被发现了」的准确表述。
   */
  relatesRows?: number[];
  column?: string;
  injected?: string;
  scored?: boolean;
}

/**
 * 判断一条问题是否覆盖了某条答案。
 *
 * **口径跟着 scope 走**，这一点踩过一次：`missing` 是列级问题（core 一条问题覆盖
 * 整列、证据里不给 `rowIndices`），而答案起初按单元格记了 200 条并强制匹配行号，
 * 测出来「200 处漏报」—— 漏的其实是评分口径，不是实现。
 */
function covers(issue: QualityIssue, answer: Answer): boolean {
  if (issue.checkId !== answer.kind) return false;
  if (answer.scope === 'table') return true;
  if (answer.column !== undefined && !issue.evidence.columns.includes(answer.column)) return false;
  if (answer.scope === 'column') return true;

  const rows = issue.evidence.rowIndices ?? [];
  // 重复对：任一行落在证据里即算这处被发现
  if (answer.relatesRows !== undefined) {
    if (rows.length === 0) return true;
    return answer.relatesRows.some((row) => rows.includes(row));
  }
  return answer.row === undefined || rows.length === 0 || rows.includes(answer.row);
}

/**
 * 评测时传入的领域规则。
 *
 * 与 `range-rules` 的注入点对应：年龄 0–120。不传规则时 range-rules 会拿到空规则表
 * 直接跳过 —— 那样「值域越界」这一项永远算漏报，而原因根本不在实现里。
 */
const RANGE_RULES = [{ id: 'eval-age', column: '年龄', min: 0, max: 120, rationale: '人类年龄的合理范围' }];

function loadBase(): Dataset {
  const { columns, rows } = parseCsv(readFileSync(resolve(DATASET_DIR, 'base-clean.csv'), 'utf8'));
  return toDataset(columns, rows);
}

function loadMessy(): Dataset {
  const { columns, rows } = parseCsv(readFileSync(resolve(DATASET_DIR, 'messy-eval.csv'), 'utf8'));
  return toDataset(columns, rows);
}

function loadAnswers(): Answer[] {
  const parsed = JSON.parse(readFileSync(resolve(DATASET_DIR, 'answers.json'), 'utf8')) as {
    defects: Answer[];
  };
  return parsed.defects;
}

describe('评测数据集 · 底表必须干净', () => {
  it('干净底表跑全量检查一条问题都不报', () => {
    const issues = runAllChecks(loadBase(), { rangeRules: RANGE_RULES });

    // 失败时把问题清单打出来 —— 否则只看到「expected 0 to be 3」，
    // 还得自己去猜是哪一列哪一项
    expect(
      issues.map((issue) => `${issue.checkId}：${issue.title}`),
      '底表不干净：评测的「误报」里会混进底表自带的噪声',
    ).toEqual([]);
  });

  it('底表 1000 行 × 11 列，且没有空单元格', () => {
    const base = loadBase();
    expect(base.rowCount).toBe(1000);
    // 11 列：学号/年龄/性别/学历/组别/身高/剂量/备注/日期/编号/多选
    expect(base.columns).toHaveLength(11);
    for (const column of base.columns) {
      const missing = column.values.filter((value) => value === null).length;
      expect(missing, `底表「${column.name}」有 ${missing} 个空值`).toBe(0);
    }
  });
});

describe('评测数据集 · 注入的缺陷能被检出（检出率基线）', () => {
  it('计分缺陷每一条都能在检查结果里找到覆盖它的问题', () => {
    const issues = runAllChecks(loadMessy(), { rangeRules: RANGE_RULES });
    const answers = loadAnswers().filter((answer) => answer.scored !== false);

    const misses: string[] = [];
    for (const answer of answers) {
      if (!issues.some((issue) => covers(issue, answer))) {
        misses.push(`${answer.kind} @ 第 ${answer.row ?? '列级'} 行「${answer.column ?? '表级'}」`);
      }
    }

    // 这一条是**当前实现的检出率基线**。它红了有两种可能：检查真的变弱了，
    // 或者答案与数据的对应关系写错了 —— 两种都得查，不能直接改期望值
    expect(misses, `有 ${misses.length} 处计分缺陷未被检出`).toEqual([]);
  });

  it('刻意低于阈值的对照项不被报告（scored=false）', () => {
    const issues = runAllChecks(loadMessy(), { rangeRules: RANGE_RULES });
    // 「备注」10%、「组别」15%、「多选」8% —— 三条都低于 missing 的 0.2 阈值
    for (const column of ['备注', '组别', '多选']) {
      const reported = issues.some(
        (issue) => issue.checkId === 'missing' && issue.evidence.columns.includes(column),
      );
      expect(reported, `「${column}」的缺失率低于阈值，不该被报`).toBe(false);
    }
  });

  it('低于阈值的对照项一旦真的报了，会被算成误报 —— 所以它们必须留在答案里', () => {
    // 这条守的是「对照项不能被悄悄删掉」：它们没有检出价值，但有**误报**价值。
    // 删掉之后，把 10% 缺失也报出来的实现会得到满分的 Precision。
    const answers = loadAnswers();
    const controls = answers.filter((answer) => answer.scored === false);
    expect(controls.length).toBeGreaterThanOrEqual(4);
    expect(answers.filter((answer) => answer.scored !== false).length).toBeGreaterThan(0);
  });
});
