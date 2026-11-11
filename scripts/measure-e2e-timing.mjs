import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 端到端时长 / 卡顿实测（真实模型，生产构建）。
 *
 * 测的是「用户从上传到拿到结论」的完整一段：
 *   导入（解析 + 画像）→ 等计划 → 点「按此计划执行」→ 模型多轮工具循环 → 收尾。
 * 同时用 PerformanceObserver 收主线程 long task、用 rAF 采样帧间隔，
 * 以回答「界面卡不卡」——而不是只量确定性检查那 3.45 s。
 *
 * 运行前提：
 *   1. `pnpm build && pnpm start` 已在 3000 端口运行（.env.local 里配了真实模型）；
 *   2. 每次完整分析会调用真实模型（约 ¥0.12/次）。
 *
 * 用法：
 *   pnpm measure:e2e                 # 默认跑 2 次
 *   E2E_RUNS=3 pnpm measure:e2e      # 指定次数
 *   E2E_CPU_THROTTLE=4 pnpm measure:e2e   # 4× CPU 降速模拟弱设备
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const RUNS = Number(process.env.E2E_RUNS ?? 2);
const CPU_THROTTLE = Number(process.env.E2E_CPU_THROTTLE ?? 0);
const OUT_DIR = resolve(process.cwd(), 'knowledge/reports');
const SHOT_DIR = resolve(process.cwd(), '.tmp/e2e-timing-shots');
const RAW_SUFFIX = process.env.E2E_RAW_SUFFIX ?? '';
const RAW_NAME = `e2e-timing${RAW_SUFFIX}${CPU_THROTTLE > 0 ? `-cpu${CPU_THROTTLE}` : ''}.raw.json`;
const FIXTURE = resolve(process.cwd(), 'knowledge/eval/dataset/messy-eval.csv');
const QUESTION =
  process.env.E2E_QUESTION ?? '这份数据有什么质量问题？请全面检查，逐条给出结论。';
const PLAN_WAIT_MS = 240_000;
const EXECUTE_WAIT_MS = 300_000;
// 诊断用：开始分析前先停留一会儿。用于验证「长任务来自后台预取」这类归属
const SETTLE_MS = Number(process.env.E2E_SETTLE_MS ?? 0);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const round1 = (value) => Math.round(value * 10) / 10;

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function waitUntil(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return Date.now();
    await sleep(750);
  }
  throw new Error(`等待超时：${label}`);
}

