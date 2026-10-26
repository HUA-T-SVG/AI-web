'use client';

import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { checkLabel } from '@/ui/lib/checkLabels';
import { cn } from '@/ui/lib/cn';
import { SCENARIOS, type ScenarioId } from '@/ui/lib/scenarios';
import { useScenarioStore } from '@/ui/stores/scenarioStore';

/**
 * 首屏「这份数据属于哪类研究」。
 *
 * 三张卡片只回答「先看什么」，不回答「检查什么」—— 8 项检查对任何数据都全跑。
 * 副文案把这句话明写在界面上，是为了让「选了问卷，所以只查了 4 项」这种误读
 * 没有生存空间；推荐检查也用的是「建议优先关注」的语气，不写「仅检查」。
 *
 * 示例数据入口是同一个场景的延伸：点开就能看到这类数据常见的脏法，
 * 不必先自己准备一份文件。
 */
export function ScenarioCards({
  onLoadSample,
  busy = false,
}: {
  onLoadSample: (scenarioId: ScenarioId) => void;
  busy?: boolean;
}) {
  const selectedId = useScenarioStore((state) => state.scenarioId);
  const select = useScenarioStore((state) => state.select);
  const clear = useScenarioStore((state) => state.clear);

  return (
    <section aria-labelledby="scenario-title" className="space-y-3">
      <div>
        <h2 id="scenario-title" className="text-base font-semibold tracking-tight text-ink">
          这份数据属于哪类研究？（可选）
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          只决定下面标出的关注点与检查页的「本次重点」，{''}
          <strong className="font-medium text-ink">8 项规则检查仍然全部执行</strong>
          ，语义层不可用时界面会另行说明；选错也不影响结果。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {SCENARIOS.map((scenario) => {
          const selected = scenario.id === selectedId;
          return (
            <article
              key={scenario.id}
              data-testid="scenario-card"
              data-scenario={scenario.id}
              data-selected={selected}
              className={cn(
                'flex flex-col gap-2 rounded-xl border p-4 transition-colors',
                selected ? 'border-brand-500 bg-brand-50/40' : 'border-line bg-surface',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{scenario.title}</h3>
                {selected ? <Badge tone="brand">已选为本次场景</Badge> : null}
              </div>

              <p className="text-xs leading-relaxed text-ink-muted">{scenario.summary}</p>

              <ul className="space-y-1 text-xs leading-relaxed text-ink">
                {scenario.focusPoints.map((point) => (
                  <li key={point} className="flex gap-1.5">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-600"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              <div role="group" aria-label="建议优先关注的检查" className="space-y-1">
                <p className="text-[11px] text-ink-muted">建议优先关注</p>
                <div className="flex flex-wrap gap-1">
                  {scenario.recommendedCheckIds.map((checkId) => (
                    <span
                      key={checkId}
                      className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-muted"
                    >
                      {checkLabel(checkId)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant={selected ? 'secondary' : 'primary'}
                  aria-pressed={selected}
                  onClick={() => (selected ? clear() : select(scenario.id))}
                >
                  {selected ? '取消本场景' : '选为本次场景'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`scenario-sample-${scenario.id}`}
                  disabled={busy}
                  onClick={() => onLoadSample(scenario.id)}
                >
                  用这份合成示例试试
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
