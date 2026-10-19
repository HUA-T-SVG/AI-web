import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyCleaningActions, type CleaningAction, type Dataset } from '@/core';
import { parseCsv } from '@/parser/csv';
import { buildPandasScript } from './pandas';

/**
 * 生成的 pandas 脚本**跑出来的数据**必须与界面执行器的结果逐格一致。
 *
 * 语法合法只是底线（见 `python-syntax.test.ts`）；这个文件回答的是更难的问题：
 * 同一份 CSV、同一串清洗动作，脚本跑完与界面显示的是不是同一份数据。它需要
 * **真的 pandas**，所以默认在没装 pandas 的机器上跳过（与 `eval:agent` 同一态度：
 * 跳过要看得见）。
 *
 * 本文件是被 T7 逼出来的：`keep_default_na` 一改，空值与 "NA" 字面值的语义同时在动，
 * 而「改了之后还等价吗」只能用真 pandas 回答 —— 读注释推不出来。
 *
 * 覆盖的正是最容易分叉的四处：
 *   1. `"NA"/"NULL"` 字面值不能被当成缺失（T7）
 *   2. 空字段必须被当成缺失（否则 fill_missing 会漏）
 *   3. 前导零列以文本读回（`dtype`）
 *   4. 解析层会 trim：`" 001 "` 在界面里是 `001`，脚本也必须是
 */

interface Python {
  command: string;
  prefix: string[];
}

function findPython(): Python | null {
  const candidates: Python[] = [];
  if (process.env.PYTHON) candidates.push({ command: process.env.PYTHON, prefix: [] });
  candidates.push({ command: 'python', prefix: [] });
  candidates.push({ command: 'py', prefix: ['-3'] });

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.prefix, '-c', 'import sys'], {
      stdio: 'ignore',
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const python = findPython();
const hasPandas =
  python !== null &&
  spawnSync(python.command, [...python.prefix, '-c', 'import pandas'], { stdio: 'ignore' })
    .status === 0;

if (!hasPandas) {
  console.warn(
    '[scriptgen] 本机没有可用的 pandas，跳过「脚本输出与界面执行器逐格对比」。' +
      '装了 pandas（或 PYTHONPATH 指向有 pandas 的目录）后重跑即可。',
  );
}

const workDir = hasPandas ? mkdtempSync(join(tmpdir(), 'pandas-runtime-')) : null;

afterAll(() => {
  if (workDir !== null) rmSync(workDir, { recursive: true, force: true });
});

/** 与界面里看到的一致：空字段是 null，不是空字符串；" 001 " 已经被解析层 trim 成 "001" */
const FIXTURE = [
  '学号,学历,年龄,备注',
  ' 001 ,硕士,23,NA',
  '002,研究生,,NULL',
  '001,硕士,25,N/A',
  ' ,研究生,30,',
  '',
].join('\n');

const ACTIONS: CleaningAction[] = [
  {
    action: 'fill_missing',
    params: { column: '年龄', value: 0 },
    rationale: '年龄缺失用 0 标记',
    columns: ['年龄'],
  },
  {
    action: 'merge_categories',
    params: { column: '学历', groups: [['硕士', '研究生']] },
    rationale: '同一类别',
    columns: ['学历'],
  },
  {
    action: 'remove_duplicates',
    params: { columns: ['学号'] },
    rationale: '学号重复',
    columns: ['学号'],
  },
];

function parseFixture(text: string, fileName: string): Dataset {
  const bytes = Buffer.from(text, 'utf8');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const result = parseCsv({ buffer, fileName, fileSize: bytes.byteLength });
  if ('kind' in result) throw new Error(`fixture 解析失败：${result.message}`);
  return result.dataset;
}

/** 数值/字符串在两边表示不同（0 vs '0'），比较前统一成字符串；null 单独标记 */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'number' && Number.isNaN(value)) return '∅';
  return String(value);
}

function rowsOf(dataset: Dataset): string[][] {
  return Array.from({ length: dataset.rowCount }, (_, row) =>
    dataset.columns.map((column) => canonical(column.values[row])),
  );
}

describe.skipIf(!hasPandas)('pandas 脚本的运行结果与界面执行器一致', () => {
  it('同一份 CSV + 同一串动作，脚本输出与执行器结果逐格相同', () => {
    const dataset = parseFixture(FIXTURE, 'fixture.csv');
    const executed = applyCleaningActions(dataset, ACTIONS).dataset;

    const script = buildPandasScript({
      dataset,
      sourceFileName: 'fixture.csv',
      actions: ACTIONS,
    });
    writeFileSync(join(workDir!, 'fixture.csv'), FIXTURE, 'utf8');
    writeFileSync(join(workDir!, 'clean.py'), script, 'utf8');

    const run = spawnSync(python!.command, [...python!.prefix, 'clean.py'], {
      cwd: workDir!,
      encoding: 'utf8',
    });
    expect(run.status, `脚本运行失败：\n${run.stderr}`).toBe(0);

    const output = readFileSync(join(workDir!, 'fixture_cleaned.csv'));
    const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    const parsedOutput = parseCsv({
      buffer,
      fileName: 'fixture_cleaned.csv',
      fileSize: output.byteLength,
    });
    if ('kind' in parsedOutput) throw new Error(`输出解析失败：${parsedOutput.message}`);

    // 先确认 fixture 真的造出了分歧点，否则「两边都是空」也会通过
    expect(dataset.columns.map((column) => column.name)).toEqual(
      executed.columns.map((column) => column.name),
    );
    expect(dataset.columns.find((c) => c.name === '备注')?.values).toContain('NULL');
    expect(dataset.rowCount).toBeGreaterThan(executed.rowCount);

    expect(rowsOf(parsedOutput.dataset)).toEqual(rowsOf(executed));

    // 单独把 T7 的分歧点钉一次：'NA' 与 'NULL' 在两边都必须是文本
    const remark = (data: Dataset) =>
      data.columns.find((column) => column.name === '备注')?.values ?? [];
    expect(remark(parsedOutput.dataset)).toEqual(remark(executed));
    expect(remark(parsedOutput.dataset)).toContain('NA');
    expect(remark(parsedOutput.dataset)).toContain('NULL');
  });
});
