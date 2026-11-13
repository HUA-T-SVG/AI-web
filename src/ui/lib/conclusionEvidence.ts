import type { Issue } from '@/agent/shared/schemas';
import type { QualityIssue } from '@/core';
import type { RuleHit } from '@/knowledge/types';

export interface RuleEvidence {
  id: string;
  title: string;
  content: string;
  condition?: string;
  source?: string;
  authority?: string;
  verification?: string;
  fields: string[];
  reason: string;
}

export interface ConclusionEvidence {
  check?: CheckEvidence;
  rules: RuleEvidence[];
  invalidCheck: boolean;
  invalidRules: number;
}

type CheckEvidence = QualityIssue & { columnIndex?: number };

/** 只存在当前分析的浏览器内。短编号可以出站，原始行号与取值不能。 */
export function createEvidenceLedger() {
  const runId = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36);
  let nextId = 0;
  const checks = new Map<string, CheckEvidence>();
  const rules = new Map<string, { hit: RuleHit; columns: readonly string[] }>();
  return {
    recordCheck(issue: QualityIssue, columnIndex?: number): string {
      const id = `C-${runId}-${++nextId}`;
      checks.set(id, { ...issue, columnIndex });
      return id;
    },
    recordRule(hit: RuleHit, columns: readonly string[]): string {
      const id = `R-${runId}-${++nextId}`;
      rules.set(id, { hit, columns });
      return id;
    },
    resolve(issue: Issue): ConclusionEvidence {
      const candidate = issue.checkEvidenceId ? checks.get(issue.checkEvidenceId) : undefined;
      const columns = new Set(issue.columns);
      const check = candidate?.checkId === issue.checkId && candidate.checkId !== 'check-failed' &&
        columns.size === new Set(candidate.evidence.columns).size &&
        candidate.evidence.columns.every((column) => columns.has(column)) ? candidate : undefined;
      const matched = new Map<string, RuleEvidence>();
      const fieldKey = (field: string) => field.replace(/\s+/g, '').toLowerCase();
      let invalidRules = 0;
      for (const id of new Set(issue.ruleEvidenceIds ?? [])) {
        const entry = rules.get(id);
        const matchesField = entry?.columns.some((column) => columns.has(column) &&
          (entry.hit.rule.适用字段.length === 0 ||
            entry.hit.rule.适用字段.some((field) => fieldKey(field) === fieldKey(column))));
        if (!entry || (columns.size === 0
          ? entry.columns.length > 0 || entry.hit.rule.适用字段.length > 0 : !matchesField)) {
          invalidRules++;
          continue;
        }
        const { rule, reason } = entry.hit;
        matched.set(rule.id, {
          id: rule.id, title: rule.entry.标题, content: rule.entry.规则内容,
          condition: rule.entry.触发条件, source: rule.entry.来源, authority: rule.entry.权威度,
          verification: rule.entry.核验状态, fields: rule.适用字段, reason,
        });
      }
      return {
        check, rules: [...matched.values()],
        invalidCheck: Boolean(issue.checkEvidenceId && !check), invalidRules,
      };
    },
  };
}

export type EvidenceLedger = ReturnType<typeof createEvidenceLedger>;
