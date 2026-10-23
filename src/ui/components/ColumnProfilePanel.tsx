'use client';

import { useMemo, useState } from 'react';
import type { ColumnProfile, ColumnType, DatasetProfile } from '@/core';
import { Badge } from '@/ui/components/base/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { cn } from '@/ui/lib/cn';

const TYPE_LABEL: Record<ColumnType, string> = {
  number: '数值',
  category: '分类',
  text: '文本',
  boolean: '布尔',
  empty: '全空',
  mixed: '混合',
};

const TYPE_TONE: Record<ColumnType, 'neutral' | 'brand' | 'medium' | 'high'> = {
  number: 'brand',
  category: 'brand',
  text: 'neutral',
  boolean: 'neutral',
  mixed: 'medium',
  empty: 'high',
};

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ColumnRow({
  column,
  position,
  focused,
  onSelect,
}: {
  column: ColumnProfile;
  position: number;
  focused: boolean;
  onSelect?: (index: number) => void;
}) {
  const hasMissing = column.missingCount > 0;
  const content = (
    <>
      <div className="min-w-0 text-left">
        <p className="truncate text-xs font-medium text-ink" title={column.name}>
          {/* 列序号必须显示：表头重名时，两个「年龄」靠名字区分不出来 */}
          <span className="mr-1.5 tabular-nums text-ink-muted">#{position}</span>
          {column.name}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {column.uniqueCount} 个不同取值
          {hasMissing ? (
            <span className="text-warning-700"> · 缺失 {formatPercent(column.missingRate)}</span>
          ) : null}
        </p>
      </div>
      <Badge tone={TYPE_TONE[column.type]}>{TYPE_LABEL[column.type]}</Badge>
    </>
  );

  if (onSelect === undefined) {
    return (
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(position - 1)}
      aria-pressed={focused}
      className={cn(
        'flex w-full items-start justify-between gap-3 border-b border-line px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-brand-50/60',
        focused ? 'border-l-2 border-l-brand-600 bg-brand-50' : '',
      )}
    >
      {content}
    </button>
  );
}

export function ColumnProfilePanel({
  profile,
  onSelectColumn,
  focusedColumn = null,
  searchable = true,
}: {
  profile: DatasetProfile;
  /** 点击字段行时回调列下标（0 基）。导入页与检查页用它定位表格列 */
  onSelectColumn?: (index: number) => void;
  focusedColumn?: number | null;
  searchable?: boolean;
}) {
  const [keyword, setKeyword] = useState('');
  const columns = useMemo(
    () => profile.columns.map((column, index) => ({ column, index })),
    [profile.columns],
  );
  const filtered = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    if (term === '') return columns;
    return columns.filter(
      ({ column, index }) => column.name.toLowerCase().includes(term) || String(index + 1) === term,
    );
  }, [columns, keyword]);

  return (
    <Card data-testid="column-profile">
      <CardHeader>
        <div>
          <CardTitle>列画像</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            类型、缺失与取值规模——决定下一步该重点看哪几列
            {onSelectColumn === undefined ? '' : '；点一行可定位到下方表格的对应列'}
          </p>
        </div>
        <span className="text-xs text-ink-muted">{profile.columnCount} 列</span>
      </CardHeader>

      <CardBody className="max-h-[420px] overflow-auto p-0">
        {searchable && profile.columnCount > 6 ? (
          <div className="border-b border-line bg-surface px-4 py-2">
            <label className="sr-only" htmlFor="column-search">
              搜索字段名
            </label>
            <input
              id="column-search"
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索字段名或列序号"
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted/70 focus:border-brand-400"
            />
            {keyword.trim() !== '' ? (
              <p className="mt-1 text-[11px] text-ink-muted">
                匹配 {filtered.length} / {profile.columnCount} 列
              </p>
            ) : null}
          </div>
        ) : null}

        {profile.duplicateColumnNames.length > 0 ? (
          <div className="border-b border-warning-200 bg-warning-50 px-4 py-2 text-xs text-warning-700">
            检测到 {profile.duplicateColumnNames.length} 个重复列名，按列名定位的处理可能出错。
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-muted">没有匹配的字段</p>
        ) : (
          filtered.map(({ column, index }) => (
            <ColumnRow
              key={`${column.name}-${index}`}
              column={column}
              position={index + 1}
              focused={focusedColumn === index}
              onSelect={onSelectColumn}
            />
          ))
        )}
      </CardBody>
    </Card>
  );
}
