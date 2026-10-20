import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { profileDataset, listChecks, type Dataset } from '@/core';
import { buildDataSummary } from '@/agent/shared/summary';
import { buildSummaryBlock } from '@/agent/shared/prompt';
import { executeToolCall, type ToolContext } from '@/ui/lib/toolExecutors';
import { writeEvalSection, type EvalMetric } from '../../../scripts/evalEmit';

/**
 * L4（Agent 层）评测 —— **真调模型**。
 *
 * 默认**跳过**，只有 `pnpm eval:agent` 时才执行（那条脚本设了 `RUN_AGENT_EVAL=1`）。
 *
 * 隔离的理由与 `tests/e2e/real-api.spec.ts` 一致 —— 门禁一旦会因网络与成本
 * 随机变红就失去判断力。这一层必须真调，所以它只能单独跑。
 *
 * **为什么用环境变量而不是「按运行的文件路径判断」**：本想用后者（更自然、不必设变量），
 * 但实测不行 —— vitest 在 tinypool 的 worker 里跑测试，`process.argv` 只有
 * `node` 与 tinypool 的入口路径，**不含测试文件名**。
 * 而 `VAR=1 cmd` 这种写法只在 bash 里成立（cmd 要 `set VAR=1 &&`），
 * 所以 `package.json` 里用 `node -e` 设变量再 spawn，跨平台且不加依赖。
 *
 * 前提：`pnpm dev` 已在 3000 端口运行。
 *
 * ## 这个脚本要自己扮演浏览器
 *
 * 工具**在浏览器里执行**（AI SDK 的客户端工具不带 `execute`），所以服务端不会
 * 给结果。这里显式用生产的 `executeToolCall` 执行，再把结果回填成
 * 「助手消息里带 `tool-<name>` part」的形态发回去 —— 与浏览器里
 * `addToolOutput` 的效果等价。**用生产的执行器而不是另写一份**：否则评的就成了
 * 抄本，工具校验（编造的 checkId、不存在的列）也测不到。
 *
 * ## 记录的粒度
 *
 * 每条查询的每次运行都记原始轨迹（轮次、工具序列、每次工具结果 ok/失败、
 * 错误事件、结论文本），并落盘到 `knowledge/reports/eval-agent.raw.json`。
 * **只给结论数字的评测没法复查** —— 模型哪天换了行为，得能从轨迹里看出来。
 */

const RUN_THIS_FILE = process.env.RUN_AGENT_EVAL === '1';
const ENDPOINT = process.env.AGENT_ENDPOINT ?? 'http://localhost:3000/api/agent';
const RUNS_PER_QUERY = Number(process.env.AGENT_EVAL_RUNS ?? 3);
const DATASET_DIR = resolve(process.cwd(), 'knowledge/eval/dataset');
const REPORT_DIR = resolve(process.cwd(), 'knowledge/reports');

/**
 * 让 `query_rules` 在 Node 里也能工作。
 *
 * `loadRuleIndex()` 里是 `fetch('/knowledge/rules.json')` —— **相对 URL** 在浏览器里
 * 由页面 origin 补全，而 Node 的 fetch 会直接抛
 * `Failed to parse URL from /knowledge/rules.json`。
 *
 * 第一次真跑评测时没做这一步，结果 23 次 `query_rules` **全部失败** ——
 * 于是「工具调用正确率」量的是「调了没有」，而规则检索这一路根本没被评到。
 * 那是最坏的一种失真：数字好看，被测能力其实没跑。
 *
 * 这里为**评测环境**补上 origin，并先试同目录的离线副本再试 dev server：
 * 前者不要求 dev server 在跑、也更快；后者拿的是 synced 到 `public/` 的那份。
 */
beforeAll(() => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      const local = resolve(process.cwd(), `.${input}`);
      try {
        const body = readFileSync(local, 'utf8');
        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
      } catch {
        return original(`http://localhost:3000${input}`, init);
      }
    }
    return original(input, init);
  }) as typeof fetch;
});

