'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/ui/components/base/Badge';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { Notice } from '@/ui/components/base/Notice';
import { Spinner } from '@/ui/components/base/Spinner';
import { loadRuleIndex, RuleIndexUnavailableError } from '@/knowledge/loadRules';
import { retrieveRules } from '@/knowledge/retrieve';
import { embedder } from '@/embedding/instance';
import { MODEL_ID } from '@/embedding/loadModel';
import type { RuleHit, RuleIndex } from '@/knowledge/types';

/**
 * 领域规则库：浏览规则 + 试跑检索。
 *
 * 这个页面的价值不只是「看规则有多少条」。它真正回答的是
 * **「你怎么知道检索是有效的」** —— 输入一段数据摘要，当场看到召回哪几条、
 * 以及**为什么召回它**（列名命中／正文用词相近／语义相近）。
 */
export function RuleLibraryPanel() {
  const [index, setIndex] = useState<RuleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [columns, setColumns] = useState('');
  const [hits, setHits] = useState<RuleHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    loadRuleIndex()
      .then((loaded) => {
        if (alive) setIndex(loaded);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        // 加载失败要给出可读原因与「怎么办」，而不是白屏或一直转圈
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

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of index?.entries ?? []) {
      for (const subject of record.学科) counts.set(subject, (counts.get(subject) ?? 0) + 1);
    }
    return [...counts];
  }, [index]);

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
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

          <Notice tone="info" className="mt-4">
            当前是离线哈希后端（字符 2-gram），保证不联网也能检索；稠密语义路需要换 bge 索引并重扫阈值，
            现阶段线上以「关键词 + 列名加权」为主。
          </Notice>
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
