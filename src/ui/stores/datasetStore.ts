import { create } from 'zustand';
import { listChecks, type DatasetProfile, type QualityIssue } from '@/core';
import { parseInWorker } from '@/parser/workerClient';
import { fileTooLargeError } from '@/parser/index';
import { isParseError, MAX_FILE_BYTES, type ParseResult } from '@/parser/types';
import { readFileAsArrayBuffer } from '@/ui/lib/readFile';
import { datasetCache } from '@/ui/lib/datasetCache';
import {
  profileInWorker,
  runChecksInWorker,
  isChecksWorkerAvailable,
} from '@/ui/lib/workerChecks';
import { runSynonymCheck } from '@/ui/lib/synonymBridge';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { useReviewStore } from '@/ui/stores/reviewStore';
import { embedder } from '@/embedding/instance';

/**
 * 界面状态机。
 *
 * 只在这几种状态之间流转，避免出现「既在解析又有结果」这类矛盾状态：
 *   idle → parsing → profiling → ready
 *                  ↘ error
 *
 * `profiling` 是 2026-10-19 加的：剖析（约 0.9 秒 / 5 万 × 50）搬进 Worker 之后，
 * 「解析完了、画像还没算完」成了一个真实的中间态。**不把它并进 `parsing` 是因为
 * 那句文案说的是「正在解析数据」**，而这时数据已经解析完了 —— 说错一步，排查问题时
 * 就会去错的地方找。
 */
export type DatasetStatus = 'idle' | 'parsing' | 'profiling' | 'ready' | 'error';

/**
 * 第一次同步检查要跑哪些项。
 *
 * `category-synonyms` 被排除，因为它由 `runSynonymCheck` 单独跑（它要等模型）。
 * 不排除的话同一条问题会出现两次：首次同步跑一遍 L1/L2，异步那次再跑一遍带 L3 的，
 * 而 `createIssueId` 每次自增，两条 id 不同、不会去重，界面上就并排显示两条一模一样的。
 * 这不只是观感问题 —— 严重度计数会翻倍，用户看到重复会开始怀疑整套检查。
 *
 * 用「全部检查减去它」而不是写死清单：新增检查项会自动被纳入，不必回来改这里。
 */
const SYNC_CHECK_IDS = listChecks()
  .map((check) => check.id)
  .filter((id) => id !== 'category-synonyms');

/**
 * 语义归并的状态。它必须单独暴露给界面 —— spec §4.3 要求
 * 「功能未就绪时界面显示『语义归并准备中』」「不可用时界面明示」，
 * 悄悄降级会让用户以为「检查过了、没问题」。
 */
export type SynonymStatus = 'idle' | 'pending' | 'ready' | 'degraded';

/**
 * 检查的执行状态。
 *
 * 检查现在跑在 Web Worker 里（Plan 4 Task 8），所以「还没跑完」成了一个真实存在的中间态。
 * 它必须与「跑完了、没问题」分开：空的问题清单在界面上的意思是「这份数据干净」，
 * 而检查没跑完时说这句话就是在给一个我们并不知道的结论。
 */
export type ChecksStatus = 'idle' | 'running' | 'done' | 'failed';

/** 当前数据是从本地暂存恢复来的。界面必须明说，否则用户会以为是他刚上传的那份。 */
export interface RestoredInfo {
  /** ISO 时间串，恢复时直接显示 */
  savedAt: string;
}

interface DatasetState {
  status: DatasetStatus;
  parseResult: ParseResult | null;
  profile: DatasetProfile | null;
  issues: QualityIssue[];
  error: string | null;
  synonymStatus: SynonymStatus;
  /** 降级原因，界面直接显示 */
  synonymNote: string | null;
  /** 检查是否跑完。见 `ChecksStatus` 的说明 —— 它不能与「没问题」混为一谈 */
  checksStatus: ChecksStatus;
  /** 检查失败的原因，界面直接显示 */
  checksNote: string | null;
  /**
   * 本次检查是否真的跑在 Worker 里。
   *
   * 界面不能一边承诺「计算在后台线程、可以继续操作」一边在主线程同步跑 ——
   * 那会让用户以为点击没生效。所以降级时要换文案，而不是继续说漂亮话。
   */
  checksOffThread: boolean;
  /** 非空表示这份数据不是刚上传的，而是刷新后从本地暂存恢复的 */
  restored: RestoredInfo | null;
  /** 本地暂存本身出问题时的说明（读不回来 / 存不进去），界面直接显示 */
  cacheNote: string | null;
  loadFile: (file: File) => Promise<void>;
  /** 应用启动时尝试恢复上次的数据，幂等 */
  restoreLastDataset: () => Promise<void>;
  reset: () => void;
}

const initialState = {
  status: 'idle' as DatasetStatus,
  parseResult: null,
  profile: null,
  issues: [],
  error: null,
  synonymStatus: 'idle' as SynonymStatus,
  synonymNote: null,
  checksStatus: 'idle' as ChecksStatus,
  checksNote: null,
  checksOffThread: false,
  restored: null,
  cacheNote: null,
};

