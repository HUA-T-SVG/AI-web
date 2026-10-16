import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAllChecks, type Dataset } from '@/core';
import { scoreL1, type DefectAnswer } from './scoreL1';

/**
 * L1 评测：跑真实评测集，把指标打印出来。
 *
 * 与技术文档/答辩要的那张「量化评测表」是同一份数据。**为什么是测试而不是脚本**：
 * Node 跑不了项目的 TS（`src/core/normalize` 是无扩展名的目录导入），任何独立脚本
 * 都得把 core 的检查逻辑再抄一份 —— 而抄本与实现分叉时，评测的就不再是产品。
 * 这里直接 import `runAllChecks`，抄本在结构上不可能存在。
 *
 * 更新报告：
 *
 *   pnpm vitest run src/core/evaluate/l1Eval.test.ts
 *
 * 把输出抄进 `knowledge/reports/eval-l1.md`（表格格式在那边）。
 */

const DATASET_DIR = resolve(process.cwd(), 'knowledge/eval/dataset');

function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.trimEnd().split('\n');
  return {
    columns: lines[0]?.split(',') ?? [],
    rows: lines.slice(1).map((line) => line.split(',')),
  };
}

function loadMessy(): Dataset {
  const { columns, rows } = parseCsv(readFileSync(resolve(DATASET_DIR, 'messy-eval.csv'), 'utf8'));
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

function loadAnswers(): DefectAnswer[] {
  const parsed = JSON.parse(readFileSync(resolve(DATASET_DIR, 'answers.json'), 'utf8')) as {
    defects: DefectAnswer[];
  };
  return parsed.defects;
}

/**
 * 评测时传入的领域规则。
 *
 * 与 `range-rules` 的注入点对应：年龄 0–120。**不传就会把「值域越界」整项算成
 * 漏报** —— 而原因根本不在实现里（空规则表直接跳过）。
 */
const RANGE_RULES = [
  { id: 'eval-age', column: '年龄', min: 0, max: 120, rationale: '人类年龄的合理范围' },
];

describe('L1 评测 · 真实评测集', () => {
  it('打印每个检查项与总体的指标', () => {
    const dataset = loadMessy();
    const issues = runAllChecks(dataset, { rangeRules: RANGE_RULES });
    const answers = loadAnswers();
    const score = scoreL1(issues, answers, dataset);

    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    const lines: string[] = [];
    lines.push('');
    lines.push(`报出问题 ${issues.length} 条 · 计分答案 ${score.overall.total} 条`);
    lines.push('');
    lines.push('| checkId | 检出/总数 | 误报 | Precision | Recall |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const [kind, item] of Object.entries(score.byCheck).sort(([a], [b]) => (a < b ? -1 : 1))) {
      lines.push(
        `| ${kind} | ${item.detected}/${item.total} | ${item.falsePositives} | ` +
          `${percent(item.precision)} | ${percent(item.recall)} |`,
      );
    }
    lines.push(
      `| **总体** | **${score.overall.detected}/${score.overall.total}** | ` +
        `**${score.overall.falsePositives}** | **${percent(score.overall.precision)}** | ` +
        `**${percent(score.overall.recall)}** |`,
    );
    lines.push('');
    console.log(lines.join('\n'));

    // 这几条是**基线**：指标变化时应当先看是检查变弱了、还是答案该更新
    expect(score.overall.total).toBe(answers.filter((a) => a.scored !== false).length);
    expect(score.overall.recall).toBeGreaterThan(0.9);
    expect(score.overall.precision).toBeGreaterThan(0.3);
  });
});
