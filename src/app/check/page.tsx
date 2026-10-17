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

/**
 * 语义归并的状态条。
 *
 * 这一条不是装饰。语义归并要等模型（首次约 25 MB），而它可能下载失败、可能没有 WebGPU、
 * 也可能还在准备中。**这些情况下 L3 根本没跑**，但界面若不说话，用户就会把
 * 「没跑」读成「这份数据没有同义写法问题」—— 一个是「不知道」，一个是「没问题」，
 * 在科研场景里是完全不同的两个结论。
 *
 * spec §4.3 要求「功能未就绪时显示『语义归并准备中』」「不可用时界面明示」。
 * 状态在 `datasetStore` 里早就算好了，缺的只是最后一米。
 */
function SynonymStatusBar() {
  const synonymStatus = useDatasetStore((state) => state.synonymStatus);
  const synonymNote = useDatasetStore((state) => state.synonymNote);

  // idle 表示还没开始（没有数据集时状态栏本来也不显示）
  if (synonymStatus === 'idle') return null;

  if (synonymStatus === 'pending') {
    return (
      <div
        className="mt-4 flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
        data-testid="synonym-status"
      >
        <Spinner />
        语义归并准备中…首次需要下载约 25 MB 的端侧模型。在此之前，检查只覆盖字面与结构规则。
      </div>
    );
  }

  if (synonymStatus === 'degraded') {
    return (
      <div
        className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        data-testid="synonym-status"
      >
        <strong>语义归并不可用，已降级为结构化规则。</strong>
        {synonymNote ? `原因：${synonymNote}` : ''}
        <br />
        也就是说，这一份数据里「硕士／研究生」这类<b>写法不同但含义相同</b>的取值，
        本次<b>没有被检查</b>——这不代表它们不存在。字面与结构类的检查不受影响。
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
      data-testid="synonym-status"
    >
      语义归并已就绪，本次检查包含 L3 语义层。
    </div>
  );
}

/**
 * 检查的执行状态条。
 *
 * 检查现在跑在 Web Worker 里（Plan 4 Task 8），5 万 × 50 列约 3 秒。这期间界面
 * **可以继续操作**（这正是搬进 Worker 的目的），但结果还没出来。不说明的话，
 * 用户会看到「发现的问题」是空的，并把它读成「数据很干净」。
 */
function ChecksStatusBar() {
  const checksStatus = useDatasetStore((state) => state.checksStatus);
  const checksNote = useDatasetStore((state) => state.checksNote);

  if (checksStatus === 'running') {
    return (
      <div
        className="mt-4 flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
        data-testid="checks-status"
      >
        <Spinner />
        正在检查这份数据…计算在后台线程进行，界面可以继续操作。
      </div>
    );
  }

  if (checksStatus === 'failed' && checksNote !== null) {
    return (
      <div
        className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        data-testid="checks-status"
      >
        {checksNote}
      </div>
    );
  }

  return null;
}

export default function CheckPage() {
  const status = useDatasetStore((state) => state.status);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);
  const issues = useDatasetStore((state) => state.issues);
  const error = useDatasetStore((state) => state.error);
  const checksStatus = useDatasetStore((state) => state.checksStatus);

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

      <SynonymStatusBar />
      <ChecksStatusBar />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">数据概况</h2>
          <ColumnProfilePanel profile={profile} />
        </div>

        <div className="min-w-0">
          {/* 这一层不再写标题：IssueList 自带「发现的问题」，两个标题叠在一起很怪 */}
          <IssueList issues={issues} checking={checksStatus === 'running'} />
        </div>
      </div>
    </div>
  );
}
