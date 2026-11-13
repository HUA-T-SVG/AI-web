'use client';

import { Check } from 'lucide-react';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { checkLabel } from '@/ui/lib/checkLabels';
import { selectedChecksOf, usePlanStore } from '@/ui/stores/planStore';

/**
 * 检查计划面板（spec §5.2 阶段 2：「用户能看到 AI 打算做什么，并能在执行前干预」）。
 *
 * 确认后固定勾选结果，实际运行的检查和字段由执行器核对。
 */
export function CheckPlanPanel({
  onExecute,
  dataVersion,
  disabled = false,
}: {
  onExecute: () => void;
  dataVersion: number;
  /** 追问等待期禁用：这时任何发送都会发出一条用户消息，让 tool-result 回填失效 */
  disabled?: boolean;
}) {
  // selector 只取引用稳定的值（plan / excluded / toggle），派生计算放在组件里做。
  // 把 `selectedChecksOf(...)` 写进 selector 会每次返回新数组 → zustand 判定「变了」
  // → 无限重渲染 → 整页白屏。这个坑在 reviewStore 那边踩过一次，Task 6 又踩了一次，
  // 是 E2E 抓出来的。
  const plan = usePlanStore((state) => state.plan);
  const planVersion = usePlanStore((state) => state.dataVersion);
  const approved = usePlanStore((state) => state.approvedChecks !== null);
  const excluded = usePlanStore((state) => state.excluded);
  const toggle = usePlanStore((state) => state.toggle);
  const selected = selectedChecksOf(plan, excluded);

  if (!plan || planVersion !== dataVersion) return null;

  return (
    <Card className="mb-4 border-brand-200">
      <CardHeader className="bg-brand-50/60">
        <div>
          <CardTitle>检查计划</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">确认后，AI 只能执行你勾选的检查项和字段</p>
        </div>
        <span className="text-xs font-medium text-brand-800">
          已选 {selected.length} / {plan.checks.length} 项
        </span>
      </CardHeader>

      <CardBody>
        <p className="text-sm leading-relaxed text-ink">{plan.reasoning}</p>

        <ul className="mt-3 space-y-2">
          {plan.checks.map((item, index) => (
            <li key={`${item.checkId}-${index}`} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-brand-700"
                  checked={!excluded.has(index)}
                  disabled={disabled || approved}
                  onChange={() => toggle(index)}
                  aria-label={`执行 ${item.checkId}${item.targetColumns.length > 0 ? `（${item.targetColumns.join('、')}）` : ''}`}
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink" title={item.checkId}>
                      {checkLabel(item.checkId)}
                    </span>
                    {item.targetColumns.length > 0 ? (
                      <span className="text-xs text-ink-muted">{item.targetColumns.join('、')}</span>
                    ) : null}
                    <Badge tone={item.priority === 'high' ? 'high' : item.priority === 'medium' ? 'medium' : 'low'}>
                      {item.priority}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{item.reason}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button disabled={disabled || approved || selected.length === 0} onClick={onExecute}>
            <Check className="h-4 w-4" aria-hidden="true" />
            {approved ? '计划已确认' : '按此计划执行'}
          </Button>
          <span className="text-xs text-ink-muted">
            {approved ? '本轮检查范围已固定' : selected.length === 0
              ? '至少保留一项，否则这次检查什么都不会做'
              : '可取消不需要的检查项'}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
