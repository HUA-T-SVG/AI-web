let counter = 0;

/**
 * 生成问题 ID：检查项 + 目标 + 自增序号。
 *
 * 刻意不用随机数 —— 随机数会让测试断言不可预测，而这里只需要
 * 同一次运行内唯一即可。
 */
export function createIssueId(checkId: string, target: string): string {
  counter += 1;
  return `${checkId}:${target}:${counter}`;
}

/** 仅供测试使用 */
export function resetIssueIdCounter(): void {
  counter = 0;
}
