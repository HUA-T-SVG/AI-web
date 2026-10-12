import { z } from 'zod';
import { listChecks } from '@/core';

/**
 * 检查项标识的合法集合，从 core 动态取。
 *
 * 硬编码成字面量数组也能跑，但 Plan 3 补齐检查项时必然忘记同步，
 * 结果是「模型计划了一项实际不存在的检查」—— 而界面上看不出异常：
 * 计划里有、结果里没有，用户只会以为这项检查没发现问题。
 */
const checkIds = listChecks().map((check) => check.id);

/** 单份计划最多几项检查。 */
const MAX_PLANNED_CHECKS = 8;
/** 问题清单条数上限，避免一次输出几十条把界面和上下文都撑爆。 */
const MAX_ISSUES = 30;

export const checkPlanSchema = z.object({
  /** 模型为什么这么规划。要展示给用户看，所以必须写出来。 */
  reasoning: z.string().min(1),
  checks: z
    .array(
      z.object({
        checkId: z.enum(checkIds),
        /** 限定在哪几列上跑；留空表示全表 */
        columns: z.array(z.string()),
        priority: z.enum(['high', 'medium', 'low']),
      }),
    )
    // 下限 1：空计划等于没分析，却会伪装成「分析完成」
    .min(1)
    // 上限的意义不是省时间，是逼模型做取舍 ——「所有检查都跑一遍」
    // 等于没有规划，而规划正是阶段 2 存在的理由
    .max(MAX_PLANNED_CHECKS),
});

export const cleaningActionSchema = z.object({
  action: z.string().min(1),
  // 默认空对象：「删除重复行」这类动作本来就没有参数，
  // 强迫模型输出 params: {} 只是多一个能让整条链路崩掉的失败点
  params: z.record(z.string(), z.unknown()).default({}),
  /** 为什么建议这么做。用户要据此决定接不接受，不能是空话。 */
  rationale: z.string().min(1),
  /** 受影响的列，界面用来定位到具体数据 */
  columns: z.array(z.string()),
});

export const issueReportSchema = z.object({
  summary: z.string().min(1),
  issues: z
    .array(
      z.object({
        checkId: z.string().min(1),
        severity: z.enum(['high', 'medium', 'low']),
        title: z.string().min(1),
        description: z.string().min(1),
        columns: z.array(z.string()),
        rowIndices: z.array(z.number().int().nonnegative()).optional(),
        // 必填：只说「这里有问题」而不给处理办法，用户看完还是不知道下一步做什么
        suggestion: cleaningActionSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    // 不加下限：数据确实干净时，不该逼模型编出问题来凑数
    .max(MAX_ISSUES),
});

export type CheckPlan = z.infer<typeof checkPlanSchema>;
export type IssueReport = z.infer<typeof issueReportSchema>;
export type CleaningAction = z.infer<typeof cleaningActionSchema>;
