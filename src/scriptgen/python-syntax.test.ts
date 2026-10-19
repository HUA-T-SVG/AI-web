import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildPandasScript } from './pandas';
import type { CleaningAction, Dataset } from '@/core';

/**
 * 生成的 pandas 脚本**必须真的是合法 Python**。
 *
 * 之前这条只在一次手工验证里做过（`python -m py_compile`，交接说明 T3），没有进回归 ——
 * 而「脚本能跑」是导出功能的核心承诺：语法错一个引号，用户拿到的就是一堆没法运行的文件，
 * 而且报错发生在用户自己的环境里，我们连看都看不到。
 *
 * ## 为什么用 Python 而不是自己写个检查
 *
 * 只查「有没有未转义的引号」「括号配不配对」是**假校验**：生成器用的是模板字符串，
 * 真正的风险恰恰是模板拼出来的那些边角（列名里的引号、文件名里的反斜杠、
 * dtype 字典的写法）。唯一可信的判据是**真 Python 的解析器**，所以这里直接调它。
 *
 * ## 本机没有 Python 时
 *
 * 跳过并**明确说一句**。门禁不该绑定「本机装了什么」，但也不能假装验过了 ——
 * 这与 `agentEval` 默认跳过是同一个态度：跳过要看得见，不能静默。
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
if (python === null) {
  console.warn(
    '[scriptgen] 本机没有可用的 Python（PYTHON / python / py -3 都没探到），本次跳过 pandas 脚本语法校验。' +
      '导出脚本的合法性因此未被验证 —— 需要时装 Python 或设置 PYTHON 环境变量后重跑。',
  );
}

const scriptDir = python === null ? null : mkdtempSync(join(tmpdir(), 'pandas-script-'));

afterAll(() => {
  if (scriptDir !== null) rmSync(scriptDir, { recursive: true, force: true });
});

/** 把脚本落盘，再让 Python 的 `ast.parse` 读一遍。返回解析失败时的完整 stderr */
function spawnPythonParse(script: string, name: string) {
  if (python === null || scriptDir === null) return null;
  const path = join(scriptDir, `${name}.py`);
  writeFileSync(path, script, 'utf8');
  return spawnSync(
    python.command,
    [
      ...python.prefix,
      '-c',
      'import ast, io, sys; ast.parse(io.open(sys.argv[1], encoding="utf-8").read())',
      path,
    ],
    { encoding: 'utf8' },
  );
}

function assertPythonParses(script: string, name: string): void {
  const result = spawnPythonParse(script, name);
  if (result === null) return;
  expect(result.status, `${name} 的脚本不是合法 Python：\n${result.stderr}`).toBe(0);
}

const dataset: Dataset = {
  rowCount: 4,
  columns: [
    { name: '学历', values: ['硕士', '研究生', '硕士', '研究生'] },
    { name: '年龄', values: [23, null, 25, 24] },
    // 前导零的编号：会触发 dtype 映射，是生成器里最容易写坏的一段
    { name: '学号', values: ['001', '002', '003', '004'] },
  ],
};

const merge: CleaningAction = {
  action: 'merge_categories',
  params: { column: '学历', groups: [['硕士', '研究生']] },
  rationale: '同一类别',
  columns: ['学历'],
};

describe.skipIf(python === null)('pandas 脚本的 Python 语法校验', () => {
  it('常规清洗动作生成的脚本是合法 Python', () => {
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'messy-survey.csv',
      actions: [
        merge,
        {
          action: 'fill_missing',
          params: { column: '年龄', value: 0 },
          rationale: '补缺失',
          columns: ['年龄'],
        },
        {
          action: 'remove_duplicates',
          params: {},
          rationale: '去重',
          columns: [],
        },
      ],
    });
    assertPythonParses(script, 'normal');
  });

  it('列名里带单引号、文件名里带空格与中文，仍然是合法 Python', () => {
    const tricky: Dataset = {
      rowCount: 1,
      columns: [
        { name: "备注'栏", values: ['甲'] },
        { name: '最 高 学 历', values: ['硕士'] },
      ],
    };
    const script = buildPandasScript({
      dataset: tricky,
      sourceFileName: '我的 数据 (最终版).csv',
      actions: [
        {
          action: 'trim_whitespace',
          params: { columns: ["备注'栏", '最 高 学 历'] },
          rationale: '去空白',
          columns: ["备注'栏", '最 高 学 历'],
        },
      ],
    });
    assertPythonParses(script, 'quotes-and-spaces');
  });

  it('Excel 来源与没有动作的空脚本也合法 —— 空脚本同样会被用户打开', () => {
    const excel = buildPandasScript({
      dataset,
      sourceFileName: '成绩 表.xlsx',
      actions: [],
    });
    assertPythonParses(excel, 'excel-empty-actions');
  });

  it('非改写类动作（review_*）不会把脚本写坏', () => {
    const review: CleaningAction = {
      action: 'review_unit_family',
      params: {},
      rationale: '单位可能不一致',
      columns: ['年龄'],
    };
    const script = buildPandasScript({
      dataset,
      sourceFileName: 'x.csv',
      actions: [review],
    });
    assertPythonParses(script, 'review-only');
  });

  it('这道门禁真的会红：故意写坏一个脚本时 Python 必须报错', () => {
    // 一条没验证过会红的门禁，和没有门禁是一回事。这里拿一个确定非法的片段
    // 走同一条调用路径，确认「解析失败」这条通道本身是通的。
    const broken = spawnPythonParse("df = df['未闭合的引号\n", 'broken');
    expect(broken?.status).not.toBe(0);
  });
});
