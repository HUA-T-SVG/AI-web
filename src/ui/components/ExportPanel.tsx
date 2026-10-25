'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  Printer,
  Undo2,
} from 'lucide-react';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Notice } from '@/ui/components/base/Notice';
import { ReportDocument } from '@/ui/components/ReportDocument';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { useRangeRuleStore } from '@/ui/stores/rangeRuleStore';
import { useReviewStore } from '@/ui/stores/reviewStore';
import { buildCoverageMap } from '@/ui/lib/coverageMap';
import { buildReadableReport } from '@/ui/lib/report';
import { APP_VERSION, buildProvenance, toCsv } from '@/scriptgen';
import { loadRuleIndex } from '@/knowledge/loadRules';
import { MODEL_ID } from '@/embedding/loadModel';

/**
 * 导出面板（设计文档 §4.7 与 §6.5）。
 *
 * 四样产出，都由**同一套动作序列**生成：清洗后数据、处理留痕、pandas 脚本、质量报告。
 * 「同一套」不是形容 —— 脚本由 `buildPandasScript(actions)` 生成，而界面执行时用的是
 * 同一个 `actions`。两边同源才能保证「脚本跑出来的结果与界面显示的一致」，
 * 那是 `core` 保持平台无关那条架构决策在这里的兑现方式。
 */

