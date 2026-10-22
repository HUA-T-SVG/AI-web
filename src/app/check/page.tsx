'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { QualityIssue, Severity } from '@/core';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { useReviewStore } from '@/ui/stores/reviewStore';
import { ColumnProfilePanel } from '@/ui/components/ColumnProfilePanel';
import { DataTable } from '@/ui/components/DataTable';
import { IssueDetailPanel } from '@/ui/components/IssueDetailPanel';
import { IssueList } from '@/ui/components/IssueList';
import { Badge } from '@/ui/components/base/Badge';
import { Button, buttonStyles } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Notice } from '@/ui/components/base/Notice';
import { PageHeader } from '@/ui/components/base/PageHeader';
import { Spinner } from '@/ui/components/base/Spinner';
import { Stat } from '@/ui/components/base/Stat';
import { summarizeChecks } from '@/ui/lib/qualityOverview';
import { checkLabel } from '@/ui/lib/checkLabels';
import { cn } from '@/ui/lib/cn';

const SEVERITY_LABEL: Record<Severity, string> = { high: '严重', medium: '中等', low: '轻微' };
const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

/** 「去导入数据」按钮。用 Link 套按钮样式，而不是把 Button 嵌进 Link —— 后者是无效 HTML */
function GoToImport({ label = '去导入数据' }: { label?: string }) {
  return (
    <Link href="/import" className={cn(buttonStyles({ variant: 'primary', size: 'sm' }), 'mt-3')}>
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
 */
function SynonymStatusBar() {
  const synonymStatus = useDatasetStore((state) => state.synonymStatus);
  const synonymNote = useDatasetStore((state) => state.synonymNote);

  if (synonymStatus === 'idle') return null;

  if (synonymStatus === 'pending') {
    return (
      <Notice tone="info" testId="synonym-status">
        <span className="inline-flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5" />
          语义归并准备中…首次需要下载约 25 MB 的端侧模型。在此之前，检查只覆盖字面与结构规则。
        </span>
      </Notice>
    );
  }

  if (synonymStatus === 'degraded') {
    return (
      <Notice
        tone="warning"
        testId="synonym-status"
        title="语义归并不可用，已降级为结构化规则"
      >
        {synonymNote ? `原因：${synonymNote}。` : ''}
        这一份数据里「硕士／研究生」这类<b>写法不同但含义相同</b>的取值，本次<b>没有被检查</b>——
        这不代表它们不存在。字面与结构类的检查不受影响。
      </Notice>
    );
  }

  return (
    <Notice tone="success" testId="synonym-status">
      语义归并已就绪，本次检查包含 L3 语义层。
    </Notice>
  );
}

/**
 * 检查的执行状态条。
 *
 * 检查跑在 Web Worker 里，5 万 × 50 列约 3 秒。这期间界面**可以继续操作**，
 * 但结果还没出来。不说明的话，用户会把空清单读成「数据很干净」。
 */
function ChecksStatusBar() {
  const checksStatus = useDatasetStore((state) => state.checksStatus);
  const checksNote = useDatasetStore((state) => state.checksNote);
  const checksOffThread = useDatasetStore((state) => state.checksOffThread);

  if (checksStatus === 'running') {
    return (
      <Notice tone="info" testId="checks-status">
        <span className="inline-flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5" />
          {checksOffThread
            ? '正在检查这份数据…计算在后台线程进行，界面可以继续操作。'
            : '正在检查这份数据…当前环境不支持后台线程，计算期间界面会短暂卡住。'}
        </span>
      </Notice>
    );
  }

  if (checksStatus === 'failed' && checksNote !== null) {
    return (
      <Notice tone="warning" testId="checks-status">
        {checksNote}
      </Notice>
    );
  }

  return null;
}

function topRisks(issues: QualityIssue[]): QualityIssue[] {
  return [...issues].sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]).slice(0, 2);
}

