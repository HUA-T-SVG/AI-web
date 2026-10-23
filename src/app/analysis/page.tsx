'use client';

import Link from 'next/link';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useReviewStore } from '@/ui/stores/reviewStore';
import { AgentPanel } from '@/ui/components/AgentPanel';
import { Card, CardBody } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Notice } from '@/ui/components/base/Notice';
import { PageHeader } from '@/ui/components/base/PageHeader';
import { buttonStyles } from '@/ui/components/base/Button';
import { cn } from '@/ui/lib/cn';

export default function AnalysisPage() {
  const status = useDatasetStore((state) => state.status);
  const dataVersion = useDatasetStore((state) => state.dataVersion);
  const runVersion = useReviewStore((state) => state.runVersion);
  const executedVersion = useReviewStore((state) => state.executedVersion);
  // 已执行的建议不再提示「失效」：执行本身就会把数据推到新版本，刚点完执行就
  // 挂一条警告是在责怪用户做了正确的事。真正需要拦住的是「还没执行、数据却变了」
  const staleConclusions =
    runVersion !== null && runVersion !== dataVersion && executedVersion === null;

  // 与 /check 一致：没有数据时明确引导。渲染一个点了没反应的输入框
  // 比直接说「先去导入」更让人困惑
  if (status !== 'ready') {
    return (
      <div className="page-shell">
        <PageHeader
          title="AI 分析"
          description="大模型只会收到统计摘要；数据质量检查在你的浏览器内执行，原始数据不会上传。"
        />
        <Card>
          <CardBody>
            <EmptyState
              title="还没有导入数据"
              description="AI 分析需要先有一份数据集。先到「数据导入」上传一份 CSV 或 Excel。"
              action={
                <Link href="/import" className={cn(buttonStyles({ size: 'sm' }), 'mt-2')}>
                  去导入数据
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="AI 分析"
        description="AI 先提交检查计划，再由你在浏览器内执行检查、逐条确认结果。原始数据不会上传，检查都在本机完成。"
      />
      {staleConclusions ? (
        <Notice tone="warning" className="mb-4" testId="stale-conclusions">
          上一轮分析基于数据版本 v{runVersion}，当前数据已经是 v{dataVersion} ——
          那批结论已失效，不要再按它执行；请重新发起一次分析。
        </Notice>
      ) : null}
      <AgentPanel />
    </div>
  );
}
