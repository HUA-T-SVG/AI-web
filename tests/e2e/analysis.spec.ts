import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * 模型提交的两条问题。
 *
 * 一次只提交一条：真模型实测过，把整份报告塞进一次工具调用时载荷太大，
 * 工具输入会流不完、永远停在 input-streaming，用户一条结论都拿不到。
 */
const ISSUE_1 = {
  // checkId 必须是真实存在的检查项，而且要与问题内容对得上：
  // 原来这里把「学历列同义写法」标成 missing，既不忠实，也会固化
  // 「检查项标识可以随便填」这个印象（而校验器正是要拦住这种填法）
  checkId: 'duplicates',
  severity: 'medium',
  title: '学号列有 2 组重复',
  description: '学号是唯一标识，出现重复通常意味着数据合并时出了问题。',
  columns: ['学号'],
  suggestion: {
    action: 'review_duplicates',
    params: {},
    rationale: '先确认这两组是否为同一条记录被录入两次，再决定保留哪一条',
    columns: ['学号'],
  },
  confidence: 0.8,
};

const ISSUE_2 = {
  checkId: 'outliers',
  severity: 'high',
  title: '年龄列有越界取值',
  description: '年龄列出现 999。',
  columns: ['年龄'],
  suggestion: {
    action: 'review_range_violations',
    params: {},
    rationale: '疑似录入错误或缺失编码，需要人工核对原始记录',
    columns: ['年龄'],
  },
  confidence: 0.9,
};

/** 把 chunk 数组拼成 AI SDK 的 UI 消息流（SSE） */
function uiMessageStream(chunks: unknown[]): string {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'x-vercel-ai-ui-message-stream': 'v1',
};

function textStep(id: string, text: string): unknown[] {
  return [
    { type: 'text-start', id },
    { type: 'text-delta', id, delta: text },
    { type: 'text-end', id },
  ];
}

function submitStep(toolCallId: string, issue: unknown): unknown[] {
  return [{ type: 'tool-input-available', toolCallId, toolName: 'submit_issue', input: issue }];
}

/**
 * 在网络边界伪造一次完整的「调工具 → 前端执行 → 续跑 → 收尾」往返。
 *
 * 刻意不在产品代码里留测试分支：拦到的是客户端真实收到的字节，
 * 测的是真的流式解析与工具执行逻辑。协议格式取自
 * node_modules/ai/docs/04-ai-sdk-ui/50-stream-protocol.mdx。
 *
 * 两个细节是照着真实链路抄的，写错了测试会失真：
 *   - 三轮的 messageId 必须相同。真实链路是**同一条助手消息的续写**；
 *     每轮换新 id 会让 SDK 建出三条助手消息，界面上就会出现三份重复内容。
 *   - 按 3 轮循环，这样一次测试里连做两轮分析也能拿到同样的假数据。
 */
async function mockAgentStream(page: Page) {
  let call = 0;

  await page.route('**/api/agent', async (route) => {
    call += 1;
    const round = ((call - 1) % 3) + 1;

    const rounds: Record<number, unknown[]> = {
      1: [
        { type: 'start', messageId: 'msg-1' },
        { type: 'start-step' },
        ...textStep('text-1', '我先看看这份数据。'),
        ...submitStep('submit-1', ISSUE_1),
        { type: 'finish-step' },
        { type: 'finish' },
      ],
      2: [
        { type: 'start', messageId: 'msg-1' },
        { type: 'start-step' },
        ...submitStep('submit-2', ISSUE_2),
        { type: 'finish-step' },
        { type: 'finish' },
      ],
      3: [
        { type: 'start', messageId: 'msg-1' },
        { type: 'start-step' },
        ...textStep('text-3', '整理成两份建议，等你逐条确认。'),
        { type: 'finish-step' },
        { type: 'finish' },
      ],
    };

    await route.fulfill({
      status: 200,
      headers: SSE_HEADERS,
      body: uiMessageStream(rounds[round] ?? []),
    });
  });
}

