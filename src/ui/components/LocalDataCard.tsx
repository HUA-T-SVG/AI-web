'use client';

import { useState } from 'react';
import { Button } from '@/ui/components/base/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/components/base/Card';
import { useDatasetStore } from '@/ui/stores/datasetStore';

/**
 * 「本机数据」卡片：把「数据存在这台机器的浏览器里」摆在明面上，并给一个随时可用的清除入口。
 *
 * **为什么需要它（T8）**：暂存默认不过期，而此前唯一的出口是「恢复提示条」里那个链接 ——
 * 它只在刷新后恢复过数据时才出现。用公用机的人想交还设备时，在界面上根本找不到入口；
 * **藏起来的删除入口等于没有**。所以这里把它放在导入页，任何时候都在。
 *
 * 清除后界面必须分开说两件事：浏览器里的副本**没了**，但当前页面上的数据**还在内存里**
 * （关闭标签页才消失）。混成一句会让人误以为数据已经彻底销毁。
 */
export function LocalDataCard() {
  const cacheCleared = useDatasetStore((state) => state.cacheCleared);
  const cacheNote = useDatasetStore((state) => state.cacheNote);
  const clearLocalCache = useDatasetStore((state) => state.clearLocalCache);
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>本机数据</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-sm text-neutral-600">
        <p>
          导入的数据暂存在这台机器的浏览器里（IndexedDB），默认不过期 —— 所以刷新页面能找回来。
          原始数据不会上传到任何服务器。
        </p>

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="clear-cache-confirm-panel">
            <span className="text-sm text-neutral-800">确定清除？清除后刷新页面就找不回来了。</span>
            <Button
              data-testid="clear-cache-confirm"
              variant="secondary"
              size="sm"
              onClick={() => {
                setConfirming(false);
                void clearLocalCache();
              }}
            >
              确定清除
            </Button>
            <Button
              data-testid="clear-cache-cancel"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              取消
            </Button>
          </div>
        ) : (
          <Button data-testid="clear-cache-button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
            清除本机暂存数据
          </Button>
        )}

        {cacheCleared ? (
          <p data-testid="clear-cache-done" className="text-emerald-700">
            已清除本机暂存数据。当前页面上的这份数据仍在内存里，关闭标签页后不会保留。
          </p>
        ) : null}

        {cacheNote !== null ? (
          <p className="text-amber-700" data-testid="clear-cache-note">
            {cacheNote}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
