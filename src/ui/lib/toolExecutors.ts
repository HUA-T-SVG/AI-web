import type { Dataset, DatasetProfile } from '@/core';
import { listChecks, runAllChecks } from '@/core';
import { TOOL_INPUT_SCHEMAS, type ToolName } from '@/agent/toolSchemas';
import type { z } from 'zod';

export interface ToolContext {
  dataset: Dataset;
  profile: DatasetProfile;
}

export type ToolResult = { ok: true; output: unknown } | { ok: false; error: string };

type RunChecksInput = z.infer<typeof TOOL_INPUT_SCHEMAS.run_checks>;
type DescribeColumnInput = z.infer<typeof TOOL_INPUT_SCHEMAS.describe_column>;

function unknownColumnsError(unknown: string[], known: Set<string>): string {
  return `数据里没有名为「${unknown.join('、')}」的列。现有列：${[...known].join('、')}`;
}

/**
 * 在浏览器内执行一次工具调用。
 *
 * 所有输入校验都在调 core 之前完成。这些参数由大模型生成，列名与检查项
 * 标识都可能是它编出来的；放它们进 core 会抛异常，而异常穿过流式通道后
 * 只剩下「An error occurred」—— 用户既不知道哪一步错了，也不知道该怎么办。
 *
 * 所以这一层是安全边界，也是可诊断性的边界：任何失败都返回一句
 * 说清「什么不对 + 现有的是什么」的中文，让模型下一轮能自己纠正。
 */
export function executeToolCall(name: string, input: unknown, context: ToolContext): ToolResult {
  const schema = TOOL_INPUT_SCHEMAS[name as ToolName];
  if (!schema) {
    return { ok: false, error: `不认识的工具「${name}」，本次调用已跳过。` };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `工具「${name}」的输入不符合约定：${parsed.error.message}` };
  }

  const knownColumnNames = new Set(context.dataset.columns.map((column) => column.name));

  switch (name as ToolName) {
    case 'run_checks': {
      const { checkIds, columns } = parsed.data as RunChecksInput;

      const knownCheckIds = new Set(listChecks().map((check) => check.id));
      const unknownChecks = checkIds.filter((id) => !knownCheckIds.has(id));
      if (unknownChecks.length > 0) {
        return {
          ok: false,
          error: `不存在的检查项：${unknownChecks.join('、')}。当前可用：${[...knownCheckIds].join('、')}`,
        };
      }

      const unknownColumns = (columns ?? []).filter((column) => !knownColumnNames.has(column));
      if (unknownColumns.length > 0) {
        return { ok: false, error: unknownColumnsError(unknownColumns, knownColumnNames) };
      }

      // 限定列时只把这几列交给检查：行数不变，否则各列的缺失率会算错
      const target: Dataset =
        columns && columns.length > 0
          ? {
              rowCount: context.dataset.rowCount,
              columns: context.dataset.columns.filter((column) => columns.includes(column.name)),
            }
          : context.dataset;

      const issues = runAllChecks(target, { enabled: checkIds });
      return { ok: true, output: { count: issues.length, issues } };
    }

    case 'describe_column': {
      const { column } = parsed.data as DescribeColumnInput;
      const found = context.profile.columns.find((item) => item.name === column);
      if (!found) {
        return { ok: false, error: unknownColumnsError([column], knownColumnNames) };
      }
      return { ok: true, output: found };
    }
  }
}
