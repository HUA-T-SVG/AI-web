'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Dataset } from '@/core';

const ROW_HEIGHT = 32;
/** 单元格默认宽度，超长文本靠 CSS 省略，避免一列把表格撑爆 */
const DEFAULT_CELL_WIDTH = 160;
const MIN_CELL_WIDTH = 80;
const MAX_CELL_WIDTH = 420;
/** 行号列宽度 */
const INDEX_WIDTH = 56;

const HIGHLIGHT_TONE = {
  brand: 'bg-brand-50',
  warning: 'bg-warning-50',
  danger: 'bg-danger-50',
} as const;

interface CellDetail {
  column: string;
  columnIndex: number;
  rowNumber: number;
  value: string;
}

export function DataTable({
  dataset,
  /** 要突出的行（0 基），例如当前选中问题涉及的行 */
  highlightRows = [],
  /** 只显示这些行（0 基）；不传表示全部。用于「仅看相关记录」 */
  visibleRows,
  highlightTone = 'brand',
  /** 需要定位到视野里的列（0 基）。字段概况点击后传进来 */
  focusedColumn = null,
  /** 需要滚动定位并加圈的行（0 基）。问题详情里点「跳到第 N 行」后传进来 */
  focusedRow = null,
}: {
  dataset: Dataset;
  highlightRows?: number[];
  visibleRows?: number[];
  highlightTone?: keyof typeof HIGHLIGHT_TONE;
  focusedColumn?: number | null;
  focusedRow?: number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<number[]>(() =>
    dataset.columns.map(() => DEFAULT_CELL_WIDTH),
  );
  const [detail, setDetail] = useState<CellDetail | null>(null);
  // 拖拽状态放 ref：pointermove 高频触发，走 state 会让整张表每像素重渲染
  const dragging = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const columnKey = dataset.columns.map((column) => column.name).join('\u0001');
  useEffect(() => {
    // 换了一份数据就回到默认列宽：沿用上一份的宽度会把新列挤成一条缝
    setWidths(dataset.columns.map(() => DEFAULT_CELL_WIDTH));
  }, [columnKey, dataset.columns]);

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
  const widthOf = (index: number) => widths[index] ?? DEFAULT_CELL_WIDTH;
  const totalWidth =
    INDEX_WIDTH + dataset.columns.reduce((sum, _, index) => sum + widthOf(index), 0);

  // 字段概况点了某一列：把它滚到视野里，并高亮表头。用 requestAnimationFrame
  // 是因为列宽刚变时布局还没提交，直接算 scrollLeft 会偏。
  useEffect(() => {
    if (focusedColumn === null || focusedColumn < 0) return;
    const frame = requestAnimationFrame(() => {
      const offset =
        INDEX_WIDTH + widths.slice(0, focusedColumn).reduce((sum, width) => sum + width, 0);
      scrollRef.current?.scrollTo({ left: Math.max(0, offset - 24), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedColumn, widths]);

  // 问题详情里点了「跳到第 N 行」：把那一行滚到视野中间。虚拟列表只渲染可见行，
  // 不滚动的话目标行根本不在 DOM 里 —— 这不是加个高亮样式就能解决的事。
  useEffect(() => {
    if (focusedRow === null || focusedRow < 0) return;
    const index = rowOrder.indexOf(focusedRow);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(index, { align: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedRow, rowOrder, virtualizer]);

  const startResize = (index: number, clientX: number) => {
    dragging.current = { index, startX: clientX, startWidth: widthOf(index) };
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = dragging.current;
      if (!current) return;
      const next = Math.min(
        MAX_CELL_WIDTH,
        Math.max(MIN_CELL_WIDTH, current.startWidth + event.clientX - current.startX),
      );
      setWidths((previous) => {
        const copy = [...previous];
        copy[current.index] = next;
        return copy;
      });
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // 长文本不能只靠 title：触屏没有 hover。点单元格看全文，也方便读屏用户
  useEffect(() => {
    if (detail === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {/* 表格单元格的高度由行高（32px）决定，触屏上小于 44px —— 这是已知取舍：
          把行高抬到 44px 会让同屏行数少三成，核对场景更吃亏。长文本另有
          点击弹层兜底，触屏用户点偏一次也只是多弹一次，不会误改数据。 */}
      <p className="border-b border-line bg-canvas px-3 py-1.5 text-xs text-ink-muted md:hidden">
        表格可左右滑动查看更多列；点长文本单元格可看全文。
      </p>
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
                style={{ width: widthOf(index) }}
                data-column-index={index + 1}
                data-focused={focusedColumn === index ? 'true' : undefined}
                className={`relative flex shrink-0 items-center border-l border-line px-3 py-2 text-[13px] font-medium ${
                  focusedColumn === index ? 'bg-brand-100 text-brand-900' : 'text-ink'
                }`}
                title={`${column.name}（第 ${index + 1} 列）`}
              >
                <span className="truncate">
                  {/* 列序号要可见：表头重名时两个「年龄」靠名字区分不出来 */}
                  <span className="mr-1.5 tabular-nums text-ink-muted">#{index + 1}</span>
                  {column.name}
                </span>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`调整「${column.name}」列宽`}
                  tabIndex={0}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    startResize(index, event.clientX);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    const delta = event.key === 'ArrowRight' ? 16 : -16;
                    setWidths((previous) => {
                      const copy = [...previous];
                      copy[index] = Math.min(
                        MAX_CELL_WIDTH,
                        Math.max(MIN_CELL_WIDTH, widthOf(index) + delta),
                      );
                      return copy;
                    });
                  }}
                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none hover:bg-brand-200/60"
                />
              </div>
            ))}
          </div>

          {/* 用一个高容器撑出总高度，再绝对定位渲染可见行 */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {rows.map((row) => {
              const datasetRow = rowOrder[row.index] ?? 0;
              const isHighlighted = highlighted.has(datasetRow);
              const isFocusedRow = focusedRow === datasetRow;
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
                    isFocusedRow
                      ? 'bg-brand-100 ring-2 ring-inset ring-brand-500'
                      : isHighlighted
                        ? HIGHLIGHT_TONE[highlightTone]
                        : 'hover:bg-brand-50/40'
                  }`}
                  data-row-number={datasetRow + 1}
                  data-highlighted={isHighlighted ? 'true' : undefined}
                  data-focused-row={isFocusedRow ? 'true' : undefined}
                >
                  <div
                    style={{ width: INDEX_WIDTH }}
                    className="shrink-0 px-2 py-1.5 text-right text-[13px] tabular-nums text-ink-muted"
                  >
                    {datasetRow + 1}
                  </div>
                  {dataset.columns.map((column, columnIndex) => {
                    const value = column.values[datasetRow];
                    const text = value === null ? '' : String(value);
                    const tooLong = text.length > 24;
                    return (
                      <div
                        key={`${column.name}-${columnIndex}`}
                        style={{ width: widthOf(columnIndex) }}
                        title={text}
                        className={`shrink-0 truncate border-l border-line/70 px-3 py-1.5 text-[13px] ${
                          focusedColumn === columnIndex ? 'bg-brand-50/60 text-ink' : 'text-ink'
                        }`}
                      >
                        {value === null ? (
                          <span className="text-ink-muted/50">—</span>
                        ) : tooLong ? (
                          <button
                            type="button"
                            className="block w-full truncate text-left"
                            onClick={() =>
                              setDetail({
                                column: column.name,
                                columnIndex,
                                rowNumber: datasetRow + 1,
                                value: text,
                              })
                            }
                            aria-label={`查看「${column.name}」第 ${datasetRow + 1} 行的完整内容`}
                          >
                            {text}
                          </button>
                        ) : (
                          text
                        )}
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

      {detail !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="单元格完整内容"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 sm:items-center"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-line bg-surface p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {detail.column} · 第 {detail.rowNumber} 行
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">第 {detail.columnIndex + 1} 列</p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-canvas hover:text-ink"
                autoFocus
              >
                关闭
              </button>
            </div>
            <p className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-canvas px-3 py-2 text-sm text-ink">
              {detail.value}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
