'use client';

import Link from 'next/link';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { ColumnProfilePanel } from '@/ui/components/ColumnProfilePanel';
import { IssueList } from '@/ui/components/IssueList';
import { buttonStyles } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Spinner } from '@/ui/components/base/Spinner';
import { cn } from '@/ui/lib/cn';

/** 「去导入数据」按钮。用 Link 套按钮样式，而不是把 Button 嵌进 Link —— 后者是无效 HTML */
function GoToImport({ label = '去导入数据' }: { label?: string }) {
  return (
    <Link href="/import" className={cn(buttonStyles({ size: 'sm' }), 'mt-3')}>
      {label}
    </Link>
  );
}

export default function CheckPage() {
  const status = useDatasetStore((state) => state.status);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);
  const issues = useDatasetStore((state) => state.issues);
  const error = useDatasetStore((state) => state.error);

  const heading = <h1 className="text-lg font-semibold text-neutral-900">质量检查</h1>;

  // 解析失败与正在解析都不是「没有导入数据」—— 说成后者是在告诉用户一件
  // 与事实不符的事：他刚被告知文件读不了，却收到「你还没导入」。
  if (status === 'error') {
    return (
      <div className="px-6 py-8 lg:px-10">
        {heading}
        <Card className="mt-6 border-red-200">
          <CardHeader className="border-red-100">
            <CardTitle className="text-red-800">上一次导入没有成功</CardTitle>
          </CardHeader>
          <CardBody className="text-sm text-red-700">
            {error ?? '文件没能读进来，所以没有可检查的数据。'}
            <div className="mt-3">
              <GoToImport label="换一个文件" />
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (status === 'parsing') {
    return (
      <div className="px-6 py-8 lg:px-10">
        {heading}
        <div className="mt-6 flex items-center gap-2 text-sm text-neutral-600">
          <Spinner />
          正在解析数据，稍候…
        </div>
      </div>
    );
  }

  if (status !== 'ready' || !parseResult || !profile) {
    return (
      <div className="px-6 py-8 lg:px-10">
        {heading}
        <Card className="mt-6">
          <CardBody>
            <EmptyState
              title="还没有导入数据"
              description="质量检查读取的是已导入的数据集。先到「数据导入」上传一份 CSV 或 Excel。"
              action={<GoToImport />}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 lg:px-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {heading}
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