/** 上传示例数据并等到预览出现 */
async function importFixture(page: Page, name = 'messy-survey.csv') {
  await page.goto('/import');
  await page.setInputFiles('input[type=file]', join(fixtures, name));
  await expect(page.getByText('数据预览')).toBeVisible();
}

/**
 * 导入数据后进入分析页。
 *
 * 必须走界面内的链接，不能用 page.goto：后者是整页重载，而数据集只存在
 * 内存 store 里，一重载就没了（已知技术债，Plan 4 会改成 IndexedDB 暂存）。
 * 用 goto 写测试会得到「明明导入了却提示没数据」的假失败。
 */
async function importThenOpenAnalysis(page: Page) {
  await importFixture(page);
  await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
  await expect(page).toHaveURL(/\/analysis$/);
}

/** 发送一条消息并等到两条问题都进列表 */
async function analyze(page: Page) {
  await page.getByPlaceholder(/这份问卷数据/).fill('这份数据有什么问题');
  await page.getByRole('button', { name: '开始分析' }).click();
  await expect(page.getByText('还有 2 条未确认')).toBeVisible();
}

/**
 * 审阅区。
 *
 * 断言要限定在这个范围内：问题标题也会出现在对话里的工具卡片上
 * （「提交问题清单 · 完成：学历列有同义写法」），不限定就会命中两个元素。
 */
const review = (page: Page) => page.getByTestId('issue-review');

