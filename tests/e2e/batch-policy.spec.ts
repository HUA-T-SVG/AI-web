import { expect, test, type Page } from '@playwright/test';
import { blockSemanticModelDownload, gotoHydrated } from './helpers';

const columns = ['成绩'];
const base = { checkId: 'range-rules', severity: 'medium', description: '请核对成绩定义。', columns, confidence: 0.9 };
const suggest = {
  ...base, title: '待评估的清洗建议', disposition: 'propose_cleaning', comparisonCode: '999',
  suggestion: { action: 'review_range_violations', params: {}, rationale: '先试算', columns },
};
const info = { ...base, title: '本批有效原值', disposition: 'inform_only' };
const hold = {
  ...base, title: '成绩编码的含义待核对', disposition: 'needs_clarification',
  clarification: { questions: [{ question: '本批的 999 是有效成绩还是缺考？', options: ['有效成绩', '缺考'] }] },
};

const headers = { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' };
function response(messageId: string | undefined, chunks: unknown[]): string {
  return [
    { type: 'start', ...(messageId ? { messageId } : {}) }, { type: 'start-step' },
    ...chunks, { type: 'finish-step' }, { type: 'finish' },
  ].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
}

function submit(toolCallId: string, input: unknown) {
  return { type: 'tool-input-available', toolCallId, toolName: 'submit_issue', input };
}

async function importFixture(page: Page) {
  await blockSemanticModelDownload(page);
  await gotoHydrated(page, '/import');
  await page.setInputFiles('input[type=file]', {
    name: 'batch-policy.csv', mimeType: 'text/csv', buffer: Buffer.from('学号,成绩\n01,80\n02,999\n03,65\n'),
  });
  await expect(page.getByText('数据预览')).toBeVisible();
}

async function start(page: Page) {
  await page.getByRole('link', { name: 'AI 分析' }).first().click();
  await page.getByPlaceholder(/这份问卷数据/).fill('检查成绩并核对 999。');
  await page.getByRole('button', { name: '开始分析' }).click();
}

test('结构化待核对会暂停，跳过后同字段仍不可清洗；仅展示不会加入队列', async ({ page }) => {
  const bodies: string[] = [];
  await page.route('**/api/agent', async (route) => {
    const body = route.request().postData() ?? '';
    bodies.push(body);
    const messages = (JSON.parse(body) as { messages: { id: string; role: string }[] }).messages;
    const last = messages.at(-1);
    const chunks = bodies.length === 1 ? [submit('show', info)] : bodies.length === 2 ? [submit('hold', hold)]
      : bodies.length === 3 ? [submit('suggest', suggest)] : [
        { type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: '其他检查已结束。' },
        { type: 'text-end', id: 'done' },
      ];
    await route.fulfill({ status: 200, headers, body: response(last?.role === 'assistant' ? last.id : undefined, chunks) });
  });
  await importFixture(page);
  await start(page);

  const prompt = page.getByTestId('clarification-panel');
  await expect(prompt).toContainText('本批的 999 是有效成绩还是缺考？');
  await expect(page.getByRole('button', { name: '开始分析' })).toBeDisabled();
  expect(bodies).toHaveLength(2);
  await prompt.getByRole('button', { name: '跳过，按现有信息继续' }).click();

  const review = page.getByTestId('issue-review');
  await expect(page.getByText('其他检查已结束。')).toBeVisible();
  await expect(review).toContainText('仅展示');
  await expect(review).toContainText('待核对');
  await expect(review.getByTestId('cleaning-comparison')).toHaveCount(0);
  await expect(review.getByRole('button', { name: '接受', exact: true })).toHaveCount(0);
  const execute = review.getByRole('button', { name: /执行清洗/ });
  for (const button of await execute.all()) await expect(button).toBeDisabled();
  expect(bodies[2]).toContain('"clarificationResult":{"answers":[],"skipped":true');
});

test('本批已确认的缺考码只开放本地试算，用户另行选择和执行才改数据', async ({ page }) => {
  const quote = '成绩：999 表示缺考。';
  await page.route('**/api/data-dictionary', (route) => route.fulfill({
    json: { candidates: [{ kind: 'missing-code', field: '成绩', quote, code: '999' }] },
  }));
  await importFixture(page);
  await page.getByRole('link', { name: '质量检查' }).first().click();
  const dictionary = page.getByTestId('data-dictionary');
  await dictionary.locator('summary').click();
  await dictionary.getByRole('textbox', { name: '数据字典文本' }).fill(quote);
  await dictionary.getByRole('button', { name: 'AI 提取候选规则' }).click();
  await dictionary.getByRole('checkbox', { name: '选中此规则' }).check();
  await dictionary.getByRole('button', { name: '确认并应用所选规则' }).click();
  await expect(dictionary.getByTestId('dictionary-success')).toBeVisible();
  let count = 0;
  await page.route('**/api/agent', async (route) => {
    const message = (route.request().postDataJSON() as { messages: { id: string; role: string }[] }).messages.at(-1);
    const chunks = ++count === 1 ? [submit('preview', suggest)] : [
      { type: 'text-start', id: 'verified' }, { type: 'text-delta', id: 'verified', delta: '请对比两种口径。' },
      { type: 'text-end', id: 'verified' },
    ];
    await route.fulfill({ status: 200, headers, body: response(message?.role === 'assistant' ? message.id : undefined, chunks) });
  });
  await page.getByRole('link', { name: 'AI 分析' }).first().click();
  await page.getByPlaceholder(/这份问卷数据/).fill('检查成绩并核对 999。');
  await page.getByRole('button', { name: '开始分析' }).click();
  const review = page.getByTestId('issue-review');
  await expect(page.getByText('请对比两种口径。')).toBeVisible();
  const compare = review.getByTestId('cleaning-comparison');
  await compare.locator('summary').click();
  await expect(compare.getByRole('textbox', { name: '疑似占位码' })).toHaveValue('999');
  await compare.getByRole('button', { name: '试算两种口径' }).click();
  await expect(compare.getByRole('status')).toContainText('匹配 1 行');
  await expect(review.getByRole('button', { name: /执行清洗/ })).toBeDisabled();
  await compare.getByRole('radio', { name: /转为缺失/ }).check();
  await compare.getByRole('textbox', { name: /选择理由/ }).fill('本批字典明确标记为缺考。');
  await compare.getByRole('button', { name: '采用此口径' }).click();
  await expect(review.getByTestId('cleaning-preview')).toContainText('改动 1 个单元格');
  await review.getByRole('button', { name: /执行清洗/ }).click();
  await expect(page.getByText('已应用 1 条动作、改动 1 个单元格。')).toBeVisible();
});
