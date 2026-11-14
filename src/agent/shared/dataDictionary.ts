import { z } from 'zod';

export const DICTIONARY_MAX_TEXT_LENGTH = 6000;
export const DICTIONARY_MAX_COLUMNS = 200;
export const DICTIONARY_MAX_CANDIDATES = 20;

export const dictionaryRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(DICTIONARY_MAX_TEXT_LENGTH),
  columns: z.array(z.string().min(1).max(200)).min(1).max(DICTIONARY_MAX_COLUMNS),
});

const source = {
  field: z.string().trim().min(1).max(200).describe('在数据字典原文中出现的字段名，不推断实际列名'),
  quote: z.string().trim().min(1).max(500)
    .describe('逐字引用数据字典中一段连续原文，同时包含字段名和完整约束，不改写、不截去否定词'),
};

export const dictionaryCandidateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...source,
    kind: z.literal('range'),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.strictObject({
    ...source,
    kind: z.literal('allowed'),
    values: z.array(z.string().trim().min(1).max(80)).min(1).max(40)
      .describe('逐字保留完整的允许值列表，不转换带前导零的码值'),
  }),
  z.strictObject({
    ...source,
    kind: z.literal('missing-code'),
    code: z.string().trim().min(1).max(80).describe('缺失占位码的原写法，包括前导零，不能根据异常数值推测'),
  }),
]);

export const dictionaryResponseSchema = z.strictObject({
  candidates: z.array(dictionaryCandidateSchema).max(DICTIONARY_MAX_CANDIDATES),
});

export type DictionaryRequest = z.infer<typeof dictionaryRequestSchema>;
export type DictionaryCandidate = z.infer<typeof dictionaryCandidateSchema>;
export type DictionaryResponse = z.infer<typeof dictionaryResponseSchema>;