test.describe('AI 分析 · 入口与前置条件', () => {
  test('未导入数据时给出引导，而不是一个点了没反应的输入框', async ({ page }) => {
    await page.goto('/analysis');

    await expect(page.getByText('还没有导入数据')).toBeVisible();
    // 没有数据就不该出现输入框：让人先打字再告诉他不行，是更差的体验
    await expect(page.getByPlaceholder(/这份问卷数据/)).toHaveCount(0);

    await page.getByRole('link', { name: '去导入数据' }).click();
    await expect(page).toHaveURL(/\/import$/);
  });

  test('导入数据后出现输入框，且空输入时不能提交', async ({ page }) => {
    await importThenOpenAnalysis(page);

    const input = page.getByPlaceholder(/这份问卷数据/);
    await expect(input).toBeVisible();

    const submit = page.getByRole('button', { name: '开始分析' });
    await expect(submit).toBeDisabled();

    await input.fill('这份数据有什么问题');
    await expect(submit).toBeEnabled();
  });

  test('页面明示只有摘要有可能外传', async ({ page }) => {
    await importThenOpenAnalysis(page);

    // 这是产品的核心承诺，必须在用户动手之前就写在眼前
    await expect(page.getByText(/原始数据不会上传/)).toBeVisible();
  });

  test('阶段指示从剖析开始', async ({ page }) => {
    await importThenOpenAnalysis(page);

    // 阶段只在步骤条里显示一处。之前还额外写了一行「当前阶段：X」，
    // 同一个状态写两遍迟早会不一致，已经删掉
    await expect(page.locator('[aria-current="step"]')).toContainText('剖析数据');
  });

  test('无控制台错误', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await importThenOpenAnalysis(page);
    await expect(page.getByPlaceholder(/这份问卷数据/)).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});

test.describe('AI 分析 · 导航', () => {
  test('侧边栏里「AI 分析」已不再是禁用态', async ({ page }) => {
    await page.goto('/import');

    const sidebar = page.getByTestId('sidebar');
    const item = sidebar.getByRole('link', { name: 'AI 分析' });
    await expect(item).toBeVisible();
    // 之前这里是 aria-disabled 的占位项，现在应该是真链接
    await expect(item).toHaveAttribute('href', '/analysis');
  });

  test('从侧边栏进入分析页会被标记为当前项', async ({ page }) => {
    await page.goto('/analysis');

    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar.getByRole('link', { name: 'AI 分析' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('切换视图不丢数据', async ({ page }) => {
    await importFixture(page);
    await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
    await expect(page).toHaveURL(/\/analysis$/);
    await expect(page.getByPlaceholder(/这份问卷数据/)).toBeVisible();

    // 切回导入页，数据仍在（store 在客户端路由间保持）
    await page.getByTestId('sidebar').getByRole('link', { name: '数据导入' }).click();
    await expect(page.getByText('共 7 行 × 5 列')).toBeVisible();
  });
});

test.describe('AI 分析 · 注入防护', () => {
  test('列名里的指令逃不出数据块', async ({ page }) => {
    let captured = '';

    await page.route('**/api/agent', async (route) => {
      captured = route.request().postData() ?? '';
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: uiMessageStream([
          { type: 'start', messageId: 'msg-1' },
          { type: 'start-step' },
          ...textStep('text-1', '看完了。'),
          { type: 'finish-step' },
          { type: 'finish' },
        ]),
      });
    });

    await page.goto('/import');
    await page.setInputFiles('input[type=file]', join(fixtures, 'hostile-columns.csv'));
    await expect(page.getByText('数据预览')).toBeVisible();
    await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
    await page.getByPlaceholder(/这份问卷数据/).fill('看看这份数据');
    await page.getByRole('button', { name: '开始分析' }).click();
    await expect(page.getByText('看完了。')).toBeVisible();

    // 这条列名就是一份提示注入尝试。它必须被当作「一个可疑取值」，
    // 而不是能闭合数据块、让后面的内容变成指令的东西。
    expect(captured).toContain('＜/数据集摘要＞');
    // 真正的闭合标记只出现一次 —— 就是我们自己写的那一处
    expect(captured.split('</数据集摘要>').length - 1).toBe(1);
    // 数据块本身确实发出去了：模型得看得到摘要，否则只能盲目试探
    expect(captured).toContain('<数据集摘要>');
  });

  test('摘要里带上规模与列画像，让模型不必盲目逐列试探', async ({ page }) => {
    let captured = '';

    await page.route('**/api/agent', async (route) => {
      captured = route.request().postData() ?? '';
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: uiMessageStream([
          { type: 'start', messageId: 'msg-1' },
          { type: 'start-step' },
          ...textStep('text-1', '看完了。'),
          { type: 'finish-step' },
          { type: 'finish' },
        ]),
      });
    });

    await importThenOpenAnalysis(page);
    await page.getByPlaceholder(/这份问卷数据/).fill('看看这份数据');
    await page.getByRole('button', { name: '开始分析' }).click();
    await expect(page.getByText('看完了。')).toBeVisible();

    // 阶段 1 的产出必须真的交出去。之前这一步漏了接线，模型手里没有摘要，
    // 只能调 describe_column 一列一列试（真实调用里连查了五列）
    expect(captured).toContain('7 行');
    expect(captured).toContain('列摘要');
    expect(captured).toContain('学历');
  });
});

test.describe('AI 分析 · 流式往返与人工确认', () => {
  test('流式文本逐步出现，工具调用用中文文案显示', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    await expect(page.getByText('我先看看这份数据。')).toBeVisible();
    await expect(page.getByText('整理成两份建议，等你逐条确认。')).toBeVisible();
    // 界面上不该出现 submit_issue / run_checks 这类内部标识
    await expect(page.getByText(/submit_issue|run_checks/)).toHaveCount(0);
  });

  test('同一条消息里重复的 part 只渲染一次', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    // SDK 在客户端工具续跑时会把每一步的 parts 并进同一条消息，
    // 直接渲染就会出现好几份同样的内容（真模型实测过）
    await expect(page.getByText('我先看看这份数据。')).toHaveCount(1);
    await expect(page.getByText('整理成两份建议，等你逐条确认。')).toHaveCount(1);
  });

  test('模型提交的问题进入审阅列表，带严重度文字与建议依据', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    await expect(page.getByText('发现的问题')).toBeVisible();
    await expect(review(page).getByText('学号列有 2 组重复')).toBeVisible();
    await expect(review(page).getByText('年龄列有越界取值')).toBeVisible();
    // 严重度必须有文字，不能只靠颜色 —— 色觉障碍的读者也要拿得到这个信息
    await expect(review(page).getByText('中等')).toBeVisible();
    await expect(review(page).getByText('严重')).toBeVisible();
    // 建议的依据要写出来，用户才有判断依据
    await expect(review(page).getByText(/先确认这两组/)).toBeVisible();
  });

  test('未确认之前执行入口是禁用的', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    await expect(page.getByText('还有 2 条未确认，确认之前不会对数据做任何改动')).toBeVisible();
    await expect(page.getByRole('button', { name: /执行清洗/ })).toBeDisabled();
  });

  test('接受一条之后计数随之变化', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    await page.getByRole('button', { name: '接受' }).first().click();

    await expect(page.getByText('还有 1 条未确认')).toBeVisible();
    // 只确认了一条，执行入口仍然该禁用
    await expect(page.getByRole('button', { name: /执行清洗/ })).toBeDisabled();
  });

  test('全部确认之后执行入口解禁，点下去真的执行并说明改了多少', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    await page.getByRole('button', { name: '接受' }).first().click();
    await page.getByRole('button', { name: '接受' }).first().click();

    await expect(page.getByText('已确认 2 条')).toBeVisible();
    const run = page.getByRole('button', { name: /执行清洗/ });
    // Plan 3 把执行做出来了，所以这里从「必须禁用」变成「必须可用」。
    // 断言反过来写不是放宽，是这条测试要守的东西变了：
    // 它现在守的是「用户确认之后动作真的被执行，而且改了多少说清楚」
    await expect(run).toBeEnabled();
    await run.click();
    // 这两条建议的动作是 review_duplicates / review_range_violations ——
    // 「重复行该删哪条」「越界值该改成多少」都要对着业务口径判断，**不能自动改**。
    // 所以断言的是「两条都被记为已处理，且一个单元格都没动」——
    // 这正是「AI 不直接执行任何破坏性操作」在界面上的样子，
    // 也是「已确认」与「已改动」必须分开说的原因。
    await expect(page.getByTestId('cleaning-outcome')).toContainText('已应用 2 条动作');
    await expect(page.getByTestId('cleaning-outcome')).toContainText('改动 0 个单元格');
  });

  test('拒绝之后该条不再计入可执行动作', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    await page.getByRole('button', { name: '接受' }).first().click();
    await page.getByRole('button', { name: '拒绝' }).first().click();
    // 第一次点是展开理由输入框，第二次才是确认
    await page.getByRole('button', { name: '确认拒绝' }).click();

    // 口径必须说清「处理了几条」与「几条会执行」。原先只显示「已确认 1 条」，
    // 会把拒绝掉的那条从用户视野里抹掉 —— 他明明处理了 2 条
    await expect(page.getByText('已处理 2 条，其中 1 条将执行')).toBeVisible();
  });

  test('开始新一轮会清掉上一轮的结论', async ({ page }) => {
    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);
    await page.getByRole('button', { name: '接受' }).first().click();
    await expect(page.getByText('还有 1 条未确认')).toBeVisible();

    // 再问一次：上一轮那两条不该还留在列表里，否则用户会执行到
    // 自己以为早就换掉的那批建议
    await page.getByPlaceholder(/这份问卷数据/).fill('再看一遍');
    await page.getByRole('button', { name: '开始分析' }).click();

    await expect(page.getByText('还有 2 条未确认')).toBeVisible();
    // 上一轮那条「将执行」的说法不该还在
    await expect(page.getByText(/将执行/)).toHaveCount(0);
  });

  test('无控制台错误', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await mockAgentStream(page);
    await importThenOpenAnalysis(page);
    await analyze(page);

    expect(consoleErrors).toEqual([]);
  });
});
