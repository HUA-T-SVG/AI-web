import type { CheckPlan, IssueReport } from './schemas';

export type PhaseId = 'profiling' | 'planning' | 'execution' | 'synthesis' | 'review' | 'apply';

export interface Phase {
  id: PhaseId;
  label: string;
  description: string;
  /**
   * 这一步是否会把内容发出去。
   *
   * 界面上要能直接看出来 —— 用户对「科研数据出门」这件事很敏感，
   * 与其写一段说明让他自己判断，不如在每个阶段旁边标出来。
   */
  usesLlm: boolean;
}

export const PHASES: Phase[] = [
  {
    id: 'profiling',
    label: '剖析数据',
    description: '在浏览器内统计行列与各列分布，产出一份不含原始记录的摘要。',
    usesLlm: false,
  },
  {
    id: 'planning',
    label: '制定检查计划',
    description: '把摘要交给大模型，由它决定这份数据该重点查什么。',
    usesLlm: true,
  },
  {
    id: 'execution',
    label: '执行检查',
    description: '在浏览器内运行确定性检查；由大模型决定下一个查哪一项，但数据不出本机。',
    usesLlm: true,
  },
  {
    id: 'synthesis',
    label: '汇总问题',
    description: '把检查结果整理成带依据和处理建议的问题清单。',
    usesLlm: true,
  },
  {
    id: 'review',
    label: '人工确认',
    description: '逐条确认、修改或拒绝每个清洗建议。',
    usesLlm: false,
  },
  {
    id: 'apply',
    label: '执行与留痕',
    description: '按确认结果处理数据，并记录每一步的依据。',
    usesLlm: false,
  },
];

export type PhaseEvent =
  | { type: 'profiled' }
  | { type: 'planned'; plan: CheckPlan }
  | { type: 'rejected' }
  | { type: 'executed'; failedTools?: number }
  | { type: 'synthesized'; report: IssueReport }
  | { type: 'confirmed' }
  | { type: 'failed'; reason: string };

/**
 * 阶段流转。
 *
 * 失败退回的位置是刻意选的 —— 退到重试代价最小的那一级：
 * 规划失败退回剖析（可能摘要本身就不够用）；执行失败退回规划
 * （检查结果还在，不必重跑剖析）；汇总失败退回执行（结果是现成的）。
 *
 * 把这个规则做成纯函数，是为了不启浏览器就能测出「失败能不能回到
 * 正确的地方」—— 这类分支在真实运行里很难复现，靠手动点是测不出来的。
 */
export function nextPhase(current: PhaseId, event: PhaseEvent): PhaseId {
  switch (current) {
    case 'profiling':
      return event.type === 'profiled' ? 'planning' : current;

    case 'planning':
      if (event.type === 'planned') return 'execution';
      // 用户否掉计划就重新规划，而不是带着一份已被否掉的东西继续走
      if (event.type === 'rejected') return 'planning';
      return event.type === 'failed' ? 'profiling' : current;

    case 'execution':
      // 部分工具失败也算执行完成：单个检查失败不该让整份分析出不来
      if (event.type === 'executed') return 'synthesis';
      return event.type === 'failed' ? 'planning' : current;

    case 'synthesis':
      if (event.type === 'synthesized') return 'review';
      return event.type === 'failed' ? 'execution' : current;

    case 'review':
      return event.type === 'confirmed' ? 'apply' : current;

    case 'apply':
      // 终点。清洗与留痕之后没有下一个阶段了（重跑整轮要重新剖析）。
      return current;
  }
}

export function isTerminal(phase: PhaseId): boolean {
  return phase === 'apply';
}

/** 取阶段的中文标签。查不到时原样返回，界面不该因为一个标识就白屏。 */
export function phaseLabel(phase: PhaseId): string {
  return PHASES.find((phase_) => phase_.id === phase)?.label ?? phase;
}
