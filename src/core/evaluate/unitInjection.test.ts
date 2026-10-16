import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAllChecks, type Dataset } from '@/core';

/**
 * 探针：**单位注入是否同时构成类型冲突**。
 *
 * 背景：`messy-eval.csv` 的 `剂量` 列既被注入「混入文本」（未知/未测/待补），
 * 又被注入「单位混用」（5mg/10MG/0.5g/500mg）。后者把带单位的字符串放进
 * 数值列，而 `type-consistency` 的判据正是「数值列里混进非数值」——
 * 于是它报的 7 行里，有 4 行来自单位注入。
 *
 * 这不是实现错，是**答案漏记**：漏记的那几条会在 Task 2 里被算成误报，
 * 让 Precision 假性偏低。这条测试把两者钉在一起，免得以后谁改了注入值、
 * 忘了同步答案。
 */
const DATASET_DIR = resolve(process.cwd(), 'knowledge/eval/dataset');

function loadMessy(): Dataset {
  const lines = readFileSync(resolve(DATASET_DIR, 'messy-eval.csv'), 'utf8').trimEnd().split('\n');
  const columns = lines[0]!.split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
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

describe('剂量列：单位注入必然同时构成类型冲突', () => {
  it('type-consistency 在「剂量」上报的行 = 混入文本的行 ∪ 带单位的行', () => {
    const issues = runAllChecks(loadMessy(), { enabled: ['type-consistency'] });
    // 只看「剂量」列：`编号` 列也有类型注入（那是另一条计分缺陷）
    const reported = issues
      .filter((issue) => issue.evidence.columns.includes('剂量'))
      .flatMap((issue) => issue.evidence.rowIndices ?? [])
      .sort((a, b) => a - b);
    // 3 行混入文本（未知/未测/待补）+ 4 行带单位（5mg/10MG/0.5g/500mg） = 7
    expect(reported).toEqual([5, 7, 31, 55, 60, 90, 700]);
  });

  it('这是真信号而不是误报：被报的那 7 行在「剂量」列上都不是纯数字', () => {
    const dataset = loadMessy();
    const dose = dataset.columns.find((column) => column.name === '剂量');
    expect(dose).toBeDefined();
    // 底表的剂量是 40–100 的整数（不带单位）。所以「不是纯数字」就等于「被注入过」
    const nonNumeric = (dose?.values ?? [])
      .map((value, index) => ({ value, index }))
      .filter((item) => item.value !== null && !/^\d+$/.test(String(item.value)))
      .map((item) => item.index);
    expect(nonNumeric.sort((a, b) => a - b)).toEqual([5, 7, 31, 55, 60, 90, 700]);
  });
});
