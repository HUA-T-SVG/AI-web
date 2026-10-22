'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { EmptyState } from '@/ui/components/base/EmptyState';
import { Notice } from '@/ui/components/base/Notice';
import { Spinner } from '@/ui/components/base/Spinner';
import { loadRuleIndex, RuleIndexUnavailableError } from '@/knowledge/loadRules';
import { retrieveRules } from '@/knowledge/retrieve';
import { embedder } from '@/embedding/instance';
import { MODEL_ID } from '@/embedding/loadModel';
import type { RuleHit, RuleIndex, RuleRecord } from '@/knowledge/types';

/**
 * 领域规则库：查询、判断、再看检索解释。
 *
 * 设计文档要求页面先回答「这条规则适用于什么、来源是什么、核验没有」，
 * 向量维度与索引后端收进技术详情 —— 那些是维护者关心的，不是使用者判断的依据。
 * 试跑检索保留在下方，它回答的是另一个问题：「为什么召回这条」。
 */
export function RuleLibraryPanel() {
  const [index, setIndex] = useState<RuleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [columns, setColumns] = useState('');
  const [hits, setHits] = useState<RuleHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('all');
  const [subject, setSubject] = useState('all');
  const [verification, setVerification] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadRuleIndex()
      .then((loaded) => {
        if (alive) setIndex(loaded);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setError(
          reason instanceof RuleIndexUnavailableError
            ? reason.message
            : `规则库加载失败：${reason instanceof Error ? reason.message : String(reason)}`,
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  const runSearch = async () => {
    if (!index || query.trim() === '') return;
    setSearching(true);
    try {
      setHits(
        await retrieveRules(query, {
          index,
          embedder,
          columns: columns
            .split(/[,，、\s]+/)
            .map((item) => item.trim())
            .filter(Boolean),
          // 索引后端与查询模型不配对时只走关键词路，并把理由说成「关键词召回」
          // 而不是「语义相近」——见 retrieve.ts 的 queryModel 说明
          queryModel: MODEL_ID,
        }),
      );
    } finally {
      setSearching(false);
    }
  };

  const categories = useMemo(() => {
    const values = new Set(
      (index?.entries ?? []).map((record) => record.entry.类别).filter(Boolean),
    );
    return [...values].sort();
  }, [index]);

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of index?.entries ?? []) {
      for (const item of record.学科) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts];
  }, [index]);

  const filtered = useMemo(() => {
    if (!index) return [];
    const keywordText = keyword.trim().toLowerCase();
    return index.entries.filter((record) => {
      const entry = record.entry;
      if (category !== 'all' && entry.类别 !== category) return false;
      if (subject !== 'all' && !record.学科.includes(subject)) return false;
      if (verification !== 'all' && (entry.核验状态 ?? '未标注') !== verification) return false;
      if (keywordText === '') return true;
      const haystack = [entry.标题, entry.规则内容, entry.触发条件 ?? '', record.适用字段.join(' ')]
        .join('\n')
        .toLowerCase();
      return haystack.includes(keywordText);
    });
  }, [index, keyword, category, subject, verification]);

  const selected: RuleRecord | null = useMemo(
    () => filtered.find((record) => record.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  if (error) {
    return (
      <Notice tone="danger" title="规则库加载失败">
        {error}
        <p className="mt-1">
          它在 <code>knowledge/index/rules.json</code>，由 <code>build-index.py</code> 生成，
          再由 <code>scripts/sync-rules.mjs</code> 同步到 <code>public/</code>。修好后再刷新本页。
        </p>
      </Notice>
    );
  }

  if (!index) {
    return (
      <Card>
        <CardBody>
          <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
            <Spinner />
            正在加载规则库…
          </p>
        </CardBody>
      </Card>
    );
  }

  const generalCount = subjects.find(([name]) => name === '通用')?.[1] ?? 0;
  const subjectCount = index.entries.length - generalCount;
  const verified = index.entries.filter((record) => record.entry.核验状态 === '已核对').length;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>规则库概况</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">数字从索引读取，不写死；重建索引后这里会跟着变</p>
          </div>
          <Badge tone={verified === 0 ? 'medium' : 'success'}>
            {verified === 0 ? '全部待核对' : `已核对 ${verified} / ${index.entries.length}`}
          </Badge>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="text-xs text-ink-muted">条目</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{index.entries.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">通用 / 学科</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">
                {generalCount} / {subjectCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">核验状态</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {verified === 0 ? '全部待核对' : `已核对 ${verified} 条`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">向量维度</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{index.dim}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">后端</dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink" title={index.model}>
                {index.model}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">构建时间</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{index.builtAt.slice(0, 10)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">学科分布</span>
            {subjects.map(([name, count]) => (
              <Badge key={name} tone="neutral">
                {name} {count}
              </Badge>
            ))}
          </div>

          <details className="mt-3 text-xs text-ink-muted">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">技术详情</summary>
            <p className="mt-2 max-w-3xl leading-relaxed">
              当前是离线哈希后端（字符 2-gram），保证不联网也能检索；稠密语义路需要换 bge 索引并重扫阈值。
              现阶段线上以「关键词 + 列名加权」为主，命中程度不代表内容正确性。
            </p>
          </details>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>浏览与筛选</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              先按学科、类别与核验状态找到规则，再看它适用于什么数据、来源是否可靠
            </p>
          </div>
          <span className="text-xs text-ink-muted">
            显示 {filtered.length} / {index.entries.length} 条
          </span>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-[180px] flex-1">
                  <span className="sr-only">搜索规则</span>
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="搜索标题、正文或触发条件"
                    className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-2 text-xs text-ink placeholder:text-ink-muted/70 focus:border-brand-400"
                  />
                </label>
                <select
                  aria-label="按类别筛选"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink"
                >
                  <option value="all">全部类别</option>
                  {categories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="按学科筛选"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink"
                >
                  <option value="all">全部学科</option>
                  {subjects.map(([name]) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="按核验状态筛选"
                  value={verification}
                  onChange={(event) => setVerification(event.target.value)}
                  className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink"
                >
                  <option value="all">全部核验状态</option>
                  <option value="待核对">待核对</option>
                  <option value="已核对">已核对</option>
                </select>
              </div>

              <ul className="mt-3 max-h-[480px] space-y-1 overflow-auto pr-1">
                {filtered.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-ink-muted">没有符合条件的规则</li>
                ) : null}
                {filtered.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(record.id)}
                      aria-pressed={selectedId === record.id}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        selectedId === record.id
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-line hover:border-brand-200 hover:bg-brand-50/40'
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{record.entry.标题}</span>
                        <Badge tone="neutral">{record.entry.类别}</Badge>
                        {record.entry.核验状态 ? (
                          <Badge tone={record.entry.核验状态 === '已核对' ? 'success' : 'medium'}>
                            {record.entry.核验状态}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-ink-muted">
                        {record.entry.规则内容}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0">
              {selected === null ? (
                <EmptyState
                  icon={null}
                  title="选中左侧一条规则"
                  description="这里显示核验状态、适用字段、来源与正反例；检索匹配程度不能当作规则正确率。"
                />
              ) : (
                <div className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{selected.entry.标题}</h3>
                    <Badge tone={selected.entry.核验状态 === '已核对' ? 'success' : 'medium'}>
                      {selected.entry.核验状态 ?? '未标注'}
                    </Badge>
                    <Badge tone="neutral">{selected.entry.类别}</Badge>
                  </div>

                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-muted">适用字段</dt>
                      <dd className="mt-0.5 text-ink">
                        {selected.适用字段.length > 0 ? selected.适用字段.join('、') : '通用'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">来源 / 权威度</dt>
                      <dd className="mt-0.5 text-ink">
                        {selected.entry.来源 ?? '未注明'} · {selected.entry.权威度 ?? '未注明'}
                      </dd>
                    </div>
                  </dl>

                  {selected.entry.触发条件 ? (
                    <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
                      触发条件：{selected.entry.触发条件}
                    </p>
                  ) : null}

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {selected.entry.规则内容}
                  </p>

                  {selected.entry.正例 ? (
                    <p className="mt-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-xs text-success-700">
                      正例：{selected.entry.正例}
                    </p>
                  ) : null}
                  {selected.entry.反例 ? (
                    <p className="mt-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                      反例：{selected.entry.反例}
                    </p>
                  ) : null}

                  <p className="mt-3 text-xs text-ink-muted">
                    检索匹配程度只说明「为什么召回」，不代表内容已核验；引用前请对照来源。
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>试跑检索</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              输入一段像数据摘要的文字（列名 + 取值分布），看会召回哪几条、以及为什么
            </p>
          </div>
          <Badge tone="brand">当场验证</Badge>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            <div>
              <label htmlFor="rule-query" className="text-xs font-medium text-ink">
                数据摘要
              </label>
              <input
                id="rule-query"
                className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand-400"
                placeholder="例如：学历 硕士 研究生 本科"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="rule-columns" className="text-xs font-medium text-ink">
                相关列名（可选）
              </label>
              <input
                id="rule-columns"
                className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand-400"
                placeholder="相关列名，逗号分隔（可选）。列名命中规则声明的别名时会加权"
                value={columns}
                onChange={(event) => setColumns(event.target.value)}
              />
            </div>
            <Button disabled={searching || query.trim() === ''} onClick={() => void runSearch()}>
              <Search className="h-4 w-4" aria-hidden="true" />
              {searching ? '检索中…' : '检索'}
            </Button>
          </div>

          {hits && (
            <ul className="mt-5 space-y-3" aria-live="polite">
              {hits.length === 0 && <li className="text-sm text-ink-muted">没有召回任何规则。</li>}
              {hits.map((hit) => (
                <li key={hit.rule.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{hit.rule.entry.标题}</span>
                    <Badge tone="neutral">{hit.rule.entry.类别}</Badge>
                    {hit.rule.entry.核验状态 ? (
                      <Badge tone={hit.rule.entry.核验状态 === '已核对' ? 'success' : 'medium'}>
                        {hit.rule.entry.核验状态}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                    召回理由：{hit.reason} · 来源：{hit.rule.entry.来源 ?? '未注明'} · 权威度：
                    {hit.rule.entry.权威度 ?? '未注明'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {hit.rule.entry.规则内容}
                  </p>
                  {hit.rule.entry.触发条件 ? (
                    <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
                      触发条件：{hit.rule.entry.触发条件}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-ink-muted">
        注：检索质量受后端限制。换 bge 索引后需要重扫阈值，否则阈值与向量尺度不匹配。
      </p>
    </div>
  );
}
