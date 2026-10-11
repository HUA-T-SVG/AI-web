'use client';

import Link from 'next/link';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { ColumnProfilePanel } from '@/ui/components/ColumnProfilePanel';
import { IssueList } from '@/ui/components/IssueList';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';

export default function CheckPage() {
  const status = useDatasetStore((state) => state.status);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);
  const issues = useDatasetStore((state) => state.issues);

  // 直接访问 /check 时 store 是空的（例如刷新页面或从书签进来）。
  // 必须明确引导去导入，而不是渲染一屏空表格让人以为坏了。
  if (status !== 'ready' || !parseResult || !profile) {
    return (
      <div className="px-6 py-8 lg:px-10">
        <h1 className="text-lg font-semibold text-neutral-900">质量检查</h1>
        <Card className="mt-6">
          <CardBody>
            <EmptyState
              title="还没有导入数据"
              description="质量检查读取的是已导入的数据集。先到「数据导入」上传一份 CSV 或 Excel。"
              action={
                <Link href="/import" className="mt-3 inline-block">
                  <Button size="sm">去导入数据</Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-neutral-900">质量检查</h1>
        <span className="text-xs text-neutral-500">{parseResult.meta.fileName}</span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据概况</h2>
          <ColumnProfilePanel profile={profile} />
        </div>

        <div className="min-w-0">
          {/* 这一层不再写标题：IssueList 自带「发现的问题」，两个标题叠在一起很怪 */}
          <IssueList issues={issues} />
        </div>
      </div>
    </div>
  );
}
