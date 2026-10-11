'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Dataset } from '@/core';

const ROW_HEIGHT = 32;
/** 单元格固定宽度，超长文本靠 CSS 省略，避免一列把表格撑爆 */
const CELL_WIDTH = 160;
/** 行号列宽度 */
const INDEX_WIDTH = 56;

export function DataTable({ dataset }: { dataset: Dataset }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: dataset.rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // 多渲染几行，快速滚动时不会看到空白
    overscan: 12,
  });

  const rows = virtualizer.getVirtualItems();
  const totalWidth = INDEX_WIDTH + dataset.columns.length * CELL_WIDTH;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div ref={scrollRef} data-testid="data-table-scroll" className="max-h-[420px] overflow-auto">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* 表头吸顶：纵向滚动时始终可见 */}
          <div className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50">
            <div
              style={{ width: INDEX_WIDTH }}
              className="shrink-0 px-2 py-2 text-right text-xs font-medium text-neutral-400"
            >
              #
            </div>
            {dataset.columns.map((column, index) => (
              <div
                key={`${column.name}-${index}`}
                style={{ width: CELL_WIDTH }}
                className="shrink-0 truncate border-l border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700"
                title={`${column.name}（第 ${index + 1} 列）`}
              >
                {/* 列序号要可见：表头重名时两个「年龄」靠名字区分不出来 */}
                <span className="mr-1.5 tabular-nums text-neutral-400">#{index + 1}</span>
                {column.name}
              </div>
            ))}
          </div>

          {/* 用一个高容器撑出总高度，再绝对定位渲染可见行 */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {rows.map((row) => (
              <div
                key={row.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: ROW_HEIGHT,
                  transform: `translateY(${row.start}px)`,
                }}
                className="flex border-b border-neutral-100 hover:bg-neutral-50"
              >
                <div
                  style={{ width: INDEX_WIDTH }}
                  className="shrink-0 px-2 py-1.5 text-right text-xs tabular-nums text-neutral-400"
                >
                  {row.index + 1}
                </div>
                {dataset.columns.map((column, columnIndex) => {
                  const value = column.values[row.index];
                  return (
                    <div
                      key={`${column.name}-${columnIndex}`}
                      style={{ width: CELL_WIDTH }}
                      className="shrink-0 truncate border-l border-neutral-100 px-3 py-1.5 text-xs text-neutral-700"
                      title={value === null ? '' : String(value)}
                    >
                      {value === null ? <span className="text-neutral-300">—</span> : String(value)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500">
        共 {dataset.rowCount.toLocaleString('zh-CN')} 行 × {dataset.columns.length} 列
      </div>
    </div>
  );
}
