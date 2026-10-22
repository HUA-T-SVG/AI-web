'use client';

import { usePathname } from 'next/navigation';
import { FileSpreadsheet, History } from 'lucide-react';
import { Badge } from '@/ui/components/base/Badge';
import { useDatasetStore } from '@/ui/stores/datasetStore';

/**
 * 全局文件上下文条（设计文档第一节）。
 *
 * 所有工作页顶部固定显示「当前在看哪份文件、多大、第几版」—— 用户从检查页跳到
 * 导出页时，不必再靠记忆确认自己还在同一份数据上。导入页本身有文件栏，这里不重复。
 *
 * 版本号每次载入/恢复 +1：将来出现「旧结论属于旧版本」时，界面有东西可以指向它。
 */
export function DataContextBar() {
  const pathname = usePathname();
  const parseResult = useDatasetStore((state) => state.parseResult);
  const dataVersion = useDatasetStore((state) => state.dataVersion);
  const checksStatus = useDatasetStore((state) => state.checksStatus);
  const restored = useDatasetStore((state) => state.restored);

  if (parseResult === null || pathname === '/import') return null;

  const { dataset, meta } = parseResult;
  const verdict =
    checksStatus === 'done'
      ? { tone: 'success' as const, text: '检查完成' }
      : checksStatus === 'running'
        ? { tone: 'brand' as const, text: '检查中' }
        : checksStatus === 'failed'
          ? { tone: 'medium' as const, text: '结论未知' }
          : { tone: 'neutral' as const, text: '尚未检查' };

  return (
    <div
      data-testid="data-context"
      className="border-b border-line bg-surface/90 px-4 py-2 backdrop-blur sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <span className="max-w-[40ch] truncate font-medium text-ink" title={meta.fileName}>
          {meta.fileName}
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {dataset.rowCount.toLocaleString('zh-CN')} 行 × {dataset.columns.length} 列
        </span>
        <Badge tone="neutral">数据版本 v{dataVersion}</Badge>
        <Badge tone={verdict.tone}>{verdict.text}</Badge>
        {restored !== null ? (
          <span className="inline-flex items-center gap-1">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            本机恢复的数据
          </span>
        ) : null}
      </div>
    </div>
  );
}
