import type { ChecksStatus } from '@/ui/stores/datasetStore';

/**
 * 看板怎么表述「检出问题」这件事 —— 单独抽成纯函数，为的是它能被确定性地测。
 *
 * **背景**：检查搬进 Worker 之后（Plan 4 Task 8），`issues: []` 有了第二种含义：
 * 「还没跑完」或「跑失败了」。而看板上那句绿色的「这份数据没检出问题」是**结论**，
 * 在检查没跑完时说出口就等于伪造结论 —— 还偏偏是最容易被截图带走的那一页。
 *
 * 这类判断写在 JSX 里就只能靠「看代码相信它」；抽出来之后，三种状态各有一条测试。
 */
export interface ChecksSummaryInput {
  checksStatus: ChecksStatus;
  issueCount: number;
  highCount: number;
}

export interface ChecksSummary {
  /** 「检出问题」那一格显示什么 */
  issueValue: string;
  /** 「高优先级」那一格显示什么 */
  highValue: string;
  /** 检查的结论区：failed 显示告警、pending 显示等待、done 才允许给绿色结论 */
  verdict: 'failed' | 'pending' | 'done';
}

export function summarizeChecks(input: ChecksSummaryInput): ChecksSummary {
  if (input.checksStatus === 'failed') {
    return { issueValue: '未知', highValue: '—', verdict: 'failed' };
  }
  if (input.checksStatus === 'running') {
    return { issueValue: '检查中…', highValue: '—', verdict: 'pending' };
  }
  return {
    issueValue: `${input.issueCount} 条`,
    highValue: `${input.highCount} 条`,
    verdict: 'done',
  };
}
