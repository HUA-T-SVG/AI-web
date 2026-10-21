'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from '@/ui/components/base/Card';
import { Chart } from '@/ui/components/Chart';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { summarizeChecks } from '@/ui/lib/qualityOverview';
import { checkLabel } from '@/ui/lib/checkLabels';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import type { EvalSection } from '../../../scripts/evalEmit';

/**
 * 指标看板。
 *
 * 它回答三个问题，而不是「把数字排开」：
 *
 * 1. **这份数据有多脏** —— 本次分析的画像与检查结果（来自 `datasetStore`）
 * 2. **系统判断得准不准** —— 各层评测指标，**每个都带判据与达标线**
 * 3. **这次分析做了什么** —— 检查项、耗时、是否降级
 *
 * 第 2 点里「带判据」是关键：看板最容易退化成一排漂亮的数字，而**没有判据的
 * 数字读不出好坏** —— 「Precision 93.3%」可以是优秀也可以是灾难，取决于要求。
 *
 * 挂在 `/export` 而不是新开路由：侧边栏五项已满，而看板与「导出报告」本来就是
 * 同一件事的两面（导出的是报告，看板是它的屏幕形态）。
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; sections: EvalSection[] }
  | { kind: 'failed'; reason: string };

/** 同步脚本会把这些文件拷到 `public/eval/`（见 `scripts/sync-eval.mjs`）。 */
const EVAL_INDEX = '/eval/index.json';

const SEVERITY_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** 指标值的显示：比率按百分比、其余按数值 + 单位。 */
function formatValue(metric: EvalSection['metrics'][number]): string {
  if (metric.text !== undefined) return metric.text;
  if (metric.value === undefined) return '—';
  const isRatio = metric.unit === undefined && metric.value <= 1 && metric.name.match(/率|Precision|Recall|Hit@|MRR/);
  const rendered = isRatio ? percent(metric.value) : String(metric.value);
  return metric.unit === undefined ? rendered : `${rendered} ${metric.unit}`;
}

/**
 * 指标名的中文显示。
 *
 * 评测 JSON 里的字段名带着 Precision / Recall 这类英文术语 —— 它们是脚本的产出口径，
 * 不改成中文，看板上「优先显示中文指标」就做不到。数字与判据不动，只换标签。
 */
function metricLabel(name: string): string {
  return name
    .replace(/Precision/g, '精确率')
    .replace(/Recall/g, '召回率')
    .replace(/False positive/g, '误报');
}


