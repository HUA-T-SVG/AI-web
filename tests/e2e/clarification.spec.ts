import { test, expect, type Page } from '@playwright/test';
import { blockSemanticModelDownload, importFixture } from './helpers';

const SSE = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' };
const stream = (chunks: unknown[]) =>
  chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
const text = (id: string, delta: string) => [
  { type: 'text-start', id },
  { type: 'text-delta', id, delta },
  { type: 'text-end', id },
];
const round = (start: unknown, steps: unknown[]) => [
  start,
  { type: 'start-step' },
  ...steps,
  { type: 'finish-step' },
  { type: 'finish' },
];

/**
 * 复刻真实服务端的 messageId 规则：历史以 assistant 结尾时沿用上一条 id。
 *
 * 不这么做的话，追问回答后的续跑会被当成一条新消息，而问句本身留在上一条里 ——
 * 界面上看起来「追问没了、结论乱了」，但产品逻辑其实没错。mock 必须和真实服务端
 * 同一个口径，E2E 才有意义。
 */
const startChunk = (body: string) => {
  const messages = (JSON.parse(body) as { messages?: { id: string; role: string }[] }).messages;
  const last = messages?.[messages.length - 1];
  return last?.role === 'assistant' ? { type: 'start', messageId: last.id } : { type: 'start' };
};

/** 只取最后一条用户消息：整份请求体里含着上一轮的追问原文，不能拿它判断 */
const lastUserText = (body: string) => {
  const messages = (JSON.parse(body) as { messages?: { role: string; parts: { text?: string }[] }[] })
    .messages ?? [];
  return (([...messages].reverse().find((message) => message.role === 'user')?.parts) ?? [])
    .map((part) => part.text ?? '')
    .join('\n');
};

const ISSUE = {
  checkId: 'duplicates',
  severity: 'medium',
  title: '学号列有 2 组重复',
  description: '学号是唯一标识，出现重复通常意味着数据合并时出了问题。',
  columns: ['学号'],
  confidence: 0.8,
  suggestion: {
    action: 'review_duplicates',
    params: {},
    rationale: '先确认这两组是否为同一条记录',
    columns: ['学号'],
  },
};

const PLAN = {
  reasoning: '先查缺失与重复，再确认学号口径。',
  checks: [{ checkId: 'missing', targetColumns: [], reason: '缺失率是否异常', priority: 'high' }],
};

/** 请求体里所有 ask_clarification 的**已回填结果**（只看 output-available） */
const clarificationOutputs = (body: string) => {
  const messages =
    (JSON.parse(body) as {
      messages?: {
        role: string;
        parts: { type?: string; output?: { answers?: { question: string; answer: string }[] } }[];
      }[];
    }).messages ?? [];
  return messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'tool-ask_clarification' && part.output !== undefined)
    .map((part) => part.output!);
};

async function mock(page: Page, options: { budgetAfterPlan?: boolean } = {}) {
  const bodies: string[] = [];

  await page.route('**/api/agent', async (route) => {
    const body = route.request().postData() ?? '';
    bodies.push(body);
    const index = bodies.length;
    const answered = body.includes('重点高中') || body.includes('"skipped":true');
    const planTool = {
      type: 'tool-input-available',
      toolCallId: 'plan-1',
      toolName: 'plan_checks',
      input: PLAN,
    };
    const clarifyTool = {
      type: 'tool-input-available',
      toolCallId: 'clarify-1',
      toolName: 'ask_clarification',
      input: {
        questions: [{ question: '「学校类型」里的「重点」指什么？', options: ['重点高中', '省重点'] }],
      },
    };
    const secondClarifyTool = {
      type: 'tool-input-available',
      toolCallId: 'clarify-2',
      toolName: 'ask_clarification',
      input: { questions: [{ question: '再说一次：学号前导零要保留吗？' }] },
    };
    const submitTool = {
      type: 'tool-input-available',
      toolCallId: 'submit-1',
      toolName: 'submit_issue',
      input: ISSUE,
    };

    // 首轮带两步：先提交检查计划（让计划面板出现），再**单独一步**追问。
    // 这样 E2E 能断言「等待期其它发送入口也被禁用」——点计划面板的按钮会发出
    // 一条用户消息，让 tool-result 再也回填不上（Review Focus 3）。
    const firstRound = [
      startChunk(body),
      { type: 'start-step' },
      ...text('1', '我先整理检查计划，再确认一个口径。'),
      planTool,
      { type: 'finish-step' },
      { type: 'start-step' },
      clarifyTool,
      { type: 'finish-step' },
      { type: 'finish' },
    ];

    let chunks: unknown[];
    if (options.budgetAfterPlan) {
      // 预算场景：作答 → 文本收尾 → 用户点「按此计划执行」（发一条用户消息）
      // → 模型第二次追问 → 必须被界面挡回，而不是再弹一次面板
      if (index === 1) chunks = firstRound;
      else if (index === 2)
        chunks = round(startChunk(body), text('2', '先把口径记下来，按计划继续。'));
      else if (index === 3)
        chunks = round(startChunk(body), [secondClarifyTool]);
      else if (index === 4)
        chunks = round(startChunk(body), [
          ...text('3', '按现有信息继续，结论已整理。'),
          submitTool,
        ]);
      else chunks = round(startChunk(body), text('f', '结论已整理。'));
    } else {
      chunks = body.includes('"tool-submit_issue"')
        ? round(startChunk(body), text('f', '按你确认的口径继续，结论已整理。'))
        : answered
          ? round(startChunk(body), [...text('2', '明白，我按这个口径继续。'), submitTool])
          : firstRound;
    }

    await route.fulfill({ status: 200, headers: SSE, body: stream(chunks) });
  });

  return bodies;
}

