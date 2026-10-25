'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { checkLabel } from '@/ui/lib/checkLabels';
import { cn } from '@/ui/lib/cn';
import { buildCoverageMap, type CoverageGap, type FieldCoverage } from '@/ui/lib/coverageMap';
import { useDatasetStore } from '@/ui/stores/datasetStore';
import { useRangeRuleStore, userRangeRuleId } from '@/ui/stores/rangeRuleStore';

/**
 * 检查覆盖地图：按字段回答「这份数据到底检查到了什么程度」。
 *
 * 为什么要有这张表：问题清单只说明「报了什么」，不能说明「查了什么」。
 * 空清单在用户眼里容易等同「全部检查通过」，而这恰恰是最危险的误读 ——
 * 值域规则没配置、语义模型降级、某个检查项崩了，都会让空清单显得比实际更干净。
 *
 * 两条硬规则：
 *   1. 检查没跑完 / 失败 / 结论属于旧版本时，整张表不给任何「已完成」，
 *      只说明「覆盖情况未知」，并把重跑入口放在眼前；
 *   2. 每个字段都列出「尚未覆盖」的真实原因（能力边界 / 配置缺口 / 降级），
 *      没有入口的就不给按钮，不用一句「暂无」糊过去。
 */
const TYPE_LABEL: Record<string, string> = {
  number: '数值',
  category: '类别',
  text: '文本',
  boolean: '布尔',
  empty: '空列',
  mixed: '混杂',
  table: '表级',
};

const GAP_TONE: Record<CoverageGap['kind'], string> = {
  'not-run': 'text-warning-700',
  failed: 'text-danger-700',
  stale: 'text-warning-700',
  degraded: 'text-warning-700',
  'not-configured': 'text-info-700',
  'not-applicable': 'text-ink-muted',
  'needs-review': 'text-brand-800',
};

