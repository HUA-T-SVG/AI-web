'use client';

import { useEffect } from 'react';
import { restoreScenarioFromSession } from '@/ui/stores/scenarioStore';

/**
 * 场景选择存在 sessionStorage 里，但**不能在模块初始化时同步读**：
 * `/import` 是预渲染页，服务端渲染时没有场景；客户端若在首帧就带着场景，
 * hydration 的文本与属性会对不上，React 会报错并整树重渲。
 *
 * 所以恢复放到 mount 之后：首帧两边都是「未选场景」，随后再补上。
 */
export function ScenarioHydration() {
  useEffect(() => {
    restoreScenarioFromSession();
  }, []);
  return null;
}
