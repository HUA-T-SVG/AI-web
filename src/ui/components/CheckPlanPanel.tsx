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
 * 交互设计上有一处必须讲清楚的取舍：**「按此计划执行」是把计划作为一条新的用户消息
 * 发出去，而不是界面直接替模型调 `run_checks`。** 工具循环的驱动方必须是模型
 * （设计文档 §5.2 阶段 3），界面替它调用会让「这次检查是谁决定的」变得说不清 ——
 * 而那恰恰是可解释性要回答的问题。用户改动的部分以「取消了哪几项」的形式
 * 明确写进这条消息，模型据此跳过。
 */
export function CheckPlanPanel({ onExecute }: { onExecute: (instruction: string) => void }) {
  // selector 只取引用稳定的值（plan / excluded / toggle），派生计算放在组件里做。
  // 把 `selectedChecksOf(...)` 写进 selector 会每次返回新数组 → zustand 判定「变了」
  // → 无限重渲染 → 整页白屏。这个坑在 reviewStore 那边踩过一次，Task 6 又踩了一次，
  // 是 E2E 抓出来的。
  const plan = usePlanStore((state) => state.plan);
  const excluded = usePlanStore((state) => state.excluded);
  const toggle = usePlanStore((state) => state.toggle);
  const selected = selectedChecksOf(plan, excluded);

  if (!plan) return null;

  const buildInstruction = () =>
    [
      '请按以下计划执行检查：',
      ...selected.map(
        (item, index) =>
          `${index + 1}. ${item.checkId}` +
          (item.targetColumns.length > 0 ? `（${item.targetColumns.join('、')}）` : '') +
          ` —— ${item.reason}`,
      ),
    ].join('\n');

  return (
    <Card className="mb-4 border-brand-200">
      <CardHeader className="bg-brand-50/60">
        <div>
          <CardTitle>检查计划</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">先看清打算查什么，再决定执行；取消的项不会发给模型</p>
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
          <Button disabled={selected.length === 0} onClick={() => onExecute(buildInstruction())}>
            <Check className="h-4 w-4" aria-hidden="true" />
            按此计划执行
          </Button>
          <span className="text-xs text-ink-muted">
            {selected.length === 0
              ? '至少保留一项，否则这次检查什么都不会做'
              : '把「按此计划执行」当成一条消息发出去 —— 检查仍由模型按计划驱动'}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