async function runOnce(browser, page, runIndex) {
  let requests = 0;
  let activeRequests = 0;
  let lastFinishedAt = 0;
  page.on('request', (request) => {
    if (!request.url().includes('/api/agent')) return;
    requests += 1;
    activeRequests += 1;
  });
  page.on('requestfinished', (request) => {
    if (!request.url().includes('/api/agent')) return;
    activeRequests = Math.max(0, activeRequests - 1);
    lastFinishedAt = Date.now();
  });
  page.on('requestfailed', (request) => {
    if (!request.url().includes('/api/agent')) return;
    activeRequests = Math.max(0, activeRequests - 1);
    lastFinishedAt = Date.now();
  });

  // ---- 导入：解析 + 画像 ----
  await page.goto(`${BASE_URL}/import`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForSelector('input[type=file]', { timeout: 30_000 });
  const importStart = Date.now();
  await page.setInputFiles('input[type=file]', FIXTURE);
  await waitUntil(
    () =>
      page.evaluate(
        () => (document.body.textContent ?? '').includes('数据预览'),
      ),
    120_000,
    '导入预览',
  );
  const importMs = Date.now() - importStart;

  // ---- 进入分析 ----
  await page.getByTestId('sidebar').getByRole('link', { name: 'AI 分析' }).click();
  const box = page.getByPlaceholder(/这份问卷数据/);
  await box.waitFor({ state: 'visible', timeout: 30_000 });
  await box.fill(QUESTION);
  if (SETTLE_MS > 0) await sleep(SETTLE_MS);

  await page.evaluate(() => {
    const perf = window.__dshPerf;
    if (!perf) return;
    perf.watching = true;
    perf.t0 = performance.now();
    perf.longTasks = [];
    perf.frameGaps = [];
    perf.lastFrame = 0;
    perf.firstTextAt = 0;
  });
  const start = Date.now();
  const requestsBefore = requests;
  await page.getByRole('button', { name: '开始分析' }).click();

  // 首段内容出现（含计划卡片）：这是用户第一次看到反馈的延迟
  const firstTextAt = await waitUntil(
    () =>
      page.evaluate(() => {
        const text = [...document.querySelectorAll('[data-message-role="assistant"]')]
          .map((node) => node.textContent ?? '')
          .join('');
        return text.trim().length > 0;
      }),
    120_000,
    '首段内容',
  );
  const firstTextMs = firstTextAt - start;

  // ---- 等计划 ----
  let planClickedAt = 0;
  let planMs = 0;
  await waitUntil(
    async () =>
      page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const plan = buttons.find((button) => (button.textContent ?? '').includes('按此计划执行'));
        return plan !== undefined && plan.disabled === false;
      }),
    PLAN_WAIT_MS,
    '计划出现',
  );
  planMs = Date.now() - start;

  await page.getByRole('button', { name: '按此计划执行' }).click();
  planClickedAt = Date.now();

  // ---- 等执行完成：可能插一次追问，自动点「跳过」 ----
  // 完成条件必须看「没有在途请求且空闲 1.5 s」——只看输入框是否可编辑会
  // 在模型还没开始下一轮时就误判为完成（第一次测量踩过这个坑）。
  await waitUntil(
    async () => {
      const state = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const panel = document.querySelector('[data-testid="clarification-panel"]');
        const busy = buttons.some((button) => {
          const text = (button.textContent ?? '').trim();
          return text.includes('停止分析') || text.includes('分析中');
        });
        const assistantText = [...document.querySelectorAll('[data-message-role="assistant"]')]
          .map((node) => node.textContent ?? '')
          .join('');
        return {
          clarification: panel !== null,
          busy,
          assistantLength: assistantText.trim().length,
        };
      });
      if (state.clarification) {
        // 追问打断：点「跳过」按现有信息继续（与产品决策无关，只为把流程走完）
        await page
          .getByTestId('clarification-panel')
          .getByRole('button', { name: /跳过/ })
          .click()
          .catch(() => {});
        return false;
      }
      const idle =
        activeRequests === 0 && lastFinishedAt > 0 && Date.now() - lastFinishedAt > 1_500;
      return (
        idle && !state.busy && state.assistantLength > 100 && requests > requestsBefore
      );
    },
    EXECUTE_WAIT_MS,
    '分析完成',
  );
  const observedAt = Date.now();
  // 用「最后一个请求结束」而不是「静默 1.5 s 之后」作为结束时刻：
  // 后者会把确认窗口也算进用户等待里
  const totalMs = lastFinishedAt > 0 ? lastFinishedAt - start : observedAt - start;
  const executeMs = lastFinishedAt > 0 ? lastFinishedAt - planClickedAt : observedAt - planClickedAt;
  const idleConfirmMs = observedAt - (lastFinishedAt || observedAt);

  const perf = await page.evaluate(() => {
    const data = window.__dshPerf;
    if (!data) {
      return {
        longTaskCount: 0,
        longTaskTotalMs: 0,
        longTaskMaxMs: 0,
        frameCount: 0,
        jankFrames: 0,
        maxFrameGapMs: 0,
      };
    }
    data.watching = false;
    // 只认「开始统计之后才启动」的 long task：跨过 t0 之前启动的任务
    // 属于上一个页面视图，算进来会把导航开销误记到分析头上
    const longTasks = data.longTasks.filter((task) => task.start >= data.t0);
    const gaps = data.frameGaps;
    return {
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
      longTaskMaxMs: longTasks.reduce((max, task) => Math.max(max, task.duration), 0),
      longTaskStarts: longTasks.map((task) => Math.round(task.start - data.t0)),
      frameCount: gaps.length,
      jankFrames: gaps.filter((gap) => gap > 50).length,
      maxFrameGapMs: gaps.reduce((max, gap) => Math.max(max, gap), 0),
    };
  });

  const rounds = requests - requestsBefore;
  await page.screenshot({
    path: resolve(SHOT_DIR, `run${runIndex + 1}.png`),
    fullPage: false,
  });

  return {
    run: runIndex + 1,
    question: QUESTION,
    importMs,
    firstTextMs,
    planMs,
    executeMs,
    totalMs,
    idleConfirmMs,
    rounds,
    ...perf,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(SHOT_DIR, { recursive: true });
  if (!readFileSync(FIXTURE)) throw new Error('缺少评测数据集');
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (let index = 0; index < RUNS; index += 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const perf = {
        watching: false,
        t0: 0,
        longTasks: [],
        frameGaps: [],
        lastFrame: 0,
        firstTextAt: 0,
      };
      window.__dshPerf = perf;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (perf.watching) perf.longTasks.push({ start: entry.startTime, duration: entry.duration });
          }
        }).observe({ entryTypes: ['longtask'] });
      } catch {
        // 老浏览器没有 longtask：卡顿指标按 0 记，并在报告里标注
      }
      const loop = (time) => {
        if (perf.watching && perf.lastFrame > 0) perf.frameGaps.push(time - perf.lastFrame);
        perf.lastFrame = time;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    if (CPU_THROTTLE > 0) {
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    }
    try {
      const result = await runOnce(browser, page, index);
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(`第 ${index + 1} 次失败：${error.message}`);
      const debug = await page
        .evaluate(() => {
          const buttons = [...document.querySelectorAll('button')].map((button) => ({
            text: (button.textContent ?? '').trim().slice(0, 20),
            disabled: button.disabled,
          }));
          const assistantText = [...document.querySelectorAll('[data-message-role="assistant"]')]
            .map((node) => node.textContent ?? '')
            .join('');
          return {
            assistantLength: assistantText.trim().length,
            buttons: buttons.slice(-12),
            clarification: document.querySelector('[data-testid="clarification-panel"]') !== null,
            alerts: [...document.querySelectorAll('[role="alert"]')].map((node) =>
              (node.textContent ?? '').slice(0, 120),
            ),
          };
        })
        .catch(() => null);
      console.error('失败时页面状态：', JSON.stringify(debug));
      await page.screenshot({
        path: resolve(SHOT_DIR, `fail${index + 1}.png`),
        fullPage: false,
      });
    }
    await context.close();
  }
  await browser.close();

  const fields = ['importMs', 'firstTextMs', 'planMs', 'executeMs', 'totalMs', 'rounds', 'longTaskCount', 'longTaskTotalMs', 'longTaskMaxMs', 'frameCount', 'jankFrames', 'maxFrameGapMs'];
  const medians = Object.fromEntries(fields.map((field) => [field, median(results.map((row) => row[field]))]));
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    cpuThrottle: CPU_THROTTLE,
    runs: results,
    medians,
  };
  writeFileSync(resolve(OUT_DIR, RAW_NAME), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log('\n中位数：', JSON.stringify(Object.fromEntries(Object.entries(medians).map(([key, value]) => [key, round1(value)]))));
}

await main();
