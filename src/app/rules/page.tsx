import { BookOpen, Crosshair, ListChecks } from 'lucide-react';
import { RuleLibraryPanel } from '@/ui/components/RuleLibraryPanel';
import { PageHeader } from '@/ui/components/base/PageHeader';

export const metadata = {
  title: '领域规则库 · 科研数据质量治理 Agent',
};

/**
 * 领域规则库页面。
 *
 * 先讲清「它用来做什么、管到哪、可信到什么程度」，再给检索工具 ——
 * 否则读者会把「检索出来了」误读成「这些规则已经核对过」。
 */
export default function RulesPage() {
  return (
    <main className="page-shell">
      <PageHeader
        title="领域规则库"
        description="按学科、类别与核验状态查规则，先看它适用于什么、来源是否可靠，再看为什么命中。"
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <BookOpen className="h-4 w-4 text-brand-600" aria-hidden="true" />
            用途
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            检索结果只作为检查与 AI 分析的参考依据，不直接改数据；每条都会带召回理由与来源。
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Crosshair className="h-4 w-4 text-brand-600" aria-hidden="true" />
            适用范围
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            面向单数据集的质量问题：字段取值语义、口径与常见脏法。不覆盖跨表连接，也不做统计建模。
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <ListChecks className="h-4 w-4 text-brand-600" aria-hidden="true" />
            核验状态
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            条目由团队填写，目前全部标注「待核对」—— 引用前请先对照原文确认。
          </p>
        </div>
      </div>

      <RuleLibraryPanel />
    </main>
  );
}