function useEvalSections(): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // 先读清单（构建期由 scripts/sync-eval.mjs 写出），只请求**确实存在**的评测。
        // 原来的做法是挨个试四个固定文件名 —— 而 L4 要花钱真调模型，仓库里
        // 通常没有它的产物，于是浏览器控制台会留一条 404。
        const indexResponse = await fetch(EVAL_INDEX);
        if (!indexResponse.ok) {
          if (!cancelled) {
            setState({
              kind: 'failed',
              reason: `读不到评测清单（${indexResponse.status}）。执行 pnpm sync:eval 后再试。`,
            });
          }
          return;
        }
        const manifest = (await indexResponse.json()) as { sections: string[] };

        const results = await Promise.all(
          manifest.sections.map(async (key) => {
            const response = await fetch(`/eval/eval-${key}.json`);
            if (!response.ok) return null;
            return (await response.json()) as EvalSection;
          }),
        );
        if (cancelled) return;
        const sections = results.filter((item): item is EvalSection => item !== null);
        setState({ kind: 'ready', sections });
      } catch (error) {
        if (cancelled) return;
        setState({
          kind: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function MetricRow({ metric }: { metric: EvalSection['metrics'][number] }) {
  const tone =
    metric.passed === undefined
      ? 'text-ink-muted'
      : metric.passed
        ? 'text-success-700'
        : 'text-danger-700';
  const tag = metric.passed === undefined ? null : metric.passed ? '达标' : '未达标';

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line py-1.5 last:border-0">
      <span className="text-sm text-ink">{metricLabel(metric.name)}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>{formatValue(metric)}</span>
      {tag !== null && (
        <span className={`text-xs ${tone}`} data-testid="metric-verdict">
          {tag}
        </span>
      )}
      {/* 判据与达标线必须显示 —— 这是本看板存在的前提 */}
      <span className="w-full text-xs text-ink-muted">{metric.rule}</span>
    </li>
  );
}

export function QualityReportPanel() {
  const profile = useDatasetStore((state) => state.profile);
  const issues = useDatasetStore((state) => state.issues);
  const parseResult = useDatasetStore((state) => state.parseResult);
  const synonymStatus = useDatasetStore((state) => state.synonymStatus);
  const synonymNote = useDatasetStore((state) => state.synonymNote);
  // 检查是异步的（跑在 Worker 里）。**看板必须知道它跑完了没有** ——
  // 否则「检出问题 0 条 / 这份数据没检出问题」会出现在检查还没回来的那三秒里，
  // 而那一页正是演示与截图会去的地方：一句绿色的错误结论比一片空白色危险得多
  const checksStatus = useDatasetStore((state) => state.checksStatus);
  const checksNote = useDatasetStore((state) => state.checksNote);
  const steps = useProvenanceStore((state) => state.steps);
  const evalState = useEvalSections();

  const byCheckId = useMemo(() => {
    const counts = new Map<string, { count: number; worst: string }>();
    const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    for (const issue of issues) {
      const previous = counts.get(issue.checkId);
      const worst = !previous || (rank[issue.severity] ?? 0) > (rank[previous.worst] ?? 0) ? issue.severity : previous.worst;
      counts.set(issue.checkId, { count: (previous?.count ?? 0) + 1, worst });
    }
    return [...counts.entries()].sort((left, right) => right[1].count - left[1].count);
  }, [issues]);

  const bySeverity = useMemo(() => {
    const counts: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const issue of issues) counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
    return counts;
  }, [issues]);

  // 「检出问题」那一格说什么，由这个纯函数决定（三种状态各有一条单测）
  const checksSummary = summarizeChecks({
    checksStatus,
    issueCount: issues.length,
    highCount: bySeverity.high ?? 0,
  });

  /**
   * 评测区块的概况行（折叠状态下也可见）。
   *
   * 只统计「带达标线的指标」—— 没有判据的指标（例如「结构摘要字符数」）本来就不该
   * 计入达标分子，否则概要会虚高。
   */
  const evalSummary = useMemo(() => {
    if (evalState.kind !== 'ready' || evalState.sections.length === 0) return null;
    const metrics = evalState.sections.flatMap((section) => section.metrics);
    const judged = metrics.filter((metric) => metric.passed !== undefined);
    return {
      sections: evalState.sections.length,
      metrics: metrics.length,
      judged: judged.length,
      passed: judged.filter((metric) => metric.passed === true).length,
    };
  }, [evalState]);

  const issueChart = useMemo(
    () => ({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: byCheckId.map(([name, item]) => ({ name: checkLabel(name), value: item.count })),
        },
      ],
    }),
    [byCheckId],
  );

  return (
    <div className="space-y-6" data-testid="quality-report-panel">
      {/* —— 这份数据有多脏 —— */}
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold">数据质量概览</h2>
          {profile === null ? (
            <p className="mt-2 text-sm text-ink-muted">
              还没有载入数据。先到「数据与问题」页导入一份文件，这里就会出现它的质量画像。
            </p>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="quality-overview">
                {[
                  { label: '数据规模', value: `${profile.rowCount} 行 × ${profile.columnCount} 列` },
                  { label: '检出问题', value: checksSummary.issueValue },
                  { label: '高优先级', value: checksSummary.highValue },
                  { label: '处理动作', value: `${steps.length} 步` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-line px-3 py-2">
                    <dt className="text-xs text-ink-muted">{item.label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">{item.value}</dd>
                  </div>
                ))}
              </dl>

              {parseResult !== null && (
                <p className="mt-2 text-xs text-ink-muted">
                  文件名：{parseResult.meta.fileName}
                  {synonymStatus === 'degraded' && ' · 语义归并未完成（下面的「分析说明」有原因）'}
                </p>
              )}

              <div className="mt-4">
                {checksSummary.verdict === 'failed' ? (
                  // 检查崩了与「数据干净」在界面上必须长得不一样。一句绿色的
                  // 「没检出问题」在这里等于伪造结论
                  <div
                    className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700"
                    data-testid="quality-checks-failed"
                  >
                    <strong>检查没有跑完，无法给出结论。</strong>
                    {checksNote !== null ? `原因：${checksNote}` : ''}
                  </div>
                ) : checksSummary.verdict === 'pending' ? (
                  <p className="text-sm text-ink-muted" data-testid="quality-checks-pending">
                    正在检查，结论稍后出现…
                  </p>
                ) : byCheckId.length === 0 ? (
                  <p className="text-sm text-success-700">这份数据没检出问题。</p>
                ) : (
                  <>
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-ink">按检查项分布</p>
                      <span className="text-xs text-ink-muted">图表只作概览，明细见列表</span>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
                      <Chart
                        option={issueChart}
                        ariaLabel={`检出问题按检查项分布：${byCheckId.map(([name, item]) => `${checkLabel(name)} ${item.count} 条`).join('，')}`}
                        className="h-48 w-full"
                      />
                      <ul className="space-y-1 text-sm text-ink">
                        {byCheckId.map(([checkId, item]) => (
                          <li key={checkId} className="flex justify-between border-b border-line py-1 last:border-0">
                            <span>
                              {checkLabel(checkId)}
                              <span className="ml-2 text-xs text-ink-muted">
                                最高 {SEVERITY_LABEL[item.worst] ?? item.worst}
                              </span>
                            </span>
                            <span className="tabular-nums">{item.count} 条</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* —— 系统判断得准不准 —— */}
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold">系统准确率（各层评测）</h2>

          {/* 概要行始终可见，明细默认折叠：看板要被「扫一眼」，而不是把 5 层指标全铺开。
              但**不能删** —— 这是评分点「量化评测」在界面上唯一的落点，藏起来等于让
              评委在演示站点上看不到证据。折叠 + 可展开是折中。 */}
          {evalSummary === null ? (
            <p className="mt-1 text-sm text-ink-muted">这些数字由评测脚本产出，衡量的是「系统判断得准不准」。</p>
          ) : (
            <p className="mt-1 text-sm text-ink-muted" data-testid="eval-summary">
              {evalSummary.sections} 层评测
              {evalSummary.judged > 0
                ? ` · ${evalSummary.judged} 个指标带达标线，其中 ${evalSummary.passed} 项达标`
                : ` · 共 ${evalSummary.metrics} 个指标`}
              · 每个指标都标了判据与达标线
            </p>
          )}

          {evalState.kind === 'loading' && <p className="mt-3 text-sm text-ink-muted">正在读取评测结论…</p>}

          {evalState.kind === 'failed' && (
            <p className="mt-3 text-sm text-danger-700">
              读取评测结论失败：{evalState.reason}
              <br />
              <span className="text-xs text-ink-muted">
                先跑一层评测再刷新（见 README「评测」一节），或执行 <code>pnpm sync:eval</code>。
              </span>
            </p>
          )}

          {evalState.kind === 'ready' && evalState.sections.length === 0 && (
            <p className="mt-3 text-sm text-ink-muted">
              还没有可读的评测结论。跑一层评测即可生成，例如：
              <code className="ml-1 rounded bg-canvas px-1">pnpm test</code>
            </p>
          )}

          {evalState.kind === 'ready' && evalState.sections.length > 0 && (
            <details className="mt-2" data-testid="eval-details">
              <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">
                展开查看各层指标与判据
              </summary>
              <div>
                {evalState.sections.map((section) => (
                  <section key={section.title} className="mt-4 border-t border-line pt-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{section.title}</h3>
                      <span className="text-xs text-ink-muted">
                        测得于 {new Date(section.measuredAt).toLocaleString('zh-CN')} · <code>{section.command}</code>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">{section.description}</p>
                    <ul className="mt-2">
                      {section.metrics.map((metric) => (
                        <MetricRow key={`${section.title}-${metric.name}`} metric={metric} />
                      ))}
                    </ul>
                    {section.notCovered !== undefined && section.notCovered.length > 0 && (
                      <details className="mt-2 text-xs text-ink-muted">
                        <summary className="cursor-pointer text-ink-muted">这一层没覆盖什么（{section.notCovered.length} 项）</summary>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5">
                          {section.notCovered.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                ))}
              </div>
            </details>
          )}
        </CardBody>
      </Card>

      {/* —— 这次分析做了什么 —— */}
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold">分析说明</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            <li>
              同义归并：{synonymStatus === 'ready' ? '已完成' : synonymStatus === 'degraded' ? '未完成（已降级）' : '未开始'}
            </li>
            {synonymNote !== null && <li className="text-xs text-warning-700">降级原因：{synonymNote}</li>}
            <li>处理留痕：{steps.length} 步（可在下方导出为 JSON 或生成 pandas 脚本）</li>
            <li>
              检查项：{byCheckId.length} 项报出问题（数据侧共注册 8 项确定性检查，
              逐项口径见 <code>knowledge/reports/eval-l1.md</code>）
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
