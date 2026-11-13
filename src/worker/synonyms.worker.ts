import type { Dataset } from '@/core';
import { embedder } from '@/embedding/instance';
import { runSynonymCheck, type SynonymCheckOutcome } from '@/ui/lib/synonymBridge';

export interface SynonymRequest {
  id: number;
  dataset: Dataset;
}

export type SynonymResponse = { id: number } & (
  { outcome: SynonymCheckOutcome } | { error: string }
);

const scope = self as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<SynonymRequest>) => void) => void;
  postMessage: (response: SynonymResponse) => void;
};

scope.addEventListener('message', async ({ data: { id, dataset } }) => {
  try {
    scope.postMessage({ id, outcome: await runSynonymCheck(dataset, embedder) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