interface QuerySpec {
  id: string;
  question: string;
  说明: string;
  mustCallTools: string[];
  forbiddenTools: string[];
  minIssues: number;
  maxRounds: number;
  expectTextMentioning?: string[];
}

interface Chunk {
  type: string;
  [key: string]: unknown;
}

interface RoundRecord {
  round: number;
  text: string;
  toolCalls: { toolName: string; input: unknown; ok: boolean; error?: string }[];
  errors: string[];
}

interface RunRecord {
  queryId: string;
  runIndex: number;
  rounds: RoundRecord[];
  toolsCalled: string[];
  /** 工具返回 ok:false 的次数。**「调了没有」与「调成功没有」是两件事** */
  toolsFailed: number;
  issuesSubmitted: number;
  /** 工具返回 ok:false 或出现 error 事件，但之后仍继续推进 */
  recoveredFromFailure: boolean;
  hadFailure: boolean;
  /**
   * 跑到 `maxRounds` 仍未自然结束（最后一轮还有工具调用）。
   *
   * **必须记这个**：第一次真跑时 `defects` 三次都恰好 8 轮 —— 看起来像
   * 「稳定完成」，其实是**每次都在上限处被截断**。不记这个标志，
   * 「平均轮次」会以「3 次都是 8 轮，很一致」的形式把截断包装成稳定性。
   */
  hitRoundLimit: boolean;
  finalText: string;
}

function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.trimEnd().split('\n');
  return {
    columns: lines[0]?.split(',') ?? [],
    rows: lines.slice(1).map((line) => line.split(',')),
  };
}

function loadDataset(): Dataset {
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

function parseSse(text: string): Chunk[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((payload) => payload !== '' && payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as Chunk);
}

async function post(messages: unknown[]): Promise<Chunk[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) {
    throw new Error(`接口返回 ${response.status}：${(await response.text()).slice(0, 200)}`);
  }
  return parseSse(await response.text());
}

/** 跑一次完整对话：发问 → 执行工具 → 回填 → 续跑，直到没有工具调用或达上限。 */
async function runOnce(spec: QuerySpec, context: ToolContext, summaryBlock: string): Promise<RunRecord> {
  const messages: unknown[] = [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: `${spec.question}\n\n${summaryBlock}` }],
    },
  ];
  const rounds: RoundRecord[] = [];
  const toolsCalled: string[] = [];
  let toolsFailed = 0;
  let issuesSubmitted = 0;
  let hadFailure = false;
  let recoveredFromFailure = false;
  let hitRoundLimit = false;
  let finalText = '';

  for (let round = 1; round <= spec.maxRounds; round += 1) {
    const chunks = await post(messages);
    const errors = chunks
      .filter((chunk) => chunk.type === 'error')
      .map((chunk) => String(chunk.errorText ?? '').slice(0, 200));
    const text = chunks
      .filter((chunk) => chunk.type === 'text-delta')
      .map((chunk) => String(chunk.delta))
      .join('');
    const calls = chunks.filter((chunk) => chunk.type === 'tool-input-available');

    const toolResults: RoundRecord['toolCalls'] = [];
    const parts: unknown[] = [];

    for (const call of calls) {
      const toolName = String(call.toolName);
      const toolCallId = String(call.toolCallId);
      toolsCalled.push(toolName);
      // 用**生产的执行器**：它的校验（编造的 checkId、不存在的列）也是被测对象
      const result = await executeToolCall(toolName, call.input, context);
      if (!result.ok) {
        hadFailure = true;
        toolsFailed += 1;
      }
      if (toolName === 'submit_issue' && result.ok) issuesSubmitted += 1;
      toolResults.push({
        toolName,
        input: call.input,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
      });
      parts.push({
        type: `tool-${toolName}`,
        toolCallId,
        state: result.ok ? 'output-available' : 'output-error',
        input: call.input,
        ...(result.ok ? { output: result.output } : { errorText: result.error }),
      });
    }

    if (errors.length > 0) hadFailure = true;
    rounds.push({ round, text, toolCalls: toolResults, errors });
    if (text.trim() !== '') finalText = text;

    // 没有工具调用就是这轮结束了
    if (calls.length === 0) break;

    // 失败之后仍在推进（还没到 maxRounds 且这轮之后还会再发一次请求）
    if (round < spec.maxRounds && (hadFailure || errors.length > 0)) recoveredFromFailure = true;

    messages.push({ id: `a${round}`, role: 'assistant', parts });

    // 最后一轮仍有工具调用 = 被上限截断，而不是自然收尾
    if (round === spec.maxRounds) hitRoundLimit = true;
  }

  return {
    queryId: spec.id,
    runIndex: 0,
    rounds,
    toolsCalled,
    toolsFailed,
    issuesSubmitted,
    recoveredFromFailure,
    hadFailure,
    hitRoundLimit,
    finalText,
  };
}