export default function CheckPage() {
  const status = useDatasetStore((state) => state.status);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const profile = useDatasetStore((state) => state.profile);
  const issues = useDatasetStore((state) => state.issues);
  const error = useDatasetStore((state) => state.error);
  const checksStatus = useDatasetStore((state) => state.checksStatus);
  const reviewItems = useReviewStore((state) => state.items);
  const executedSteps = useProvenanceStore((state) => state.steps.length);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [onlyRelated, setOnlyRelated] = useState(false);

  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId) ?? null;
  const relatedRows = useMemo(() => {
    const rows = selectedIssue?.evidence.rowIndices ?? [];
    return [...new Set(rows)].sort((left, right) => left - right);
  }, [selectedIssue]);
  const highlightTone: 'brand' | 'warning' | 'danger' =
    selectedIssue?.severity === 'high' ? 'danger' : selectedIssue?.severity === 'medium' ? 'warning' : 'brand';
  const selectIssue = (id: string) => {
    setSelectedIssueId(id);
    setOnlyRelated(false);
  };

  // 解析失败与正在解析都不是「没有导入数据」—— 说成后者是在告诉用户一件
  // 与事实不符的事：他刚被告知文件读不了，却收到「你还没导入」。
  if (status === 'error') {
    return (
      <div className="page-shell">
        <PageHeader title="质量检查" />
        <div className="space-y-4">
          <Notice tone="danger" title="上一次导入没有成功">
            {error ?? '文件没能读进来，所以没有可检查的数据。'}
          </Notice>
          <GoToImport label="换一个文件" />
        </div>
      </div>
    );
  }

  if (status === 'parsing' || status === 'profiling') {
    return (
      <div className="page-shell">
        <PageHeader title="质量检查" />
        <Notice tone="info">
          <span className="inline-flex items-center gap-2">
            <Spinner className="h-3.5 w-3.5" />
            {status === 'parsing' ? '正在解析数据，稍候…' : '数据已解析，正在计算列画像…'}
          </span>
        </Notice>
      </div>
    );
  }

  if (status !== 'ready' || !parseResult || !profile) {
    return (
      <div className="page-shell">
        <PageHeader title="质量检查" />
        <Card>
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

  const done = checksStatus === 'done';
  const counts = issues.reduce<Record<Severity, number>>(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );
  const checksSummary = summarizeChecks({
    checksStatus,
    issueCount: issues.length,
    highCount: counts.high,
  });
  const fields = new Set(issues.flatMap((issue) => issue.evidence.columns));
  const handled = reviewItems.filter((item) => item.decision !== 'pending').length;
  const risks = topRisks(issues);

  return (
    <div className="page-shell">
      <PageHeader
        title="质量检查"
        description="八项规则检查在本机执行。先看总量与主要风险，再按严重程度与字段筛选具体条目。"
        meta={
          <>
            <span>8 项规则检查</span>
            <span>·</span>
            <span>原始数据不做任何改动</span>
          </>
        }
        actions={
          <Link href="/analysis" className={cn(buttonStyles({ variant: 'secondary', size: 'md' }))}>
            去 AI 分析
          </Link>
        }
      />

      <div className="space-y-5">
        <SynonymStatusBar />
        <ChecksStatusBar />

        <section aria-label="检查结果概况" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="问题总数" value={checksSummary.issueValue} hint={done ? '本轮检查结论' : '检查未完成'} tone="brand" />
          <Stat label="严重" value={done ? `${counts.high} 条` : '—'} hint="建议优先处理" tone={counts.high > 0 ? 'danger' : 'neutral'} />
          <Stat label="中等" value={done ? `${counts.medium} 条` : '—'} hint="影响统计口径" tone={counts.medium > 0 ? 'warning' : 'neutral'} />
          <Stat label="轻微" value={done ? `${counts.low} 条` : '—'} hint="写法或格式问题" tone="neutral" />
          <Stat label="涉及字段" value={done ? `${fields.size} 个` : '—'} hint="按字段筛选问题" />
        </section>

        {/* 设计文档要求把「规则问题 / AI 建议 / 人工复核 / 已修改」分开说：
            「已复核」包含接受、修改与拒绝，不能因此把问题显示成「已修复」 */}
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Badge tone="neutral">AI 建议 {reviewItems.length} 条</Badge>
          <Badge tone={handled > 0 ? 'success' : 'neutral'}>已复核 {handled} 条</Badge>
          <Badge tone={executedSteps > 0 ? 'brand' : 'neutral'}>已执行 {executedSteps} 步</Badge>
          <span>已复核含接受、修改与拒绝，不等于已修复。</span>
        </p>

        {done ? (
          issues.length === 0 ? (
            <Notice tone="success" title="画面内没有检出问题">
              这不代表数据一定没问题 —— 检查只能覆盖它能识别的模式，建议再用 AI 分析复核一遍。
            </Notice>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>主要风险</CardTitle>
                <span className="text-xs text-ink-muted">按严重程度排序，最多两条</span>
              </CardHeader>
              <CardBody className="grid gap-3 md:grid-cols-2">
                {risks.map((issue) => (
                  <div key={issue.id} className="rounded-lg border border-line bg-canvas px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          issue.severity === 'high'
                            ? 'bg-danger-100 text-danger-700'
                            : issue.severity === 'medium'
                              ? 'bg-warning-100 text-warning-700'
                              : 'bg-info-100 text-info-700',
                        )}
                      >
                        {SEVERITY_LABEL[issue.severity]}
                      </span>
                      <p className="min-w-0 truncate text-sm font-medium text-ink">
                        {checkLabel(issue.checkId)}
                      </p>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                      {issue.description}
                    </p>
                    {issue.evidence.columns.length > 0 ? (
                      <p className="mt-1 truncate text-xs text-ink-muted">
                        涉及字段：{issue.evidence.columns.join('、')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          )
        ) : null}

        {/* 核对工作区：左侧问题列表，右侧选中问题的证据；下方原始数据可定位高亮 */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <IssueList
              issues={issues}
              checksStatus={checksStatus}
              selectedId={selectedIssueId}
              onSelect={selectIssue}
            />
          </div>
          <div className="min-w-0">
            <IssueDetailPanel issue={selectedIssue} />
          </div>
        </div>

        <section aria-labelledby="raw-data-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 id="raw-data-title" className="text-lg font-semibold tracking-tight text-ink">
                原始数据
              </h2>
              <Badge tone="neutral">未清洗</Badge>
              <span className="text-xs text-ink-muted">
                {selectedIssue
                  ? `已高亮「${checkLabel(selectedIssue.checkId)}」相关记录`
                  : '选中左侧问题后，这里高亮对应记录'}
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedIssue === null || relatedRows.length === 0}
              onClick={() => setOnlyRelated((value) => !value)}
              title={
                selectedIssue === null
                  ? '先选中一条问题'
                  : relatedRows.length === 0
                    ? '这条问题没有具体行号'
                    : undefined
              }
            >
              {onlyRelated ? '显示全部记录' : `仅看相关记录（${relatedRows.length}）`}
            </Button>
          </div>
          <DataTable
            dataset={parseResult.dataset}
            highlightRows={relatedRows}
            visibleRows={onlyRelated ? relatedRows : undefined}
            highlightTone={highlightTone}
          />
        </section>

        <section aria-labelledby="profile-title" className="space-y-3">
          <h2 id="profile-title" className="text-lg font-semibold tracking-tight text-ink">
            字段概况
          </h2>
          <ColumnProfilePanel profile={profile} />
        </section>
      </div>
    </div>
  );
}
