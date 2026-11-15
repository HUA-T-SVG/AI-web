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

test('待核对条目可以人工核对并撤销，状态与报告口径一致', async ({ page }) => {
  let count = 0;
  await page.route('**/api/agent', async (route) => {
    const message = (route.request().postDataJSON() as { messages: { id: string; role: string }[] }).messages.at(-1);
    const chunks = ++count === 1 ? [submit('hold', hold)] : [
      { type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: '其他检查已结束。' },
      { type: 'text-end', id: 'done' },
    ];
    await route.fulfill({ status: 200, headers, body: response(message?.role === 'assistant' ? message.id : undefined, chunks) });
  });
  await importFixture(page);
  await start(page);
  await page.getByTestId('clarification-panel').getByRole('button', { name: '跳过，按现有信息继续' }).click();

  const review = page.getByTestId('issue-review');
  await expect(review).toContainText('待核对');
  await review.getByTestId('manual-verify-toggle').click();
  const panel = review.getByTestId('manual-verify-panel');
  await expect(panel).toContainText('人工核对');
  const row = panel.getByTestId('manual-verify-item').first();
  await expect(row).toContainText('待核对');
  await row.getByRole('textbox').fill('已与课题组确认：999 为缺考');
  await row.getByRole('button', { name: '标记为已核对' }).click();
  await expect(row).toContainText('已核对');
  await expect(row).toContainText('已与课题组确认');
  await expect(review.getByTestId('manual-verify-panel')).toContainText('已核对 1 条');

  // 列表里能按「已核对」筛选，卡片上也有标记
  await review.locator('select').first().selectOption('verified');
  await expect(review).toContainText('已人工核对');

  // 撤销后回到待核对
  await row.getByRole('button', { name: '撤销核对' }).click();
  await expect(row).toContainText('待核对');
});

test('追问里的疑似缺失码可以一键确认口径并重新分析', async ({ page }) => {
  const bodies: string[] = [];
  await page.route('**/api/agent', async (route) => {
    const body = route.request().postData() ?? '';
    bodies.push(body);
    const message = (JSON.parse(body) as { messages: { id: string; role: string }[] }).messages.at(-1);
    const chunks = bodies.length === 1
      ? [submit('hold-code', {
        ...base,
        title: '成绩 999 的含义待核对',
        disposition: 'needs_clarification',
        columns: ['成绩'],
        comparisonCode: '999',
        clarification: { questions: [{ question: '本批的 999 是有效成绩还是缺考？', options: ['有效成绩', '缺考'] }] },
      })]
      : [
        { type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: '已按新口径重新分析。' },
        { type: 'text-end', id: 'done' },
      ];
    await route.fulfill({ status: 200, headers, body: response(message?.role === 'assistant' ? message.id : undefined, chunks) });
  });
  await importFixture(page);
  await start(page);

  const panel = page.getByTestId('clarification-panel');
  await expect(panel.getByTestId('clarification-policy')).toContainText('999');
  await panel.getByRole('button', { name: '确认口径并重新分析' }).click();
  await expect(page.getByTestId('policy-confirmed-notice')).toContainText('已确认本批口径');
  await expect(page.getByText('已按新口径重新分析。')).toBeVisible();
  // 第二条请求是用新口径重开的一轮：提示词里带着刚确认的口径
  expect(bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies[1]).toContain('缺失占位码');
  // 面板已经消失，不会再把旧追问回填给模型
  await expect(page.getByTestId('clarification-panel')).toHaveCount(0);
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
  // 有「对比清洗口径」时不再给「接受」：直接接受只会记录一次核对、改动 0 格，
  // 真正清洗必须先选口径（这是本轮修掉的误导入口）。
  await expect(review.getByRole('button', { name: '接受', exact: true })).toHaveCount(0);
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
