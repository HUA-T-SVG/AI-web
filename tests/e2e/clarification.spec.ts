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

async function mock(page: Page) {
  const bodies: string[] = [];

  await page.route('**/api/agent', async (route) => {
    const body = route.request().postData() ?? '';
    bodies.push(body);
    const answered = body.includes('重点高中') || body.includes('"skipped":true');
    const steps = body.includes('"tool-submit_issue"')
      ? text('f', '按你确认的口径继续，结论已整理。')
      : answered
        ? [
            ...text('2', '明白，我按这个口径继续。'),
            {
              type: 'tool-input-available',
              toolCallId: 'submit-1',
              toolName: 'submit_issue',
              input: ISSUE,
            },
          ]
        : [
            ...text('1', '我需要确认一个口径。'),
            {
              type: 'tool-input-available',
              toolCallId: 'clarify-1',
              toolName: 'ask_clarification',
              input: { questions: [{ question: '「学校类型」里的「重点」指什么？', options: ['重点高中', '省重点'] }] },
            },
          ];

    await route.fulfill({ status: 200, headers: SSE, body: stream(round(startChunk(body), steps)) });
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
  // Review Focus 2：暂停不能被误判成「卡住」
  await expect(page.getByText('模型没能把这一步发完')).toHaveCount(0);

  await panel.getByRole('button', { name: '重点高中' }).click();
  await expect(panel.getByRole('textbox', { name: '回答第 1 个问题' })).toHaveValue('重点高中');
  await panel.getByRole('button', { name: '提交回答' }).click();

  await expect(page.getByTestId('issue-review')).toContainText('学号列有 2 组重复');
  await expect(page.getByText('按你确认的口径继续，结论已整理。')).toBeVisible();
  await expect(panel).toHaveCount(0);

  expect(bodies).toHaveLength(3);
  // 断言之后取一次，避免在 strict 的 noUncheckedIndexedAccess 下拿到 string | undefined
  const secondBody = bodies[1] ?? '';
  expect(secondBody).toContain('"tool-ask_clarification"');
  expect(secondBody).toContain('重点高中');
  // 回答只能出现在 tool-result 里，不能变成一条用户消息（Review Focus 1）
  expect(lastUserText(secondBody)).not.toContain('重点高中');
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
