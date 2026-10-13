import type { CleaningAction } from '@/agent/shared/schemas';
import type { ScriptInput } from './types';

/**
 * 把清洗动作序列转成可执行的 pandas 脚本。
 *
 * **为什么它是纯字符串处理**（设计文档 §4.7）：脚本要能在用户自己的环境里跑，
 * 而任何运行时依赖都会把「可复现」变成「能在我们这儿复现」。所以这里不碰 DOM、
 * 不碰文件系统，只拼字符串。
 *
 * **为什么由同一套 `CleaningAction[]` 生成**（而不是另写一套转换逻辑）：
 * 界面执行的是这套动作、脚本生成的也是这套动作，两边同源才能保证
 * 「脚本跑出来的结果与界面显示的一致」。这是 `core` 保持平台无关那条架构决策
 * 在这里的兑现方式。
 */

/**
 * 把 Python 单引号字符串字面量里的引号与反斜杠转义。
 *
 * 中文列名很常见，含空格的列名也不少见，而**含单引号的列名同样可能出现**
 * （从 Excel 或问卷平台导出时常有）。不转义就是一份语法错误的脚本 ——
 * 而用户拿到它时不会知道问题出在哪。
 */
function pyString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** 一组取值转成 Python 列表字面量。 */
function pyList(values: string[]): string {
  return `[${values.map(pyString).join(', ')}]`;
}

function paramsOf(action: CleaningAction): Record<string, unknown> {
  return (action.params ?? {}) as Record<string, unknown>;
}

function stringParam(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function stringListParam(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function groupsParam(params: Record<string, unknown>): string[][] {
  const value = params.groups;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (group): group is string[] => Array.isArray(group) && group.every((v) => typeof v === 'string'),
  );
}

/** 一个动作 → 一段 pandas 代码。返回 null 表示这个动作不认识。 */
function renderAction(action: CleaningAction): string | null {
  const params = paramsOf(action);

  switch (action.action) {
    case 'merge_categories': {
      const column = stringParam(params, 'column');
      if (column === null) return null;
      const groups = groupsParam(params);
      if (groups.length === 0) return null;

      return groups
        .filter((group) => group.length >= 2)
        .map((group) => {
          // 与执行器同一条规则：统一成组内第一个（界面上的顺序是可解释的）
          const [winner, ...others] = group;
          if (winner === undefined) return '';
          const mapping = others.map((other) => `${pyString(other)}: ${pyString(winner)}`);
          return `df[${pyString(column)}] = df[${pyString(column)}].replace({${mapping.join(', ')}})`;
        })
        .filter((line) => line !== '')
        .join('\n');
    }

    case 'trim_whitespace': {
      const columns = stringListParam(params, 'columns');
      if (columns.length === 0) return null;
      return columns
        .map((column) => `df[${pyString(column)}] = df[${pyString(column)}].str.strip()`)
        .join('\n');
    }

    case 'fill_missing': {
      const column = stringParam(params, 'column');
      if (column === null || !('value' in params)) return null;
      const value = params.value;
      const literal =
        typeof value === 'string' ? pyString(value) : value === null ? 'None' : String(value);
      return `df[${pyString(column)}] = df[${pyString(column)}].fillna(${literal})`;
    }

    case 'remove_duplicates': {
      const columns = stringListParam(params, 'columns');
      const subset = columns.length > 0 ? `, subset=${pyList(columns)}` : '';
      return `df = df.drop_duplicates(${subset.replace(/^, /, '')})`;
    }

    default:
      return null;
  }
}

export function buildPandasScript(input: ScriptInput): string {
  const { dataset, sourceFileName, actions } = input;

  const header = [
    '#!/usr/bin/env python3',
    '# -*- coding: utf-8 -*-',
    '"""',
    '本脚本由「科研数据质量治理 Agent」生成 —— 它是界面中那次清洗的等价复现。',
    '',
    `源文件：${sourceFileName}`,
    `列：${dataset.columns.map((column) => column.name).join('、')}`,
    `行数：${dataset.rowCount}`,
    '',
    '用法：把 SOURCE 改成你的原始文件路径，然后 python 运行本脚本。',
    '"""',
    '',
    'import pandas as pd',
    '',
    `SOURCE = ${pyString(sourceFileName)}`,
    'OUTPUT = SOURCE.rsplit(".", 1)[0] + "_cleaned.csv"',
    '',
    'df = pd.read_csv(SOURCE)',
    '',
  ];

  const body: string[] = [];
  for (const action of actions) {
    const rendered = renderAction(action);
    if (rendered === null) {
      // 不认识的动作留一条注释而不是静默丢掉：脚本要能逐条对上界面上发生过什么，
      // 而「脚本比界面少做了一步」是最难发现的一类不一致
      body.push(`# 未识别的动作，未生成代码：${action.action}`);
      continue;
    }
    body.push(`# ${action.rationale}`);
    body.push(rendered);
    body.push('');
  }

  if (body.length === 0) {
    body.push('# 本次没有确认任何清洗动作，脚本只做读入与原样写出。', '');
  }

  const footer = ['df.to_csv(OUTPUT, index=False)', 'print(f"已写出 {OUTPUT}，共 {len(df)} 行")', ''];

  return [...header, ...body, ...footer].join('\n');
}