function ActionControl({ gap, column }: { gap: CoverageGap; column: string }) {
  const rerunChecks = useDatasetStore((state) => state.rerunChecks);
  const [editing, setEditing] = useState(false);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const upsert = useRangeRuleStore((state) => state.upsert);

  if (gap.action === 'rerun-checks') {
    return (
      <Button size="sm" variant="secondary" onClick={() => void rerunChecks()}>
        重新检查
      </Button>
    );
  }

  if (gap.action === 'review-pending' || gap.action === 'open-analysis') {
    return (
      <Link
        href="/analysis"
        className="text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
      >
        去分析与复核
      </Link>
    );
  }

  if (gap.action === 'configure-range') {
    const save = () => {
      const min = minText.trim() === '' ? undefined : Number(minText);
      const max = maxText.trim() === '' ? undefined : Number(maxText);
      if (min === undefined && max === undefined) {
        setError('至少填一个界（下界或上界），否则规则不会生效。');
        return;
      }
      if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) {
        setError('上下界必须是数字。');
        return;
      }
      if (min !== undefined && max !== undefined && min >= max) {
        setError('下界必须小于上界，否则所有取值都会越界。');
        return;
      }
      upsert({
        id: userRangeRuleId(column),
        column,
        min,
        max,
        rationale: '用户在质量检查页填写的适用范围',
      });
      setError(null);
      setEditing(false);
      void rerunChecks();
    };

    if (!editing) {
      return (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditing(true);
            setError(null);
            const existing = useRangeRuleStore.getState().rules[column];
            setMinText(existing?.min !== undefined ? String(existing.min) : '');
            setMaxText(existing?.max !== undefined ? String(existing.max) : '');
          }}
        >
          填写适用范围
        </Button>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          下界
          <input
            value={minText}
            onChange={(event) => setMinText(event.target.value)}
            inputMode="decimal"
            className="h-8 w-20 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink max-md:h-11"
            aria-label={`${column}下界`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          上界
          <input
            value={maxText}
            onChange={(event) => setMaxText(event.target.value)}
            inputMode="decimal"
            className="h-8 w-20 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink max-md:h-11"
            aria-label={`${column}上界`}
          />
        </label>
        <Button size="sm" onClick={save}>
          保存适用范围
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          取消
        </Button>
        {error !== null ? (
          <p role="alert" className="w-full text-xs text-danger-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}

function CoverageRow({ coverage }: { coverage: FieldCoverage }) {
  const isTable = coverage.type === 'table';
  return (
    <tr
      data-testid="coverage-row"
      data-column={coverage.column}
      data-table={isTable ? 'true' : undefined}
      className={cn('border-b border-line align-top', isTable ? 'bg-canvas/60' : '')}
    >
      <td className="whitespace-nowrap px-3 py-2">
        <span className="text-sm font-medium text-ink">{coverage.column}</span>
        <span className="ml-1.5 rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-muted">
          {TYPE_LABEL[coverage.type] ?? coverage.type}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-ink">
        {coverage.completed.length > 0 ? (
          <span>{coverage.completed.map((id) => checkLabel(id)).join('、')}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {coverage.gaps.length === 0 ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <ul className="space-y-1">
            {coverage.gaps.map((gap) => (
              <li key={`${gap.kind}-${gap.capability}`} className={GAP_TONE[gap.kind]}>
                <span className="font-medium">{gap.capability}：</span>
                {gap.reason}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {coverage.gaps.some((gap) => gap.action !== null) ? (
          <div className="flex flex-col items-start gap-1.5">
            {coverage.gaps
              .filter((gap) => gap.action !== null)
              .map((gap) => (
                <ActionControl key={`${gap.kind}-${gap.capability}`} gap={gap} column={coverage.column} />
              ))}
          </div>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
    </tr>
  );
}

export function CoverageMap() {
  const profile = useDatasetStore((state) => state.workingProfile);
  const issues = useDatasetStore((state) => state.issues);
  const checksStatus = useDatasetStore((state) => state.checksStatus);
  const checksVersion = useDatasetStore((state) => state.checksVersion);
  const dataVersion = useDatasetStore((state) => state.dataVersion);
  const synonymStatus = useDatasetStore((state) => state.synonymStatus);
  const rules = useRangeRuleStore((state) => state.rules);

  const map = useMemo(
    () =>
      profile === null
        ? null
        : buildCoverageMap({
            profile,
            issues,
            checksStatus,
            checksVersion,
            dataVersion,
            synonymStatus,
            rangeRules: Object.values(rules),
          }),
    [profile, issues, checksStatus, checksVersion, dataVersion, synonymStatus, rules],
  );

  if (profile === null || map === null) {
    return null;
  }

  return (
    <Card className="mt-4" data-testid="coverage-map">
      <CardHeader>
        <div>
          <CardTitle>检查覆盖地图</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            这张表说明每个字段实际跑了哪些检查、还有哪些能力边界或配置缺口。
            <b>「没有发现问题」不等于「所有检查都通过」</b>。
          </p>
        </div>
        <Badge tone={map.trustworthy ? 'brand' : 'medium'}>
          {map.trustworthy ? '覆盖情况可读' : '覆盖情况未知'}
        </Badge>
      </CardHeader>
      <CardBody className="p-0">
        <p
          className={cn(
            'border-b border-line px-4 py-2 text-xs',
            map.trustworthy ? 'text-ink-muted' : 'bg-warning-50 text-warning-700',
          )}
        >
          {map.summary}
        </p>

        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-canvas text-xs text-ink-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-medium">字段</th>
                <th className="px-3 py-2 font-medium">已完成检查</th>
                <th className="px-3 py-2 font-medium">尚未覆盖</th>
                <th className="px-3 py-2 font-medium">下一步</th>
              </tr>
            </thead>
            <tbody>
              <CoverageRow coverage={map.table} />
              {map.fields.map((coverage) => (
                <CoverageRow key={coverage.column} coverage={coverage} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-ink-muted">
          适用范围由你填写、只保存在当前页面内存里（刷新后数据与结论会恢复，但范围配置需要重填）；
          它只影响本机确定性检查，不改变原始数据。没有「下一步」按钮的项是当前版本的能力边界，
          不是界面遗漏。
        </p>
      </CardBody>
    </Card>
  );
}
