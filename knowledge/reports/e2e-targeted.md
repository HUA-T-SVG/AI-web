# 相关浏览器回归 37 项（2026-11-15）

> 用途：支撑技术文档 §7.1「相关浏览器回归 **37 项**通过」这个数字。
> 产出：2026-11-15，在最新 HEAD 上跑完完整浏览器套件后整理。
> 复跑命令见下；数字随用例增减会漂移，改动测试后**同步更新本文件、技术文档 §7.1 与
> `scripts/check-doc-facts.mjs` 的断言**，否则 `pnpm check:doc` 会红。

## 一、口径：哪 37 项

「相关」指与 2026-11-13～11-15 这批改动（数据字典、结论核对、口径对比、处理决定、
后台归并、计划冻结、RAG 对照）直接相关的 4 个 spec：

| spec | 用例数 | 覆盖什么 |
| --- | ---: | --- |
| `tests/e2e/data-dictionary.spec.ts` | 3 | 有效码确认后保留依据且不提供转缺失试算；数据字典只发送字典与列名、范围检查与缺失码试算；假原文/冲突规则被拒绝、替换范围需明确确认 |
| `tests/e2e/batch-policy.spec.ts` | 2 | 待核对会暂停、跳过后同字段仍不可清洗；本批已确认缺考码只开放本地试算，用户另行选择与执行才改数据 |
| `tests/e2e/analysis.spec.ts` | 29 | 证据可核对、口径先试算再执行、报告保留选择与理由；审阅状态、版本失效、导出脚本、窄屏操作区等 |
| `tests/e2e/mobile-a11y.spec.ts` | 3 | 窄屏点击区不小于 44px；长描述展开后能看到全文与证据 |
| **合计** | **37** | 另有 1 个 `setup` 预热用例（warmup）不计入 |

统计口径（只列用例、不执行）：

```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'; $env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
pnpm exec playwright test tests/e2e/data-dictionary.spec.ts tests/e2e/batch-policy.spec.ts `
  tests/e2e/analysis.spec.ts tests/e2e/mobile-a11y.spec.ts --list
```

## 二、执行结果

2026-11-15 在最新 HEAD 上跑**全量**浏览器套件（不是只跑这 37 项）：

```powershell
$env:TEMP='D:\tmp'; $env:TMP='D:\tmp'; $env:PLAYWRIGHT_BROWSERS_PATH='D:\ms-playwright'
pnpm test:e2e
```

结果：**103 passed / 1 skipped（约 3.9 分钟）**。上表 37 项全部通过（无失败、无跳过）；
跳过的那 1 项是 `real-api.spec.ts` 的真实模型用例（默认跳过，需 `REAL_API=1`）。

- 运行环境：Windows、Playwright Chromium、`pnpm dev` 临时服务、端侧语义模型下载默认被掐断
  （按产品降级路径运行，避免测试依赖外网）。
- 全量套件共 104 个用例（含 1 个预热）；除这 37 项外的其余用例属于其他模块的回归，
  不在本报告的「相关」口径内。

## 三、这一层**没有**覆盖的

- **真实模型 happy path**：浏览器用例全部用 mock/拦截，真实模型路径由手工冒烟与
  `real-api.spec.ts`（需 `REAL_API=1`）承担，不进日常门禁。
- **跨浏览器**：只跑 Chromium；WebKit/Firefox 未纳入。
- 数字会随用例增减变化：本报告记录的是 2026-11-15 的口径。
