import type { ReadableReport } from '@/ui/lib/report';
import { METHOD_DRAFT_APPENDIX_HEADING } from '@/ui/lib/methodDraft';

/**
 * 可读报告的打印视图。
 *
 * **屏幕预览与「打印 / 另存为 PDF」共用同一份 DOM。** 另做一个「打印专版」
 * 看着省事，但它和屏幕版迟早会漂移 —— 到那时用户手里的 PDF 与页面上看到的
 * 就不是一回事了。`print-report` 这个 class 是打印样式的锚点：
 * `globals.css` 的 `@media print` 只保留它。
 *
 * 组件只负责「把已经算好的报告排出来」。所有文案、口径、版本判断都在纯函数
 * `report.ts` 里，Word 导出也从同一份 `ReadableReport` 生成。
 */
export function ReportDocument({ report }: { report: ReadableReport }) {
  const summary = report.summary;

  return (
    <article
      className="print-report rounded-xl border border-line bg-surface p-5"
      data-testid="readable-report"
      aria-label="可读报告"
    >
      <header className="border-b border-line pb-3">
        <h3 className="text-lg font-semibold tracking-tight text-ink">{report.title}</h3>
        <p className="mt-1 text-xs text-ink-muted">
          {report.sourceFileName} · 数据版本 v{report.dataVersion} · {report.generatedAtText} 生成
        </p>
      </header>

      <section className="mt-4" data-testid="report-meta" aria-label="报告信息">
        <h4 className="text-xs font-medium text-ink">报告信息</h4>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          {report.meta.map((row) => (
            <div key={row.label} className="flex min-w-0 gap-2">
              <dt className="shrink-0 text-ink-muted">{row.label}</dt>
              <dd className="min-w-0 break-all text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-checks">
        <h4 className="text-xs font-medium text-ink">检查结论</h4>
        <p className={`mt-1 text-xs ${checksToneClass(report.checks.state)}`}>
          {report.checks.summary}
        </p>
        {report.checks.details.length > 0 ? (
          <ul className="mt-1 space-y-1 text-xs text-ink-muted">
            {report.checks.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-coverage">
        <h4 className="text-xs font-medium text-ink">检查覆盖与能力边界</h4>
        {report.coverage === null ? (
          <p className="mt-1 text-xs text-ink-muted">
            这份报告没有拿到字段画像，因此不给出检查覆盖情况；「没有发现问题」不应被读成「所有检查通过」。
          </p>
        ) : (
          <>
            <p
              className={`mt-1 text-xs ${
                report.coverage.trustworthy ? 'text-ink-muted' : 'text-warning-700'
              }`}
            >
              {report.coverage.summary}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                <thead className="text-ink-muted">
                  <tr className="border-b border-line">
                    <th className="py-1 pr-2 font-medium">字段</th>
                    <th className="py-1 pr-2 font-medium">已完成检查</th>
                    <th className="py-1 font-medium">尚未覆盖</th>
                  </tr>
                </thead>
                <tbody>
                  {[report.coverage.table, ...report.coverage.fields].map((row) => (
                    <tr key={row.column} className="border-b border-line/60 align-top">
                      <td className="whitespace-nowrap py-1 pr-2 text-ink">
                        {row.column}
                        <span className="ml-1 text-[11px] text-ink-muted">{row.typeLabel}</span>
                      </td>
                      <td className="py-1 pr-2 text-ink">{row.completedText}</td>
                      <td className="py-1 text-ink-muted">{row.gapsText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{report.coverage.note}</p>
          </>
        )}
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-summary">
        <h4 className="text-xs font-medium text-ink">处理摘要</h4>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-line px-2.5 py-2">
            <dt className="text-xs text-ink-muted">已应用动作</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">
              {summary.actionCount} 步
            </dd>
          </div>
          <div className="rounded-lg border border-line px-2.5 py-2">
            <dt className="text-xs text-ink-muted">改动单元格</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">
              {summary.changedCells} 个
            </dd>
          </div>
          <div className="rounded-lg border border-line px-2.5 py-2">
            <dt className="text-xs text-ink-muted">删除行</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">
              {summary.deletedRows} 行
            </dd>
          </div>
          <div className="rounded-lg border border-line px-2.5 py-2">
            <dt className="text-xs text-ink-muted">数据规模</dt>
            <dd className="text-base font-semibold tabular-nums text-ink">
              {summary.beforeRowCount}
              <span className="mx-1 text-xs font-normal text-ink-muted">→</span>
              {summary.afterRowCount} 行
              <span className="ml-1 text-xs font-normal text-ink-muted">
                {summary.beforeColumnCount} → {summary.afterColumnCount} 列
              </span>
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          {summary.isEmpty
            ? '本轮没有执行清洗动作，数据保持原样。'
            : `行数变化 ${describeRowDelta(summary.rowDelta)}；改动单元格与删除行分开计，不重复累加。`}
        </p>
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-fields">
        <h4 className="text-xs font-medium text-ink">清洗前后字段变化</h4>
        {summary.isEmpty ? (
          <p className="mt-1 text-xs text-ink-muted">本轮没有执行清洗动作，数据保持原样。</p>
        ) : report.fieldChanges.length === 0 ? (
          <p className="mt-1 text-xs text-ink-muted">
            动作已执行，但字段统计没有变化（例如只记录了复核决定）—— 不把它写成「已优化」。
          </p>
        ) : (
          <div className="print-table-wrap mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="py-1.5 pr-3 font-medium">字段</th>
                  <th className="py-1.5 pr-3 font-medium">缺失数（前 → 后）</th>
                  <th className="py-1.5 font-medium">不同取值数（前 → 后）</th>
                </tr>
              </thead>
              <tbody>
                {report.fieldChanges.map((change) => (
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
          </div>
        )}
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-steps">
        <h4 className="text-xs font-medium text-ink">逐步动作</h4>
        {report.steps.length === 0 ? (
          <p className="mt-1 text-xs text-ink-muted">本次会话还没有执行任何清洗动作。</p>
        ) : (
          <div className="print-table-wrap mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th className="py-1.5 pr-3 font-medium">时间（UTC）</th>
                  <th className="py-1.5 pr-3 font-medium">动作</th>
                  <th className="py-1.5 pr-3 font-medium">参数</th>
                  <th className="py-1.5 font-medium">影响</th>
                </tr>
              </thead>
              <tbody>
                {report.steps.map((step) => (
                  <tr key={`${step.index}-${step.actionType}`} className="border-b border-line/70">
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-ink-muted">
                      {step.appliedAtText}
                    </td>
                    <td className="py-1.5 pr-3 text-ink">
                      {step.index + 1}. {step.actionText}
                      <span className="mt-0.5 block text-ink-muted">{step.targetColumnsText}</span>
                    </td>
                    <td className="break-words py-1.5 pr-3 text-ink-muted">{step.paramsText}</td>
                    <td className="py-1.5 text-ink-muted">{step.impactText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-decisions">
        <h4 className="text-xs font-medium text-ink">人工决定与理由</h4>
        {report.decisions.length === 0 ? (
          <p className="mt-1 text-xs text-ink-muted">本次分析没有留下人工决定记录。</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {report.decisions.map((decision, index) => (
              <li
                key={`${decision.title}-${index}`}
                className="rounded-lg border border-line px-3 py-2 text-xs"
              >
                <p className="font-medium text-ink">
                  {decision.title}
                  <span className="ml-1.5 font-normal text-ink-muted">
                    （{decision.severityText}）
                  </span>
                  <span className="ml-1.5 font-normal text-ink-muted">{decision.decisionText}</span>
                </p>
                <p className="mt-1 text-ink-muted">
                  建议：{decision.suggestionActionText}；参数 {decision.suggestionParamsText}
                </p>
                <p className="mt-0.5 text-ink-muted">建议理由：{decision.rationale}</p>
                <p className="mt-0.5 text-ink">用户理由：{decision.note}</p>
                {decision.adjustmentText !== null ? (
                  <p className="mt-0.5 text-ink-muted">{decision.adjustmentText}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-risks">
        <h4 className="text-xs font-medium text-ink">遗留风险</h4>
        <p className="mt-1 text-xs text-ink-muted">{report.risks.summary}</p>
        {report.risks.isEmpty ? null : (
          <ul className="mt-1 space-y-1 text-xs text-ink-muted">
            {report.risks.pending.map((risk) => (
              <li key={`pending-${risk.title}`}>
                待确认：{risk.title}（{risk.severityText}）
              </li>
            ))}
            {report.risks.rejected.map((risk) => (
              <li key={`rejected-${risk.title}`}>
                已拒绝：{risk.title}（{risk.severityText}），保留原值。用户理由：{risk.note}
              </li>
            ))}
            {report.risks.skipped.map((risk, index) => (
              <li key={`skipped-${index}-${risk.actionText}`}>
                未执行：{risk.actionText} —— {risk.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-version">
        <h4 className="text-xs font-medium text-ink">版本与口径</h4>
        {report.staleNotices.length === 0 ? (
          <p className="mt-1 text-xs text-ink-muted">报告里的结论与当前数据版本一致。</p>
        ) : (
          <ul className="mt-1 space-y-1 text-xs text-warning-700">
            {report.staleNotices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{report.sourceNote}</p>
      </section>

      <section className="mt-4 border-t border-line pt-3" data-testid="report-method-draft">
        <h4 className="text-xs font-medium text-ink">{METHOD_DRAFT_APPENDIX_HEADING}</h4>
        <p className="mt-1 text-xs text-ink-muted">{report.methodDraft.title}</p>
        {report.methodDraft.sections.map((methodSection) => (
          <div key={methodSection.heading} className="mt-2">
            <p className="text-xs font-medium text-ink">{methodSection.heading}</p>
            {methodSection.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-1 text-xs text-ink-muted">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
        {report.methodDraft.caveats.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {report.methodDraft.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        ) : null}
        <p
          className="mt-2 border-t border-line pt-2 text-[11px] text-warning-700"
          data-testid="method-draft-disclaimer"
        >
          {report.methodDraft.disclaimer}
        </p>
      </section>
    </article>
  );
}

function describeRowDelta(delta: number): string {
  if (delta === 0) return '不变';
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * 检查结论的语气。
 *
 * 只有真的跑完且版本对得上才用中性正文色；「在跑 / 失败 / 旧版本」用告警色，
 * 否则那句「本次报告不给检查结论」会被当成一句普通的说明，扫一眼就过去了。
 */
function checksToneClass(state: ReadableReport['checks']['state']): string {
  if (state === 'done') return 'text-ink';
  if (state === 'unavailable') return 'text-ink-muted';
  return 'text-warning-700';
}
