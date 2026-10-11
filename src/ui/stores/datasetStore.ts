import { create } from 'zustand';
import { profileDataset, runAllChecks, type DatasetProfile, type QualityIssue } from '@/core';
import { parseInWorker } from '@/parser/workerClient';
import { isParseError, type ParseResult } from '@/parser/types';
import { readFileAsArrayBuffer } from '@/ui/lib/readFile';

/**
 * 界面状态机。
 *
 * 只在这四种状态之间流转，避免出现「既在解析又有结果」这类矛盾状态：
 *   idle → parsing → ready
 *                  ↘ error
 */
export type DatasetStatus = 'idle' | 'parsing' | 'ready' | 'error';

interface DatasetState {
  status: DatasetStatus;
  parseResult: ParseResult | null;
  profile: DatasetProfile | null;
  issues: QualityIssue[];
  error: string | null;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;
}

const initialState = {
  status: 'idle' as DatasetStatus,
  parseResult: null,
  profile: null,
  issues: [],
  error: null,
};

export const useDatasetStore = create<DatasetState>((set) => ({
  ...initialState,

  async loadFile(file: File) {
    set({ status: 'parsing', error: null, parseResult: null, profile: null, issues: [] });

    try {
      // 先读成 ArrayBuffer 再交给 Worker：Worker 里拿不到 File 对象，
      // 而且 buffer 可以被转移所有权，避免大文件被复制一份
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
    } catch (error) {
      set({
        status: 'error',
        error: `读取文件时出错：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  reset() {
    set(initialState);
  },
}));