async function open(page: Page) {
  await importFixture(page);
  await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
  await page.getByPlaceholder(/这份问卷数据/).fill('这份数据有什么问题');
  await page.getByRole('button', { name: '开始分析' }).click();
}

test.beforeEach(async ({ page }) => {
  await blockSemanticModelDownload(page);
});

test('追问 → 面板作答 → tool-result 回填 → 续跑并提交问题', async ({ page }) => {
  const bodies = await mock(page);
  await open(page);

  const panel = page.getByTestId('clarification-panel');
  await expect(panel).toBeVisible();
  // 等待期禁输入：用户一旦发出新消息，回答就回填不上
  await expect(page.getByPlaceholder(/这份问卷数据/)).toBeDisabled();
  // 其它发送入口同样必须禁用：计划面板的按钮发的是**用户消息**，点一下追问就作废
  await expect(page.getByRole('button', { name: '按此计划执行' })).toBeDisabled();
  // Review Focus 2：暂停不能被误判成「卡住」
  await expect(page.getByText('模型没能把这一步发完')).toHaveCount(0);

  await panel.getByRole('button', { name: '重点高中' }).click();
  await expect(panel.getByRole('textbox', { name: '回答第 1 个问题' })).toHaveValue('重点高中');
  await panel.getByRole('button', { name: '提交回答' }).click();

  await expect(page.getByTestId('issue-review')).toContainText('学号列有 2 组重复');
  await expect(page.getByText('按你确认的口径继续，结论已整理。')).toBeVisible();
  await expect(panel).toHaveCount(0);
  // 回答之后计划面板重新可用：暂停解除，用户可以继续干预流程
  await expect(page.getByRole('button', { name: '按此计划执行' })).toBeEnabled();

  expect(bodies).toHaveLength(3);
  // 断言之后取一次，避免在 strict 的 noUncheckedIndexedAccess 下拿到 string | undefined
  const secondBody = bodies[1] ?? '';
  expect(secondBody).toContain('"tool-ask_clarification"');
  // 不能只断言请求体里出现「重点高中」—— 追问的 input.options 里本来就有它，
  // 把 answer 整段删掉测试仍会通过。必须断言**回填结果**里确实有这道答案。
  const outputs = clarificationOutputs(secondBody);
  expect(outputs).toHaveLength(1);
  expect(outputs[0]?.answers).toEqual([
    { question: '「学校类型」里的「重点」指什么？', answer: '重点高中' },
  ]);
  // 回答只能出现在 tool-result 里，不能变成一条用户消息（Review Focus 1）
  expect(lastUserText(secondBody)).not.toContain('重点高中');
});

test('计划指令不重置追问预算 —— 同一轮不会被追问第二次', async ({ page }) => {
  const bodies = await mock(page, { budgetAfterPlan: true });
  await open(page);

  const panel = page.getByTestId('clarification-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '重点高中' }).click();
  await panel.getByRole('button', { name: '提交回答' }).click();
  await expect(page.getByText('先把口径记下来，按计划继续。')).toBeVisible();

  // 这时点计划面板 = 发一条用户消息。它不是「开始分析」，不能重置追问预算 ——
  // 否则同一轮可以第二次追问（审查复现过的漏洞）。
  await page.getByRole('button', { name: '按此计划执行' }).click();
  await expect(page.getByText('按现有信息继续，结论已整理。')).toBeVisible();
  await expect(page.getByTestId('clarification-panel')).toHaveCount(0);

  // 第 4 次请求带着「本轮已经追问过一次」的工具错误 = 第二次追问被界面挡回
  expect(bodies).toHaveLength(5);
  const rejectionBody = bodies[3] ?? '';
  expect(rejectionBody).toContain('本轮已经追问过一次');
  expect(clarificationOutputs(rejectionBody)).toHaveLength(1);
});

test('跳过追问 → 按现有信息继续，模型收到 skipped 标记', async ({ page }) => {
  const bodies = await mock(page);
  await open(page);

  await page
    .getByTestId('clarification-panel')
    .getByRole('button', { name: '跳过，按现有信息继续' })
    .click();

  await expect(page.getByTestId('issue-review')).toContainText('学号列有 2 组重复');
  await expect(page.getByText('按你确认的口径继续，结论已整理。')).toBeVisible();

  const skippedBody = bodies[1] ?? '';
  expect(skippedBody).toContain('"skipped":true');
  expect(lastUserText(skippedBody)).not.toContain('跳过');
});
