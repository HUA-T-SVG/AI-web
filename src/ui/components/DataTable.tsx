'use client';

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Dataset } from '@/core';

const ROW_HEIGHT = 32;
/** 单元格固定宽度，超长文本靠 CSS 省略，避免一列把表格撑爆 */
const CELL_WIDTH = 160;
/** 行号列宽度 */
const INDEX_WIDTH = 56;

const HIGHLIGHT_TONE = {
  brand: 'bg-brand-50',
  warning: 'bg-warning-50',
  danger: 'bg-danger-50',
} as const;

export function DataTable({
  dataset,
  /** 要突出的行（0 基），例如当前选中问题涉及的行 */
  highlightRows = [],
  /** 只显示这些行（0 基）；不传表示全部。用于「仅看相关记录」 */
  visibleRows,
  highlightTone = 'brand',
}: {
  dataset: Dataset;
  highlightRows?: number[];
  visibleRows?: number[];
  highlightTone?: keyof typeof HIGHLIGHT_TONE;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowOrder = useMemo(
    () => visibleRows ?? Array.from({ length: dataset.rowCount }, (_, index) => index),
    [dataset.rowCount, visibleRows],
  );
  const highlighted = useMemo(() => new Set(highlightRows), [highlightRows]);

  const virtualizer = useVirtualizer({
    count: rowOrder.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // 多渲染几行，快速滚动时不会看到空白
    overscan: 12,
  });

  const rows = virtualizer.getVirtualItems();
  const totalWidth = INDEX_WIDTH + dataset.columns.length * CELL_WIDTH;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div ref={scrollRef} data-testid="data-table-scroll" className="max-h-[420px] overflow-auto">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* 表头吸顶：纵向滚动时始终可见 */}
          <div className="sticky top-0 z-10 flex border-b border-line bg-canvas">
            <div
              style={{ width: INDEX_WIDTH }}
              className="shrink-0 px-2 py-2 text-right text-[13px] font-medium text-ink-muted"
            >
              #
            </div>
            {dataset.columns.map((column, index) => (
              <div
                key={`${column.name}-${index}`}
                style={{ width: CELL_WIDTH }}
                className="shrink-0 truncate border-l border-line px-3 py-2 text-[13px] font-medium text-ink"
                title={`${column.name}（第 ${index + 1} 列）`}
              >
                {/* 列序号要可见：表头重名时两个「年龄」靠名字区分不出来 */}
                <span className="mr-1.5 tabular-nums text-ink-muted">#{index + 1}</span>
                {column.name}
              </div>
            ))}
          </div>

          {/* 用一个高容器撑出总高度，再绝对定位渲染可见行 */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {rows.map((row) => {
              const datasetRow = rowOrder[row.index] ?? 0;
              const isHighlighted = highlighted.has(datasetRow);
              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: ROW_HEIGHT,
                    transform: `translateY(${row.start}px)`,
                  }}
                  className={`flex border-b border-line/70 ${
                    isHighlighted ? HIGHLIGHT_TONE[highlightTone] : 'hover:bg-brand-50/40'
                  }`}
                  data-row-number={datasetRow + 1}
                  data-highlighted={isHighlighted ? 'true' : undefined}
                >
                  <div
                    style={{ width: INDEX_WIDTH }}
                    className="shrink-0 px-2 py-1.5 text-right text-[13px] tabular-nums text-ink-muted"
                  >
                    {datasetRow + 1}
                  </div>
                  {dataset.columns.map((column, columnIndex) => {
                    const value = column.values[datasetRow];
                    return (
                      <div
                        key={`${column.name}-${columnIndex}`}
                        style={{ width: CELL_WIDTH }}
                        className="shrink-0 truncate border-l border-line/70 px-3 py-1.5 text-[13px] text-ink"
                        title={value === null ? '' : String(value)}
                      >
                        {value === null ? <span className="text-ink-muted/50">—</span> : String(value)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-canvas px-3 py-1.5 text-[13px] text-ink-muted">
        共 {dataset.rowCount.toLocaleString('zh-CN')} 行 × {dataset.columns.length} 列
        {visibleRows !== undefined ? ` · 当前显示 ${visibleRows.length} 行` : ''}
      </div>
    </div>
  );
}
