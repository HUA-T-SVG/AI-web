import { parseFile } from './index';
import type { ParseError, ParseResult } from './types';

export interface WorkerRequest {
  id: string;
  buffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
}

export interface WorkerResponse {
  id: string;
  result: ParseResult | ParseError;
}

/**
 * Worker 全局作用域在 tsconfig 的 dom lib 下被推断为 Window，而 Window.postMessage
 * 的签名要求 targetOrigin 参数。这里显式声明实际用到的那部分接口，避免为了一个
 * 类型去和 lib 配置较劲。
 */
const workerScope = self as unknown as {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ): void;
  postMessage(message: WorkerResponse): void;
};

function reply(id: string, result: ParseResult | ParseError): void {
  workerScope.postMessage({ id, result });
}

workerScope.addEventListener('message', (event) => {
  const { id, buffer, fileName, fileSize } = event.data;

  void parseFile({ buffer, fileName, fileSize })
    .then((result) => reply(id, result))
    .catch((error: unknown) => {
      // parseFile 内部已经消化了可预期的失败，走到这里说明是意料之外的错误。
      // 仍然要回一个结构化结果，否则主线程会永远等下去。
      reply(id, {
        kind: 'corrupt',
        message: `解析时发生意外错误：${error instanceof Error ? error.message : String(error)}`,
      });
    });
});
