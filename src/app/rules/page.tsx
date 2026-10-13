import { RuleLibraryPanel } from '@/ui/components/RuleLibraryPanel';

export const metadata = {
  title: '领域规则库 · 科研数据质量治理 Agent',
};

/**
 * 领域规则库页面。
 *
 * 内容与索引来自 `knowledge/`：条目是团队填的，索引是 `build-index.py` 建的
 * （113 条、双路向量、正文齐全）。这里做的是**运行时检索**那一半 ——
 * 在此之前，索引建好了但产品里没有一行代码读它。
 */
export default function RulesPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">领域规则库</h1>
        <p className="mt-1 text-sm text-neutral-600">
          这里的规则由团队填写、构建期算好向量与 2-gram 词频，检索时按「学科过滤 →
          双路召回 → RRF 融合 → 列名加权」取前几条注入给大模型。
        </p>
      </header>
      <RuleLibraryPanel />
    </main>
  );
}
