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

/**
 * 六个阶段的定义。
 *
 * 这里是**阶段名字与含义的单一真源**：界面上的步骤条、阶段说明、
 * 「会不会联网」的标记都从这里取。
 *
 * 关于「状态机在哪」：阶段不是靠一份独立的流转函数算出来的，而是从消息流
 * 本身观察出来的（见 src/ui/lib/agentPhase.ts 的 derivePhase）。模型先拿摘要、
 * 再调工具、最后提交结论 —— 这个顺序就编码在消息的 parts 序列里，阶段只是
 * 把它读出来。曾经写过一套 nextPhase 显式流转函数，但它没有任何调用方：
 * 一份只存在于代码里、界面并不使用的状态机，给不了可控性，只会给一种
 * 「我们有状态机」的错觉。所以删掉了，规则留在观察侧。
 */
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
    description: '在浏览器内运行规则检查；由大模型决定下一个查哪一项，但数据不出本机。',
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
