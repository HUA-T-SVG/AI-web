'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { History } from 'lucide-react';
import { useDatasetStore } from '@/ui/stores/datasetStore';

/** 恢复时间按本机时区显示 —— 用户判断「这是不是我要的那份」靠的就是它 */
function formatSavedAt(savedAt: string): string {
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) return savedAt;
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

/**
 * 「这份数据是上次的」提示条。挂在应用外壳上，所以每个页面都能看到。
 *
 * **为什么要明说**：静默恢复比不恢复更危险。用户刷新页面后看到表格，会以为那就是
 * 他刚才上传的那份，于是接着往下分析 —— 而它可能来自昨天的另一次导入。所以除了提示，
 * 还要给出「放弃并重新上传」这条出口：只提示不给出口，等于把用户困在一份来历
 * 说不清的数据上。
 *
 * 顺带承担「尝试恢复」这个副作用：它必须只挂一份、尽量早，而外壳正合适。
 * store 里有幂等闸门，多页面挂载不会反复读盘。
 */
export function RestoreNotice() {
  const restored = useDatasetStore((state) => state.restored);
  const cacheNote = useDatasetStore((state) => state.cacheNote);
  const fileName = useDatasetStore((state) => state.parseResult?.meta.fileName ?? null);
  const restoreLastDataset = useDatasetStore((state) => state.restoreLastDataset);
  const reset = useDatasetStore((state) => state.reset);

  useEffect(() => {
    void restoreLastDataset();
  }, [restoreLastDataset]);

  return (
    <>
      {restored !== null ? (
        <div
          data-testid="restore-notice"
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning-200 bg-warning-50 px-4 py-2 text-xs text-warning-700 sm:px-6 lg:px-10"
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            已恢复上次导入的数据「{fileName}」（{formatSavedAt(restored.savedAt)}
            ）—— 它不是刚刚上传的。
          </span>
          <Link
            href="/import"
            onClick={() => reset()}
            className="font-medium underline underline-offset-2 hover:text-warning-700"
          >
            放弃并重新上传
          </Link>
        </div>
      ) : null}

      {cacheNote !== null ? (
        <p
          data-testid="cache-note"
          className="border-b border-warning-200 bg-warning-50 px-4 py-2 text-xs text-warning-700 sm:px-6 lg:px-10"
        >
          {cacheNote}
        </p>
      ) : null}
    </>
  );
}
