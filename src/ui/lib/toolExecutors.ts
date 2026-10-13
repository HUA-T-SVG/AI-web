import type { Dataset, DatasetProfile } from '@/core';
import { listChecks, runAllChecks } from '@/core';
import { TOOL_INPUT_SCHEMAS, type ToolName } from '@/agent/shared/toolSchemas';
import { columnDetailForModel, issueForModel } from '@/agent/shared/outbound';
import type { z } from 'zod';

export interface ToolContext {
  dataset: Dataset;
  profile: DatasetProfile;
}

export type ToolResult = { ok: true; output: unknown } | { ok: false; error: string };

type RunChecksInput = z.infer<typeof TOOL_INPUT_SCHEMAS.run_checks>;
type DescribeColumnInput = z.infer<typeof TOOL_INPUT_SCHEMAS.describe_column>;
type SubmitIssueInput = z.infer<typeof TOOL_INPUT_SCHEMAS.submit_issue>;

function unknownColumnsError(unknown: string[], known: Set<string>): string {
  return `数据里没有名为「${unknown.join('、')}」的列。现有列：${[...known].join('、')}`;
}

/** runAllChecks 在单个检查失败时会产出这个诊断问题，它不是「可用检查项」之一 */
const DIAGNOSTIC_CHECK_ID = 'check-failed';

/**
 * 在浏览器内执行一次工具调用。
 *
 * 这一层有两个身份，都很关键：
 *
 * **它是安全边界。** 参数由大模型生成，列名与检查项标识都可能是它编出来的；
 * 放它们进 core 会抛异常，而异常穿过流式通道后只剩下「An error occurred」——
 * 用户既不知道哪一步错了，也不知道该怎么办。所以每种失败都返回一句
 * 说清「什么不对 + 现有的是什么」的中文，让模型下一轮能自己纠正。
 *
 * **它也是出站边界。** 工具结果会经 addToolOutput 回填进 UI 消息，下次请求
 * 随 messages 上行 —— 那是原始数据离开浏览器的第二条通道。所以返回值一律
 * 经 outbound.ts 白名单重建，绝不把 core 的原始结构直接交出去。
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
  const knownCheckIds = new Set([...listChecks().map((check) => check.id), DIAGNOSTIC_CHECK_ID]);

  switch (name as ToolName) {
    case 'run_checks': {
      const { checkIds, columns } = parsed.data as RunChecksInput;

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
      // 过一层白名单：core 为了让界面能展示证据，会在统计量里带上原始取值
      return { ok: true, output: { count: issues.length, issues: issues.map(issueForModel) } };
    }

    case 'describe_column': {
      const { column } = parsed.data as DescribeColumnInput;
      const found = context.profile.columns.find((item) => item.name === column);
      if (!found) {
        return { ok: false, error: unknownColumnsError([column], knownColumnNames) };
      }
      // 列画像里的 samples 是非缺失值的前五个原文，必须换成形状才能出门
      return { ok: true, output: columnDetailForModel(found) };
    }

    case 'submit_issue': {
      const issue = parsed.data as SubmitIssueInput;

      // 检查项标识与列名都要校验：编造的值会以「已核实的检查结论」出现在
      // 审阅列表里，用户会照着它去执行清洗，而它根本没有依据
      if (!knownCheckIds.has(issue.checkId)) {
        return {
          ok: false,
          error: `不存在的检查项「${issue.checkId}」。当前可用：${[...knownCheckIds].join('、')}`,
        };
      }

      const referenced = [...issue.columns, ...issue.suggestion.columns];
      const unknownColumns = [...new Set(referenced)].filter(
        (column) => !knownColumnNames.has(column),
      );
      if (unknownColumns.length > 0) {
        return { ok: false, error: unknownColumnsError(unknownColumns, knownColumnNames) };
      }

      return { ok: true, output: issue };
    }
  }
}
