'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody } from '@/ui/components/base/Card';
import { Spinner } from '@/ui/components/base/Spinner';
import { loadRuleIndex, RuleIndexUnavailableError } from '@/knowledge/loadRules';
import { retrieveRules } from '@/knowledge/retrieve';
import { embedder } from '@/embedding/instance';
import type { RuleHit, RuleIndex } from '@/knowledge/types';

/**
 * 领域规则库：浏览规则 + 试跑检索。
 *
 * 这个页面的价值不只是「看规则有多少条」。它真正回答的是评委一定会问的那句
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
        }),
      );
    } finally {
      setSearching(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-red-700">{error}</p>
          <p className="mt-2 text-xs text-neutral-600">
            它在 `knowledge/index/rules.json`，由 `build-index.py` 生成，再由
            `scripts/sync-rules.mjs` 同步到 `public/`。
          </p>
        </CardBody>
      </Card>
    );
  }

  if (!index) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <Spinner />
            正在加载规则库…
          </div>
        </CardBody>
      </Card>
    );
  }

  const subjects = new Map<string, number>();
  for (const record of index.entries) {
    for (const subject of record.学科) subjects.set(subject, (subjects.get(subject) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h2 className="text-sm font-medium">规则库概况</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-neutral-500">条目</dt>
              <dd>{index.entries.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">向量维度</dt>
              <dd>{index.dim}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">后端</dt>
              <dd className="truncate" title={index.model}>
                {index.model}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">构建时间</dt>
              <dd className="truncate">{index.builtAt.slice(0, 10)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-neutral-600">
            学科分布：{[...subjects].map(([name, count]) => `${name} ${count}`).join('　')}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="text-sm font-medium">试跑检索</h2>
          <p className="mt-1 text-xs text-neutral-600">
            输入一段像数据摘要的文字（列名 + 取值分布），看会召回哪几条、以及为什么。
          </p>
          <div className="mt-3 space-y-2">
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="例如：学历 硕士 研究生 本科"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="相关列名，逗号分隔（可选）。列名命中规则声明的别名时会加权"
              value={columns}
              onChange={(event) => setColumns(event.target.value)}
            />
            <Button disabled={searching || query.trim() === ''} onClick={() => void runSearch()}>
              {searching ? '检索中…' : '检索'}
            </Button>
          </div>

          {hits && (
            <ul className="mt-4 space-y-3">
              {hits.length === 0 && <li className="text-sm text-neutral-600">没有召回任何规则。</li>}
              {hits.map((hit) => (
                <li key={hit.rule.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{hit.rule.entry.标题}</span>
                    <span className="text-xs text-neutral-500">{hit.rule.entry.类别}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    召回理由：{hit.reason}　·　来源：{hit.rule.entry.来源 ?? '未注明'}　·　权威度：
                    {hit.rule.entry.权威度 ?? '未注明'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{hit.rule.entry.规则内容}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