/**
 * 每次载入递增。异步的语义检查回来时用它判断「结果还属不属于当前这份数据」——
 * 用户完全可能在它跑完之前又传了一份新数据，那时把旧结果并进去就是在展示
 * 与当前数据无关的问题。
 */
let loadToken = 0;

/**
 * 「恢复上次数据」只尝试一次。
 *
 * 每个页面挂载时都会问一次，而 store 是全局的：不设这个闸门的话，用户在页面间
 * 跳来跳去会反复读盘，更糟的是在用户已经上传新数据之后，某次挂载又把旧数据翻出来。
 */
let restoreAttempted = false;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useDatasetStore = create<DatasetState>((set, get) => {
  /**
   * 数据就位后的统一后续动作：画像、检查、留痕起点、审阅列表、异步语义归并。
   *
   * **上传与恢复必须走同一段代码。** 各写一遍的话，迟早有一次忘了重算画像或忘了
   * 清审阅列表，而那种不一致在界面上看不出来 —— 只会表现为「某个数字对不上」。
   *
   * 画像与检查都在 Worker 里（`profileInWorker` / `runChecksInWorker`），所以这个
   * 函数是异步的。**它要等检查结果就位才 resolve**：调用方据此判断「这次分析真的
   * 完成了」，而不是看到一个空清单就当结论。
   *
   * 画像先于 `ready`：`/check` 的渲染条件里要求 `profile` 非空，先 `ready` 再补画像
   * 会让它在那一瞬间显示「还没有导入数据」—— 一句与事实不符的话。
   */
  async function adoptDataset(token: number, result: ParseResult): Promise<void> {
    set({
      status: 'profiling',
      error: null,
      parseResult: result,
      profile: null,
      issues: [],
      // 画像还没出来，检查还没开始。这里必须是 idle：写成 running 会出现
      // 「正在检查」但根本没有请求在跑的那种状态
      checksStatus: 'idle',
      checksNote: null,
    });

    // 画像失败要抛出去给调用方（上传/恢复各自的 catch 会说清是哪个环节失败的），
    // 不能在这里吞掉 —— 没有画像就没有列画像面板与检查页，这不是「可以继续」的状态
    const profile = await profileInWorker(result.dataset);
    if (token !== loadToken) return;

    set({ status: 'ready', profile, checksStatus: 'running' });

    // 清洗留痕从这里开始记：它必须拿到**完整**的 Dataset。
    // `run_checks` 允许只跑几列，那个缩略版本绝不能流到这里 ——
    // 用它执行清洗会把其余列静默丢掉（Review Focus 第 4 条）。
    useProvenanceStore.getState().start(result.dataset);

    // 审阅列表也必须一起清：它装的是**上一份数据**的结论。
    // 不清的话，上一份里「已接受」的条目会让「执行清洗」按钮在新数据上依然可点，
    // 一点就把旧动作应用到新数据上 —— 列名碰巧相同就会真的改错数据。
    useReviewStore.getState().beginRun();

    // 语义归并单独跑：它要等模型（首次约 25 MB），同步等会把首屏卡住。
    set({ synonymStatus: 'pending' });
    void runSynonymCheck(result.dataset, embedder)
      .then((outcome) => {
        // 结果回来时数据可能已经换了，这时候丢弃它
        if (token !== loadToken) return;
        // 函数式更新：检查结果也在往同一个数组里追加，整体赋值会把先回来的那批冲掉
        set((state) => ({
          issues: [...state.issues, ...outcome.issues],
          synonymStatus: outcome.degraded ? 'degraded' : 'ready',
          synonymNote: outcome.degradedReason ?? null,
        }));
      })
      .catch((error: unknown) => {
        if (token !== loadToken) return;
        // runSynonymCheck 自己会把 embedding 失败降级掉，走到这里说明是别的错。
        // 不能让一个附加功能把主流程拖进 error 状态 —— 已有的检查结果仍然有效。
        set({
          synonymStatus: 'degraded',
          synonymNote: `语义归并未能完成：${describeError(error)}`,
        });
      });

    try {
      // 先把「会不会真的跑在后台线程」定下来，再等结果：文案不能承诺了再降级
      const pendingChecks = runChecksInWorker(result.dataset, { enabled: SYNC_CHECK_IDS });
      const offThread = isChecksWorkerAvailable();
      if (token === loadToken) set({ checksOffThread: offThread });

      const issues = await pendingChecks;
      if (token !== loadToken) return;
      set((state) => ({
        issues: [...state.issues, ...issues],
        checksStatus: 'done',
      }));
    } catch (error) {
      if (token !== loadToken) return;
      // 只说「检查没完成」和原因。**不要断言「下面这份清单是空的」** ——
      // 语义归并可能先回来，那时清单并不空，那句话就成了假的
      set({
        checksStatus: 'failed',
        checksNote: `检查没能完成：${describeError(error)}。请重新检查，或刷新页面重试；在此之前不要把这看成「没有问题」。`,
      });
    }
  }

  /**
   * 把这份数据写进本地暂存。
   *
   * 写入失败不能影响这次分析 —— 数据还在内存里，用户此刻能正常用。
   * 但也不能装作没发生：**「刷新后还在」是这次新给的承诺**，没做到就要说出来，
   * 否则用户会在下次刷新时才发现，而那时已经来不及了。
   *
   * **它是「发起写入」而不是「等写完」**：`datasetCache.save` 内部是结构化的克隆 +
   * 异步提交事务，5 万 × 50 大约百毫秒级。为保证预览立刻出现，这里不等它 ——
   * 代价是「预览已出现、事务尚未提交」那一小段窗口里刷新页面仍可能丢数据。
   * E2E 用的 7 行数据撞不到这个窗口，所以它不是被测试覆盖的保证。
   */
  function rememberDataset(result: ParseResult): void {
    void datasetCache.save(result).catch((error: unknown) => {
      set({ cacheNote: `这次的数据没能存进浏览器本地，刷新后会丢失：${describeError(error)}` });
    });
  }

  return {
    ...initialState,

    async loadFile(file: File) {
      const token = (loadToken += 1);
      set({
        status: 'parsing',
        error: null,
        parseResult: null,
        profile: null,
        issues: [],
        synonymStatus: 'idle',
        synonymNote: null,
        // 上一份数据的检查状态必须一并复位：留着 failed 的文案，会在「正在解析」的
        // 界面上挂一条来自另一份数据的告警
        checksStatus: 'idle',
        checksNote: null,
        checksOffThread: false,
        // 新数据一进来，上一次的恢复标记与暂存告警就都不再适用
        restored: null,
        cacheNote: null,
      });

      try {
        // 先按 file.size 判定体积：readFileAsArrayBuffer 会把整个文件读进内存，
        // 读完之后再检查等于没有保护
        if (file.size > MAX_FILE_BYTES) {
          set({ status: 'error', error: fileTooLargeError(file.size).message });
          return;
        }

        // 读成 ArrayBuffer 再交给 Worker：Worker 里拿不到 File 对象
        const buffer = await readFileAsArrayBuffer(file);
        const result = await parseInWorker({
          buffer,
          fileName: file.name,
          fileSize: file.size,
        });

        if (isParseError(result)) {
          set({ status: 'error', error: result.message, synonymStatus: 'idle', synonymNote: null });
          return;
        }

        // 落盘要在等检查之前：检查要跑几秒，这期间用户若刷新页面，
        // 数据必须先已经存下来了
        rememberDataset(result);
        await adoptDataset(token, result);
      } catch (error) {
        set({
          status: 'error',
          // 这段既接读取/解析的失败，也接「数据解析出来了但画像算不出来」——
          // 后者不是文件坏了，所以文案不写死「这个文件读不了」
          error: `读取文件或计算列画像时出错：${describeError(error)}`,
          // 状态条必须跟着一起清掉：留着上一份数据的「语义归并已就绪」，
          // 会让用户在导入失败之后仍以为语义层跑过了
          synonymStatus: 'idle',
          synonymNote: null,
        });
      }
    },

    async restoreLastDataset() {
      if (restoreAttempted) return;
      restoreAttempted = true;

      // 用户已经走完一步了，这时再把上次的数据塞进界面就是覆盖他当前的工作
      if (get().status !== 'idle') return;

      const token = loadToken;
      // 读盘失败要单独接住：它既不能冒充「上次没数据」，也不该把整个界面推进 error
      const outcome = await datasetCache.load().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      if (!outcome.ok) {
        set({ cacheNote: `没能读回上次导入的数据：${describeError(outcome.error)}。请重新上传。` });
        return;
      }

      const restored = outcome.value;
      if (restored === null) return;
      // 读盘期间用户可能已经上传了新数据（或点了 reset），那份数据优先
      if (token !== loadToken || get().status !== 'idle') return;

      // 顺序要紧：先打标记再 adopt，界面才不会出现「数据已就位但还没说它是恢复来的」那一帧
      set({ restored: { savedAt: restored.savedAt } });
      try {
        await adoptDataset(token, restored.parseResult);
      } catch (error) {
        // `RestoreNotice` 是 `void restoreLastDataset()` 调的，这里不接住就成了
        // 未处理的 Promise rejection：界面停在 idle、一句话都没有，用户不知道发生了什么
        if (token !== loadToken) return;
        set({ restored: null, cacheNote: `恢复上次数据时出错了：${describeError(error)}。请重新上传。` });
      }
    },

    reset() {
      // 递增令牌：重置之后旧数据的异步检查结果不该再并进来
      loadToken += 1;
      set(initialState);
      // 清空本地暂存。不清的话，用户点「放弃并重新上传」之后一刷新，
      // 被放弃的那份数据又回来了 —— 他会以为按钮没生效。
      // 失败要说出来：那正是「放弃无效」这个结果的唯一提示
      void datasetCache.clear().catch((error: unknown) => {
        set({
          cacheNote: `没能清掉本地暂存：${describeError(error)}。刷新后这份数据可能还会出现，请在浏览器设置里清除本站数据。`,
        });
      });
    },
  };
});

/** 供测试使用：重置模块级的令牌与「已尝试恢复」标记 */
export function resetDatasetStoreForTest(): void {
  loadToken = 0;
  restoreAttempted = false;
}
