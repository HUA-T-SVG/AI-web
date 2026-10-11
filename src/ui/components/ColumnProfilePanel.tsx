'use client';

import type { ColumnProfile, ColumnType, DatasetProfile } from '@/core';
import { Badge } from '@/ui/components/base/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';

const TYPE_LABEL: Record<ColumnType, string> = {
  number: '数值',
  category: '分类',
  text: '文本',
  boolean: '布尔',
  empty: '全空',
  mixed: '混合',
};

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ColumnRow({ column, position }: { column: ColumnProfile; position: number }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-neutral-800" title={column.name}>
          {/* 列序号必须显示：表头重名时，两个「年龄」靠名字区分不出来 */}
          <span className="mr-1.5 tabular-nums text-neutral-400">#{position}</span>
          {column.name}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {column.uniqueCount} 个不同取值
          {column.missingCount > 0 ? ` · 缺失 ${formatPercent(column.missingRate)}` : ''}
        </p>
      </div>
      <Badge tone={column.type === 'empty' ? 'high' : 'neutral'}>{TYPE_LABEL[column.type]}</Badge>
    </div>
  );
}

export function ColumnProfilePanel({ profile }: { profile: DatasetProfile }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>列画像</CardTitle>
        <span className="text-xs text-neutral-500">{profile.columnCount} 列</span>
      </CardHeader>

      <CardBody className="max-h-[420px] overflow-auto p-0">
        {profile.duplicateColumnNames.length > 0 ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            检测到 {profile.duplicateColumnNames.length} 个重复列名，按列名定位的处理可能出错。
          </div>
        ) : null}

        {profile.columns.map((column, index) => (
          <ColumnRow key={`${column.name}-${index}`} column={column} position={index + 1} />
        ))}
      </CardBody>
    </Card>
  );
}