/** 结构化检查计划「格式与引用是否成立」（**不是**「合理」）。 */
function checkPlanValidity(record: RunRecord, knownColumns: Set<string>): { checked: number; valid: number; problems: string[] } {
  const problems: string[] = [];
  let checked = 0;
  const knownChecks = new Set(listChecks().map((check) => check.id));

  for (const round of record.rounds) {
    for (const call of round.toolCalls) {
      if (call.toolName !== 'plan_checks') continue;
      checked += 1;
      const input = call.input as { checks?: { checkId?: string; targetColumns?: string[] }[] };
      const checks = input.checks ?? [];
      if (checks.length === 0) problems.push('计划为空');
      if (checks.length > 8) problems.push(`计划 ${checks.length} 条，超过上限 8`);
      for (const item of checks) {
        if (!knownChecks.has(String(item.checkId))) problems.push(`编造的 checkId：${item.checkId}`);
        for (const column of item.targetColumns ?? []) {
          if (!knownColumns.has(column)) problems.push(`不存在的列：${column}`);
        }
      }
    }
  }
  return { checked, valid: checked - problems.length, problems };
}

describe.skipIf(!RUN_THIS_FILE)('L4 Agent 评测 · 真调模型', () => {
  it('跑完整评测并落盘原始记录', async () => {
    const dataset = loadDataset();
    const profile = profileDataset(dataset);
    const summary = buildDataSummary({ dataset, profile, fileName: 'messy-eval.csv' });
    const summaryBlock = buildSummaryBlock(summary);
    const context: ToolContext = { dataset, profile };

    const spec = JSON.parse(readFileSync(resolve(process.cwd(), 'knowledge/eval/agent-queries.json'), 'utf8')) as {
      queries: QuerySpec[];
    };
    const knownColumns = new Set(dataset.columns.map((column) => column.name));

    const records: RunRecord[] = [];
    for (const query of spec.queries) {
      for (let runIndex = 1; runIndex <= RUNS_PER_QUERY; runIndex += 1) {
        const record = await runOnce(query, context, summaryBlock);
        record.runIndex = runIndex;
        records.push(record);
        const toolList = record.toolsCalled.join('→') || '（无）';
        console.log(`  [${query.id} #${runIndex}] 轮次 ${record.rounds.length} · 工具 ${toolList} · 提交 ${record.issuesSubmitted} 条`);
      }
    }

    // 原始记录落盘：只给结论数字的评测没法复查
    writeFileSync(
      resolve(REPORT_DIR, 'eval-agent.raw.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), endpoint: ENDPOINT, runsPerQuery: RUNS_PER_QUERY, records }, null, 2) + '\n',
      'utf8',
    );

    // ---- 汇总指标 ----
    const perQuery = spec.queries.map((query) => {
      const runs = records.filter((record) => record.queryId === query.id);
      const toolOk = runs.filter((run) => query.mustCallTools.every((tool) => run.toolsCalled.includes(tool))).length;
      const forbidden = runs.flatMap((run) => run.toolsCalled.filter((tool) => query.forbiddenTools.includes(tool)));
      const rounds = runs.map((run) => run.rounds.length);
      const issues = runs.map((run) => run.issuesSubmitted);
      const plans = runs.map((run) => checkPlanValidity(run, knownColumns));
      const truncated = runs.filter((run) => run.hitRoundLimit).length;
      const failedTools = runs.reduce((sum, run) => sum + run.toolsFailed, 0);
      return { query, runs, toolOk, forbidden, rounds, issues, plans, truncated, failedTools };
    });

    const totalRuns = records.length;
    const toolOkRuns = perQuery.reduce((sum, item) => sum + item.toolOk, 0);
    const allRounds = perQuery.flatMap((item) => item.rounds);
    const meanRounds = allRounds.reduce((sum, value) => sum + value, 0) / allRounds.length;
    const failureRuns = records.filter((record) => record.hadFailure);
    const recovered = failureRuns.filter((record) => record.recoveredFromFailure);
    const validPlans = perQuery.flatMap((item) => item.plans);
    const plansChecked = validPlans.filter((item) => item.checked > 0);
    const planProblems = validPlans.flatMap((item) => item.problems);
    const truncatedRuns = records.filter((record) => record.hitRoundLimit).length;
    const totalToolCalls = records.reduce((sum, record) => sum + record.toolsCalled.length, 0);
    const totalToolFailures = records.reduce((sum, record) => sum + record.toolsFailed, 0);

    const lines: string[] = [''];
    lines.push(`调用 ${totalRuns} 次完整对话（每条查询 ${RUNS_PER_QUERY} 次）`);
    lines.push('');
    lines.push('| 指标 | 值 | 口径 |');
    lines.push('| --- | --- | --- |');
    lines.push(
      `| 工具调用正确率 | **${((toolOkRuns / totalRuns) * 100).toFixed(1)}%**（${toolOkRuns}/${totalRuns}） | mustCallTools 全部**被调用**（不看是否成功） |`,
    );
    lines.push(
      `| 工具成功率 | **${(((totalToolCalls - totalToolFailures) / totalToolCalls) * 100).toFixed(1)}%**（${totalToolCalls - totalToolFailures}/${totalToolCalls}） | 工具返回 ok（**这一行才反映能力**） |`,
    );
    lines.push(
      `| 平均轮次 | **${meanRounds.toFixed(2)}**（范围 ${Math.min(...allRounds)}–${Math.max(...allRounds)}） | 一轮 = 一次 POST |`,
    );
    lines.push(
      `| **被轮次上限截断** | **${truncatedRuns}/${totalRuns}** | 最后一轮仍有工具调用 = 没跑完，不是「稳定完成」 |`,
    );
    lines.push(
      `| 失败恢复率 | **${failureRuns.length === 0 ? 'n/a（本轮没有失败）' : `${((recovered.length / failureRuns.length) * 100).toFixed(1)}%（${recovered.length}/${failureRuns.length}）`}** | 失败之后仍继续推进 |`,
    );
    lines.push(
      `| 计划格式有效 | **${plansChecked.length === 0 ? 'n/a（本轮未产出计划）' : `${plansChecked.filter((item) => item.problems.length === 0).length}/${plansChecked.length}`}** | checkId 合法 + 列名存在 + ≤8 条。**这不是「计划合理」** |`,
    );
    lines.push('');
    for (const item of perQuery) {
      lines.push(
        `- **${item.query.id}**：轮次 [${item.rounds.join(', ')}] · 提交问题 [${item.issues.join(', ')}]` +
          ` · 工具失败 ${item.failedTools} 次 · 截断 ${item.truncated}/${item.runs.length}` +
          ` · 工具 ${[...new Set(item.runs.flatMap((run) => run.toolsCalled))].join('→') || '（无）'}` +
          (item.forbidden.length > 0 ? ` · **调了禁止的工具：${item.forbidden.join(', ')}**` : ''),
      );
    }
    if (planProblems.length > 0) {
      lines.push('');
      lines.push(`计划里的问题（结构化检查发现）：${[...new Set(planProblems)].join(' · ')}`);
    }
    lines.push('');
    console.log(lines.join('\n'));

    // 「越界请求」那条期望把话题拉回数据质量
    for (const item of perQuery.filter((entry) => entry.query.expectTextMentioning)) {
      for (const run of item.runs) {
        for (const keyword of item.query.expectTextMentioning ?? []) {
          const mentioned = run.finalText.includes(keyword) || run.rounds.some((round) => round.text.includes(keyword));
          if (!mentioned) {
            console.log(`⚠️ ${item.query.id} #${run.runIndex} 的回复里没有出现「${keyword}」`);
          }
        }
      }
    }

    // 结构化产出，供指标看板读。**每一项都带判据**，尤其「被截断」那一项 ——
    // 看板最容易把「跑满轮次」看成「很努力」
    const metricList: EvalMetric[] = [
      {
        name: '工具成功率',
        value: (totalToolCalls - totalToolFailures) / totalToolCalls,
        rule: '工具调用返回 ok 的比例。这一项才反映能力（只看「调了没有」会把参数填错的也算通过）',
        passed: totalToolFailures === 0,
      },
      {
        name: '工具调用正确率',
        value: toolOkRuns / totalRuns,
        rule: '查询要求的工具都被调用过的运行占比（不看是否成功）',
      },
      {
        name: '平均轮次',
        value: meanRounds,
        unit: '轮',
        rule: '一轮 = 一次 POST。它单独看没有意义，必须与「被截断」一起读',
      },
      {
        name: '被轮次上限截断',
        value: truncatedRuns,
        unit: `/${totalRuns} 次`,
        rule: '最后一轮仍有工具调用 = 没跑完。截断率高说明 Agent 还没收敛（判据只覆盖「何时停」，覆盖不了「一条一轮」的载荷成本）',
        passed: truncatedRuns === 0,
      },
      {
        name: '失败恢复率',
        value: failureRuns.length === 0 ? undefined : recovered.length / failureRuns.length,
        text: failureRuns.length === 0 ? '本轮没有失败' : undefined,
        rule: '出现工具失败或 error 事件之后仍继续推进的比例',
      },
      {
        name: '计划格式有效',
        value: plansChecked.length === 0 ? 0 : plansChecked.filter((item) => item.problems.length === 0).length / plansChecked.length,
        rule: 'checkId 合法 + 列名存在 + ≤8 条。这不是「计划合理」—— 合理性无法自动评',
        passed: planProblems.length === 0,
      },
    ];

    writeEvalSection('agent', {
      title: 'L4 Agent 层',
      description: `真调模型：${spec.queries.length} 条查询各跑 ${RUNS_PER_QUERY} 次完整对话。**这一层不进日常门禁**。`,
      metrics: metricList,
      groups: perQuery.map((item) => ({
        name: item.query.id,
        metrics: [
          {
            name: '轮次',
            text: item.rounds.join(' / '),
            rule: `上限 ${item.query.maxRounds} 轮；撞上限即为截断（本查询 ${item.truncated}/${item.runs.length} 次）`,
            passed: item.truncated === 0,
          },
          {
            name: '提交问题',
            text: item.issues.join(' / '),
            rule: '同一条查询三次的产出应当接近；差异大 = 缺收敛判据',
          },
        ],
      })),
      measuredAt: new Date().toISOString(),
      command: 'pnpm dev（另开终端）pnpm eval:agent',
      notCovered: [
        '真实 token 与成本拿不到 —— /api/agent 的 SSE 流里 finish 块只有 finishReason、不带 usage',
        '计划合理性无法自动评，只做了结构化检查（格式与引用是否成立）',
        '样本量 3 次不足以谈分布，只能说「不稳定」，不能给方差',
        '工具结果的质量属于 L1；多轮追问、并发与限流均未覆盖',
      ],
    });

    expect(records.length).toBe(spec.queries.length * RUNS_PER_QUERY);
  }, 900_000);
});
