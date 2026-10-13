import { create } from 'zustand';
import { profileDataset, runAllChecks, type DatasetProfile, type QualityIssue } from '@/core';
import { parseInWorker } from '@/parser/workerClient';
import { fileTooLargeError } from '@/parser/index';
import { isParseError, MAX_FILE_BYTES, type ParseResult } from '@/parser/types';
import { readFileAsArrayBuffer } from '@/ui/lib/readFile';
import { runSynonymCheck } from '@/ui/lib/synonymBridge';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { embedder } from '@/embedding/instance';

/**
 * 界面状态机。
 *
 * 只在这四种状态之间流转，避免出现「既在解析又有结果」这类矛盾状态：
 *   idle → parsing → ready
 *                  ↘ error
 */
export type DatasetStatus = 'idle' | 'parsing' | 'ready' | 'error';

/**
 * 语义归并的状态。它必须单独暴露给界面 —— spec §4.3 要求
 * 「功能未就绪时界面显示『语义归并准备中』」「不可用时界面明示」，
 * 悄悄降级会让用户以为「检查过了、没问题」。
 */
export type SynonymStatus = 'idle' | 'pending' | 'ready' | 'degraded';

interface DatasetState {
  status: DatasetStatus;
  parseResult: ParseResult | null;
  profile: DatasetProfile | null;
  issues: QualityIssue[];
  error: string | null;
  synonymStatus: SynonymStatus;
  /** 降级原因，界面直接显示 */
  synonymNote: string | null;
  loadFile: (file: File) => Promise<void>;
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
};

/**
 * 每次载入递增。异步的语义检查回来时用它判断「结果还属不属于当前这份数据」——
 * 用户完全可能在它跑完之前又传了一份新数据，那时把旧结果并进去就是在展示
 * 与当前数据无关的问题。
 */
let loadToken = 0;

export const useDatasetStore = create<DatasetState>((set, get) => ({
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
        set({ status: 'error', error: result.message });
        return;
      }

      set({
        status: 'ready',
        parseResult: result,
        profile: profileDataset(result.dataset),
        issues: runAllChecks(result.dataset),
      });

      // 清洗留痕从这里开始记：它必须拿到**完整**的 Dataset。
      // `run_checks` 允许只跑几列，那个缩略版本绝不能流到这里 ——
      // 用它执行清洗会把其余列静默丢掉（Review Focus 第 4 条）。
      useProvenanceStore.getState().start(result.dataset);

      // 语义归并单独跑：它要等模型（首次约 25 MB），同步等会把首屏卡住。
      // 所以先把不依赖模型的检查结果交出去，再把它的结果并进来。
      set({ synonymStatus: 'pending' });
      void runSynonymCheck(result.dataset, embedder)
        .then((outcome) => {
          // 结果回来时数据可能已经换了，这时候丢弃它
          if (token !== loadToken) return;
          set({
            issues: [...get().issues, ...outcome.issues],
            synonymStatus: outcome.degraded ? 'degraded' : 'ready',
            synonymNote: outcome.degradedReason ?? null,
          });
        })
        .catch((error: unknown) => {
          if (token !== loadToken) return;
          // runSynonymCheck 自己会把 embedding 失败降级掉，走到这里说明是别的错。
          // 不能让一个附加功能把主流程拖进 error 状态 —— 已有的检查结果仍然有效。
          set({
            synonymStatus: 'degraded',
            synonymNote: `语义归并未能完成：${error instanceof Error ? error.message : String(error)}`,
          });
        });
    } catch (error) {
      set({
        status: 'error',
        error: `读取文件时出错：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  reset() {
    // 递增令牌：重置之后旧数据的异步检查结果不该再并进来
    loadToken += 1;
    set(initialState);
  },
}));
