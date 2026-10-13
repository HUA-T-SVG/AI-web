'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody } from '@/ui/components/base/Card';
import { useProvenanceStore } from '@/ui/stores/provenanceStore';
import { APP_VERSION, buildProvenance, toCsv } from '@/scriptgen';
import { loadRuleIndex } from '@/knowledge/loadRules';

/**
 * 导出面板（设计文档 §4.7 与 §6.5）。
 *
 * 四样产出，都由**同一套动作序列**生成：清洗后数据、处理留痕、pandas 脚本、质量报告。
 * 「同一套」不是形容 —— 脚本由 `buildPandasScript(actions)` 生成，而界面执行时用的是
 * 同一个 `actions`。两边同源才能保证「脚本跑出来的结果与界面显示的一致」，
 * 那是 `core` 保持平台无关那条架构决策在这里的兑现方式。
 */

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // 不 revoke 的话每次导出都漏一个 blob URL；revoke 太早又会取消下载，
  // 所以放在下一轮事件循环
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 文件名带时间戳：反复导出时不会互相覆盖，也便于对上「哪一次」。 */
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function ExportPanel({ sourceFileName = '原始数据.csv' }: { sourceFileName?: string }) {
  const current = useProvenanceStore((state) => state.current);
  const steps = useProvenanceStore((state) => state.steps);
  const skipped = useProvenanceStore((state) => state.skipped);
  const sessionStartedAt = useProvenanceStore((state) => state.sessionStartedAt);
  const undo = useProvenanceStore((state) => state.undo);
  const [ruleLibraryVersion, setRuleLibraryVersion] = useState('未加载');

  useEffect(() => {
    let alive = true;
    // 规则库版本进留痕：同一条结论在不同版本的规则库下可信度不同
    loadRuleIndex()
      .then((index) => {
        if (alive) setRuleLibraryVersion(`${index.entries.length} 条`);
      })
      .catch(() => {
        if (alive) setRuleLibraryVersion('不可用');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!current) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-neutral-600">还没有导入数据，暂时没有可导出的东西。</p>
        </CardBody>
      </Card>
    );
  }

  const provenance = () =>
    buildProvenance({
      dataset: current,
      applied: steps,
      sessionStartedAt: sessionStartedAt ?? new Date().toISOString(),
      environment: {
        appVersion: APP_VERSION,
        ruleLibraryVersion,
        embeddingModel: 'bge-small-zh-v1.5（q8）',
      },
      sourceFileName,
    });

  return (
    <Card>
      <CardBody>
        <h2 className="text-sm font-medium">导出</h2>
        <p className="mt-1 text-xs text-neutral-600">
          已应用 {steps.length} 条动作
          {skipped.length > 0 ? `，${skipped.length} 条未能执行` : ''}。四样产出都由同一套动作生成 ——
          脚本跑出来的结果与这里显示的一致。
        </p>

        {skipped.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            {skipped.map((item, index) => (
              <li key={`${item.action.action}-${index}`}>
                未执行「{item.action.action}」：{item.reason}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => download(`清洗后数据-${stamp()}.csv`, toCsv(current), 'text/csv')}
          >
            清洗后数据（CSV）
          </Button>
          <Button
            size="sm"
            onClick={() =>
              download(
                `处理留痕-${stamp()}.json`,
                `${JSON.stringify(provenance(), null, 2)}\n`,
                'application/json',
              )
            }
          >
            处理留痕（JSON）
          </Button>
          <Button
            size="sm"
            onClick={() =>
              download(`清洗脚本-${stamp()}.py`, provenance().generatedScript, 'text/x-python')
            }
          >
            pandas 脚本
          </Button>
          <Button
            size="sm"
            disabled={steps.length === 0}
            onClick={() => undo()}
            title={steps.length === 0 ? '没有可撤销的动作' : undefined}
          >
            撤销上一步
          </Button>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          留痕里记的是<strong>动作序列</strong>而不是结果 —— 结果可以从动作重放出来，反过来不行。
          数据指纹：
          <code className="ml-1">{provenance().datasetFingerprint}</code>
        </p>
      </CardBody>
    </Card>
  );
}