function download(filename: string, content: string, mime: string): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/** 下载 Blob。CSV/JSON 是字符串，Word 报告是二进制 —— 出口共用同一段逻辑。 */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // 不 revoke 的话每次导出都漏一个 blob URL；revoke 太早又会取消下载，
  // 所以放在下一轮事件循环
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 文件名带时间戳：反复导出时不会互相覆盖，也便于对上「哪一次」。 */
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function ExportPanel() {
  const current = useProvenanceStore((state) => state.current);
  const original = useProvenanceStore((state) => state.original);
  const steps = useProvenanceStore((state) => state.steps);
  const skipped = useProvenanceStore((state) => state.skipped);
  const sessionStartedAt = useProvenanceStore((state) => state.sessionStartedAt);
  const undo = useProvenanceStore((state) => state.undo);
  // 能不能撤销由**撤销栈**决定，不是由「有没有动作」决定：
  // `review_*` 那类「已确认但不改数据」的动作会进 steps 却不压栈，
  // 用 steps 判断会让按钮可点、点下去什么都不发生
  const canUndo = useProvenanceStore((state) => state.history.length > 0);
  // 真实文件名：写死会让脚本第一行就 FileNotFoundError，
  // 而 df['列名'] 之后的每一步都跟着崩
  const sourceFileName = useDatasetStore((state) => state.parseResult?.meta.fileName);
  const rowCount = useDatasetStore((state) => state.parseResult?.dataset.rowCount);
  const columnCount = useDatasetStore((state) => state.parseResult?.dataset.columns.length);
  const reviewItems = useReviewStore((state) => state.items);
  const dataVersion = useDatasetStore((state) => state.dataVersion);
  const checksVersion = useDatasetStore((state) => state.checksVersion);
  const checksStatus = useDatasetStore((state) => state.checksStatus);
  const checksNote = useDatasetStore((state) => state.checksNote);
  // 报告里的「检查结论」与质量概览读的是同一份 issues —— 两处各数一遍，
  // 迟早出现报告说 3 条、看板说 4 条这种没法解释的分叉
  const issues = useDatasetStore((state) => state.issues);
  // 覆盖地图与检查页共用同一份数据与同一份配置：报告里的覆盖段落不能另算一套
  const workingProfile = useDatasetStore((state) => state.workingProfile);
  const synonymStatus = useDatasetStore((state) => state.synonymStatus);
  const rangeRuleMap = useRangeRuleStore((state) => state.rules);
  const runVersion = useReviewStore((state) => state.runVersion);
  const executedVersion = useReviewStore((state) => state.executedVersion);
  const [ruleLibraryVersion, setRuleLibraryVersion] = useState('未加载');
  const [undoNote, setUndoNote] = useState<string | null>(null);
  // Word 生成要动态加载 docx 并序列化整份文档，慢到需要给按钮一个进行中状态；
  // 失败也必须说出来，静默无反应会让用户以为按钮坏了
  const [wordBusy, setWordBusy] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // 规则库版本进留痕：同一条结论在不同版本的规则库下可信度不同
    loadRuleIndex()
      .then((index) => {
        if (alive) setRuleLibraryVersion(`${index.entries.length} 条`);
      })
      .catch(() => {
        if (alive) setRuleLibraryVersion('不可用');
      });
    return () => {
      alive = false;
    };
  }, []);

  // useMemo 必须在任何 return 之前调用：整页加载时 current 会先为空、
  // 恢复 IndexedDB 后再有值，提前 return 会让两次渲染的 Hooks 数量不同。
  const provenance = useMemo(() => {
    if (!current) return null;
    return buildProvenance({
      dataset: current,
      // 指纹算在**原始数据**上：留痕的用途是核对「导出的这份是不是我最初上传的那份」，
      // 用清洗后的数据算就对不上了。清洗后的结果另有 resultFingerprint
      original: original ?? current,
      applied: steps,
      // 留痕不只要「做了什么」，还要「人工决定与为什么」。被拒绝/只写理由的建议
      // 不进 steps，只在这里出现；不记录的话 JSON 与界面文案说的不是一回事
      decisions: reviewItems.map((item) => ({
        title: item.issue.title,
        severity: item.issue.severity,
        decision: item.decision,
        note: item.note ?? null,
        suggestionAction: item.issue.suggestion.action,
        suggestionRationale: item.issue.suggestion.rationale,
        suggestionParams: item.issue.suggestion.params,
        ...(item.override
          ? {
              overrideAction: item.override.action,
              overrideParams: item.override.params,
            }
          : {}),
      })),
      sessionStartedAt: sessionStartedAt ?? new Date().toISOString(),
      environment: {
        appVersion: APP_VERSION,
        ruleLibraryVersion,
        embeddingModel: MODEL_ID + '（q8）',
        // 留痕要说清它对应哪一版数据：同一份文件可能在不同版本上处理过
        dataVersion,
      },
      sourceFileName: sourceFileName ?? '原始数据.csv',
    });
  }, [
    current,
    original,
    steps,
    reviewItems,
    sessionStartedAt,
    ruleLibraryVersion,
    sourceFileName,
    dataVersion,
  ]);

  /**
   * 清洗前后对比：只列**统计上确实变了**的字段。
   *
   * 设计文档要求「只展示已计算的数据；没有修改时直接说明本轮保留原值，
   * 不制造改善幅度」。所以这里不算综合分，也不给百分比。
   */
  const changeSummary = useMemo(() => {
    if (!original || !current || steps.length === 0) return null;
    const beforeByName = new Map(original.columns.map((column) => [column.name, column]));
    const countNull = (values: readonly unknown[]) =>
      values.filter((value) => value === null).length;
    const countUnique = (values: readonly unknown[]) =>
      new Set(values.map((value) => `${typeof value}:${String(value)}`)).size;

    const changes: {
      name: string;
      missingBefore: number;
      missingAfter: number;
      uniqueBefore: number;
      uniqueAfter: number;
    }[] = [];

    for (const column of current.columns) {
      const before = beforeByName.get(column.name);
      if (!before) continue;
      const missingBefore = countNull(before.values);
      const missingAfter = countNull(column.values);
      const uniqueBefore = countUnique(before.values);
      const uniqueAfter = countUnique(column.values);
      if (missingBefore !== missingAfter || uniqueBefore !== uniqueAfter) {
        changes.push({ name: column.name, missingBefore, missingAfter, uniqueBefore, uniqueAfter });
      }
    }

    return { rowDelta: current.rowCount - original.rowCount, changes };
  }, [original, current, steps.length]);

  const pendingSuggestions = reviewItems.filter((item) => item.decision === 'pending');
  const rejectedSuggestions = reviewItems.filter((item) => item.decision === 'rejected');

  /**
   * 报告里的「检查覆盖与能力边界」。
   *
   * 与检查页的覆盖地图调用同一个纯函数，输入也同一批（画像、问题清单、检查状态与
   * 版本、语义归并状态、用户配置的值域规则）。两处各算一遍迟早会出现「报告说查了、
   * 检查页说没配」——那比不写更糟。
   */
  const coverageMap = useMemo(() => {
    if (workingProfile === null) return null;
    return buildCoverageMap({
      profile: workingProfile,
      issues,
      checksStatus,
      checksVersion,
      dataVersion,
      synonymStatus,
      rangeRules: Object.values(rangeRuleMap),
    });
  }, [
    workingProfile,
    issues,
    checksStatus,
    checksVersion,
    dataVersion,
    synonymStatus,
    rangeRuleMap,
  ]);

  /**
   * 可读报告：屏幕预览、打印 / 另存为 PDF、Word 导出共用这一份数据。
   *
   * 所有输入都来自本组件已经算好的东西（`provenance`、`changeSummary`、
   * `reviewItems`）—— 报告不另立一套口径，否则同一页会出现两个「改了 3 格」。
   * `useMemo` 必须在任何 return 之前调用，理由与上面的 `provenance` 相同。
   */
  const readableReport = useMemo(() => {
    if (!current || !original || !provenance) return null;
    return buildReadableReport({
      sourceFileName: sourceFileName ?? '原始数据.csv',
      dataVersion,
      // 预览的「生成时间」跟着数据/结论变化重算；同一份内容在多次渲染间保持稳定
      generatedAt: new Date().toISOString(),
      provenance,
      originalRowCount: original.rowCount,
      currentRowCount: current.rowCount,
      originalColumnCount: original.columns.length,
      currentColumnCount: current.columns.length,
      // 与界面上的「清洗前后」是同一份统计，不再从原始/当前数据算第二遍
      fieldChanges: changeSummary?.changes ?? [],
      rowDelta: changeSummary?.rowDelta ?? 0,
      reviewItems,
      skipped,
      runVersion,
      executedVersion,
      checksVersion,
      checksStatus,
      checksNote,
      // 报告只需要严重度与涉及字段；证据行号、置信度留给检查页的明细
      checkIssues: issues.map((issue) => ({
        severity: issue.severity,
        columns: issue.evidence.columns,
        checkId: issue.checkId,
      })),
      // 这份报告也要能回答「检查到什么程度」：只给结论的 PDF 会被读成「都查过了」
      coverageMap,
    });
  }, [
    current,
    original,
    provenance,
    sourceFileName,
    dataVersion,
    changeSummary,
    reviewItems,
    skipped,
    runVersion,
    executedVersion,
    checksVersion,
    checksStatus,
    checksNote,
    issues,
    coverageMap,
  ]);

  async function exportWordReport(): Promise<void> {
    if (readableReport === null || wordBusy) return;
    setWordBusy(true);
    setWordError(null);
    try {
      // 动态 import：docx 是整套 OOXML 序列化，首屏用不到，不该进首屏包
      const { buildReportDocxBlob } = await import('@/ui/lib/reportDocx');
      const blob = await buildReportDocxBlob(readableReport);
      downloadBlob(`数据处理报告-${stamp()}.docx`, blob);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setWordError(`Word 报告生成失败：${reason}。可以改用「打印 / 另存为 PDF」保存同样的内容。`);
    } finally {
      setWordBusy(false);
    }
  }

  if (!current || !provenance) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            title="还没有导入数据"
            description="清洗后数据、处理留痕与 pandas 脚本都由本次清洗生成。先导入并完成一次清洗。"
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>报告与处理摘要</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            四样产出都由同一套动作生成 —— 脚本跑出来的结果与这里显示的一致
          </p>
        </div>
        <Badge tone={steps.length > 0 ? 'success' : 'neutral'}>{steps.length} 步动作</Badge>
        <Badge tone="neutral">数据版本 v{dataVersion}</Badge>
      </CardHeader>
      <CardBody>
        {checksStatus === 'done' && checksVersion !== null && checksVersion !== dataVersion ? (
          <Notice tone="warning" className="mb-3">
            质量概览属于数据版本 v{checksVersion}，当前已经是 v{dataVersion} ——
            旧结论不能当作当前版本的结果，正在按新版重新检查。
          </Notice>
        ) : null}
        {runVersion !== null && runVersion !== dataVersion && executedVersion === null ? (
          <Notice tone="warning" className="mb-3">
            上一轮 AI 建议基于数据版本 v{runVersion}，当前是 v{dataVersion}；
            已失效的建议不会出现在导出结论里。
          </Notice>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-xs text-ink-muted">已应用动作</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {steps.length} 步
            </dd>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-xs text-ink-muted">未执行</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {skipped.length} 条
            </dd>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-xs text-ink-muted">数据规模</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {rowCount === undefined ? '—' : `${rowCount.toLocaleString('zh-CN')} 行`}
              <span className="ml-1 text-xs font-normal text-ink-muted">
                {columnCount ?? '—'} 列
              </span>
            </dd>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <dt className="text-xs text-ink-muted">规则库版本</dt>
            <dd
              className="mt-0.5 truncate text-lg font-semibold text-ink"
              title={ruleLibraryVersion}
            >
              {ruleLibraryVersion}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          已应用 {steps.length} 条动作
          {skipped.length > 0 ? `，${skipped.length} 条未能执行` : ''}。四样产出都由同一套动作生成
          —— 脚本跑出来的结果与这里显示的一致。
        </p>

        {skipped.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-warning-700">
            {skipped.map((item, index) => (
              <li key={`${item.action.action}-${index}`}>
                未执行「{item.action.action}」：{item.reason}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-ink">清洗前后</p>
            <span className="text-xs text-ink-muted">只显示统计上确实发生变化的字段</span>
          </div>
          {changeSummary === null ? (
            <p className="mt-1 text-xs text-ink-muted">本轮没有执行清洗动作，数据保持原样。</p>
          ) : changeSummary.changes.length === 0 && changeSummary.rowDelta === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">
              动作已执行，但字段统计没有变化（例如只记录了复核决定）—— 不把它写成「改善」。
            </p>
          ) : (
            <div className="mt-2 overflow-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="py-1.5 pr-3 font-medium">字段</th>
                    <th className="py-1.5 pr-3 font-medium">缺失数（前 → 后）</th>
                    <th className="py-1.5 font-medium">不同取值数（前 → 后）</th>
                  </tr>
                </thead>
                <tbody>
                  {changeSummary.changes.slice(0, 12).map((change) => (
                    <tr key={change.name} className="border-b border-line/70">
                      <td className="py-1.5 pr-3 text-ink">{change.name}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-ink-muted">
                        {change.missingBefore} → {change.missingAfter}
                      </td>
                      <td className="py-1.5 tabular-nums text-ink-muted">
                        {change.uniqueBefore} → {change.uniqueAfter}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-ink-muted">
                {changeSummary.changes.length > 12
                  ? `另有 ${changeSummary.changes.length - 12} 个字段发生变化；`
                  : ''}
                {changeSummary.rowDelta === 0
                  ? '行数不变。'
                  : `行数 ${changeSummary.rowDelta > 0 ? '+' : ''}${changeSummary.rowDelta}。`}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-medium text-ink">遗留风险</p>
          {pendingSuggestions.length === 0 &&
          rejectedSuggestions.length === 0 &&
          skipped.length === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">
              本轮没有待确认建议、被拒建议或未执行动作。
            </p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs text-ink-muted">
              {pendingSuggestions.length > 0 ? (
                <li>
                  待确认建议 {pendingSuggestions.length} 条：
                  {pendingSuggestions
                    .slice(0, 3)
                    .map((item) => item.issue.title)
                    .join('、')}
                  {pendingSuggestions.length > 3 ? ' 等' : ''}
                </li>
              ) : null}
              {rejectedSuggestions.length > 0 ? (
                <li>
                  已拒绝、保留原值 {rejectedSuggestions.length} 条：
                  {rejectedSuggestions
                    .slice(0, 3)
                    .map((item) => item.issue.title)
                    .join('、')}
                  {rejectedSuggestions.length > 3 ? ' 等' : ''}
                </li>
              ) : null}
              {skipped.map((item, index) => (
                <li key={`${item.action.action}-${index}`}>
                  未执行「{item.action.action}」：{item.reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-medium text-ink">报告入口</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-line px-3 py-2">
              <Button
                size="sm"
                onClick={() => download(`清洗后数据-${stamp()}.csv`, toCsv(current), 'text/csv')}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                清洗后数据（CSV）
              </Button>
              <p className="mt-1 text-xs text-ink-muted">当前版本清洗后的数据，适合继续分析。</p>
            </div>
            <div className="rounded-lg border border-line px-3 py-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  download(
                    `处理留痕-${stamp()}.json`,
                    `${JSON.stringify(provenance, null, 2)}\n`,
                    'application/json',
                  )
                }
              >
                <FileJson className="h-4 w-4" aria-hidden="true" />
                处理留痕（JSON）
              </Button>
              <p className="mt-1 text-xs text-ink-muted">
                动作、人工决定与数据指纹，适合归档和复核。
              </p>
            </div>
            <div className="rounded-lg border border-line px-3 py-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  download(`清洗脚本-${stamp()}.py`, provenance.generatedScript, 'text/x-python')
                }
              >
                <FileTerminal className="h-4 w-4" aria-hidden="true" />
                pandas 脚本
              </Button>
              <p className="mt-1 text-xs text-ink-muted">
                与界面同源的脚本，适合在本地复现这次处理。
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            disabled={!canUndo}
            onClick={() => {
              // 点下去什么都没发生也要说话 —— 静默无反应会让用户以为按钮坏了
              if (!undo()) {
                setUndoNote('没有可撤销的版本。');
                return;
              }
              // 撤销只回退数据是不够的：问题清单、审阅结论、导出摘要都必须跟着变。
              // 版本 +1 让「旧结论」立刻可被识别，重算在后台进行
              const reverted = useProvenanceStore.getState().current;
              if (reverted === null) {
                setUndoNote(null);
                return;
              }
              const version = useDatasetStore.getState().syncWorkingDataset(reverted);
              // 上一轮 AI 建议是对撤销前那版数据说的，留着会让用户按旧建议继续改
              useReviewStore.getState().reset();
              setUndoNote(`已撤销到 v${version}，正在按这一版重新检查；上一轮 AI 建议已清空。`);
            }}
            title={canUndo ? undefined : '没有可撤销的版本'}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            撤销上一步
          </Button>
        </div>

        {undoNote && <p className="mt-2 text-xs text-ink-muted">{undoNote}</p>}

        <div className="mt-4 border-t border-line pt-3" data-testid="readable-report-section">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-ink">可读报告</p>
            <span className="text-xs text-ink-muted">
              打印时只输出报告区域；Word 文件包含同样的内容
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            报告包含检查结论、处理摘要、清洗前后字段变化、逐步动作（时间 / 参数 / 影响）、
            人工决定与理由、遗留风险、数据指纹与版本信息。Word 报告由浏览器本地生成，数据不会上传。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {/* 不做「直接生成 PDF」的承诺：浏览器只能走打印对话框，文案如实描述路径 */}
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              打印 / 另存为 PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={wordBusy}
              onClick={() => void exportWordReport()}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {wordBusy ? '正在生成 Word…' : 'Word 报告（.docx）'}
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            打印对话框里选择「另存为 PDF」即可得到 PDF 文件；页面内容以打印预览为准。
          </p>
          {wordError !== null && (
            <p className="mt-2 text-xs text-danger-700" data-testid="report-word-error">
              {wordError}
            </p>
          )}
          <div className="mt-3">
            {readableReport === null ? (
              <p className="text-xs text-ink-muted">报告还没有内容可预览。</p>
            ) : (
              <ReportDocument report={readableReport} />
            )}
          </div>
        </div>

        <Notice tone="info" className="mt-4">
          <Download className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          留痕里记的是<strong>动作序列</strong>而不是结果 —— 结果可以从动作重放出来，反过来不行。
          数据指纹：<code className="ml-1 break-all">{provenance.datasetFingerprint}</code>
        </Notice>
      </CardBody>
    </Card>
  );
}
