'use client';

import { Card } from '@/ui/components/base/Card';
import { Button } from '@/ui/components/base/Button';
import { Badge } from '@/ui/components/base/Badge';
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
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">检查计划</h2>
        <span className="text-xs text-neutral-500">
          已选 {selected.length} / {plan.checks.length} 项
        </span>
      </div>

      <p className="mt-2 text-sm text-neutral-600">{plan.reasoning}</p>

      <ul className="mt-3 space-y-2">
        {plan.checks.map((item, index) => (
          <li key={`${item.checkId}-${index}`} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={!excluded.has(index)}
              onChange={() => toggle(index)}
              aria-label={`执行 ${item.checkId}${item.targetColumns.length > 0 ? `（${item.targetColumns.join('、')}）` : ''}`}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{item.checkId}</span>
                {item.targetColumns.length > 0 && (
                  <span className="text-xs text-neutral-500">{item.targetColumns.join('、')}</span>
                )}
                <Badge>{item.priority}</Badge>
              </div>
              <p className="text-xs text-neutral-600">{item.reason}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-3">
        <Button disabled={selected.length === 0} onClick={() => onExecute(buildInstruction())}>
          按此计划执行
        </Button>
        <span className="text-xs text-neutral-500">
          {selected.length === 0
            ? '至少保留一项，否则这次检查什么都不会做'
            : '把「按此计划执行」当成一条消息发出去 —— 检查仍由模型按计划驱动'}
        </span>
      </div>
    </Card>
  );
}
