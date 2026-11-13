import type { Dataset } from '@/core';
import type { SynonymCheckOutcome } from '@/ui/lib/synonymBridge';
import type { SynonymRequest, SynonymResponse } from '@/worker/synonyms.worker';
import { runChecksInWorker } from './workerChecks';

const TIMEOUT_MS = 60_000;
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, (result: SynonymResponse) => void>();

function failWorker(instance: Worker, error: string): void {
  if (worker !== instance) return;
  instance.terminate();
  worker = undefined;
  for (const [id, settle] of pending) settle({ id, error });
}

function getWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('../../worker/synonyms.worker.ts', import.meta.url), {
    type: 'module',
  });
  const fail = () => failWorker(instance, '语义归并后台线程未能完成检查');
  instance.addEventListener('error', fail);
  instance.addEventListener('messageerror', fail);
  instance.addEventListener('message', (event: MessageEvent<SynonymResponse>) => {
    if (worker === instance) pending.get(event.data.id)?.(event.data);
  });
  worker = instance;
  return instance;
}

export async function runSynonymCheckInWorker(dataset: Dataset): Promise<SynonymCheckOutcome> {
  try {
    const instance = getWorker();
    const id = ++sequence;
    return await new Promise<SynonymCheckOutcome>((resolve, reject) => {
      const settle = (result: SynonymResponse) => {
        clearTimeout(timer);
        pending.delete(id);
        if ('outcome' in result) resolve(result.outcome);
        else reject(new Error(result.error));
      };
      const timer = setTimeout(() => failWorker(instance, '语义归并后台线程响应超时'), TIMEOUT_MS);
      pending.set(id, settle);
      try {
        instance.postMessage({ id, dataset } satisfies SynonymRequest);
      } catch (error) {
        settle({ id, error: error instanceof Error ? error.message : String(error) });
      }
    });
  } catch (error) {
    const issues = await runChecksInWorker(dataset, { enabled: ['category-synonyms'] });
    return {
      issues,
      degraded: true,
      degradedReason: error instanceof Error ? error.message : String(error),
      embeddedKeyCount: 0,
    };
  }
}
