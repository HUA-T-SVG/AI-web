import type { Dataset, DatasetProfile } from '@/core';
import { listChecks, runAllChecks } from '@/core';
import { TOOL_INPUT_SCHEMAS, type ToolName } from '@/agent/shared/toolSchemas';
import type { CheckPlan } from '@/agent/shared/schemas';
import { columnDetailForModel, issueForModel, ruleHitForModel } from '@/agent/shared/outbound';
import { loadRuleIndex, RuleIndexUnavailableError } from '@/knowledge/loadRules';
import { retrieveRules } from '@/knowledge/retrieve';
import { embedder } from '@/embedding/instance';
import { MODEL_ID } from '@/embedding/loadModel';
import type { z } from 'zod';

export interface ToolContext {
  dataset: Dataset;
  profile: DatasetProfile;
}

export type ToolResult = { ok: true; output: unknown } | { ok: false; error: string };

type RunChecksInput = z.infer<typeof TOOL_INPUT_SCHEMAS.run_checks>;
type DescribeColumnInput = z.infer<typeof TOOL_INPUT_SCHEMAS.describe_column>;
type SubmitIssueInput = z.infer<typeof TOOL_INPUT_SCHEMAS.submit_issue>;
type PlanChecksInput = z.infer<typeof TOOL_INPUT_SCHEMAS.plan_checks>;
type QueryRulesInput = z.infer<typeof TOOL_INPUT_SCHEMAS.query_rules>;

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
 *
 * 为什么是 async：`query_rules` 要检索规则库，而检索得先算查询向量 ——
 * 那是异步的。同步签名会让这一个工具无法实现，或者逼出一个「同步版 + 异步版」
 * 的双份校验逻辑，而校验逻辑的重复正是这一层最不该出现的东西。
 */
export async function executeToolCall(
  name: string,
  input: unknown,
  context: ToolContext,
): Promise<ToolResult> {
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
    case 'plan_checks': {
      const plan = parsed.data as PlanChecksInput;

      // 与 run_checks 同样的校验。模型编造的 checkId 会让界面展示一份
      // 「打算执行但实际执行不了」的计划，用户按它点了确认只会得到失败。
      const unknownChecks = [...new Set(plan.checks.map((item) => item.checkId))].filter(
        (id) => !knownCheckIds.has(id),
      );
      if (unknownChecks.length > 0) {
        return {
          ok: false,
          error: `计划里有不存在的检查项：${unknownChecks.join('、')}。当前可用：${[...knownCheckIds].join('、')}`,
        };
      }

      const referenced = plan.checks.flatMap((item) => item.targetColumns);
      const unknownColumns = [...new Set(referenced)].filter(
        (column) => !knownColumnNames.has(column),
      );
      if (unknownColumns.length > 0) {
        return { ok: false, error: unknownColumnsError(unknownColumns, knownColumnNames) };
      }

      // 计划原样返回：它只含列名、检查项标识与理由，没有任何原始取值，
      // 所以本来就允许出门（与 run_checks 的结果不同，后者要过白名单重建）。
      const output: CheckPlan = plan;
      return { ok: true, output };
    }

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

    case 'query_rules': {
      const { query, columns, subject } = parsed.data as QueryRulesInput;

      // 列名同样要校验：编造的列名不会命中任何规则，但会让模型以为
      // 「这个字段没有相关规则」，从而丢掉本来该检索到的领域知识
      const unknownColumns = [...new Set(columns ?? [])].filter(
        (column) => !knownColumnNames.has(column),
      );
      if (unknownColumns.length > 0) {
        return { ok: false, error: unknownColumnsError(unknownColumns, knownColumnNames) };
      }

      try {
        const index = await loadRuleIndex();

        // 学科名同样要校验，理由与列名一样：编造的学科既加不了权，又会静默退化，
        // 而模型会以为「已经按学科筛过了」。合法值只能从索引里取 —— 硬编码一份
        // 学科清单就等于第三个真相源，索引加学科时它必然漂移。
        if (subject !== undefined) {
          const knownSubjects = new Set(index.entries.flatMap((record) => record.学科));
          if (!knownSubjects.has(subject)) {
            return {
              ok: false,
              error: `规则库里没有学科「${subject}」。现有学科：${[...knownSubjects].join('、')}`,
            };
          }
        }

        const hits = await retrieveRules(query, {
          index,
          embedder,
          columns: columns ?? [],
          subject,
          // 索引后端与查询模型不配对时只走关键词路，且不会把它说成「语义相近」。
          // 当前索引是 hash 后端建的，所以这条通常是「只走稀疏路」——
          // 要真开稠密路，重建索引时得用 `--embedder bge`
          queryModel: MODEL_ID,
        });
        // 规则正文经 outbound 白名单重建后才出门。它是**要注入 Prompt 的领域知识**，
        // 不是用户数据 —— 所以正文逐字保留是对的，但不放向量等内部字段。
        return {
          ok: true,
          output: { count: hits.length, rules: hits.map((hit) => ruleHitForModel(hit)) },
        };
      } catch (error) {
        // 规则库不可用时给一句能照着做的中文，而不是让模型以为「没有相关规则」
        const reason =
          error instanceof RuleIndexUnavailableError
            ? error.message
            : `规则库读取失败（${error instanceof Error ? error.message : String(error)}）。`;
        return { ok: false, error: reason };
      }
    }
  }
}
