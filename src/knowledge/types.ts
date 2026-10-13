/**
 * 领域规则库索引的运行时契约。
 *
 * **字段名以 `knowledge/index/rules.json` 的真实结构为准**，不是照着设计文档想象的
 * —— 那个文件由 `knowledge/tools/build-index.py` 生成，它是这一层的唯一真源。
 * 验证方式：`node -e "console.log(Object.keys(require('./knowledge/index/rules.json')))"`。
 */

/** 规则正文。11 列中与检索无关的列（来源、权威度…）也保留，界面要展示它们。 */
export interface RuleEntry {
  id: string;
  标题: string;
  类别: string;
  触发条件?: string;
  规则内容: string;
  正例?: string;
  反例?: string;
  来源?: string;
  权威度?: string;
  核验状态?: string;
}

/** 索引里的一条：正文 + 构建期算好的向量 + 构建期算好的 2-gram 词频。 */
export interface RuleRecord {
  id: string;
  /** 「通用」总是参与检索；其余按当前学科过滤 */
  学科: string[];
  /** 列名命中它即加权 —— 检索里最强的人工信号 */
  适用字段: string[];
  entry: RuleEntry;
  embedding: number[];
  /** 字符 2-gram → 词频。构建期就算好了，运行时不必重新分词 */
  sparse: Record<string, number>;
}

export interface RuleIndex {
  builtAt: string;
  /** 向量后端名。换后端必须重扫阈值（spec §5.5.4） */
  model: string;
  dim: number;
  rrfK: number;
  topK: number;
  entries: RuleRecord[];
}

export interface RuleHit {
  rule: RuleRecord;
  score: number;
  /** 为什么召回这一条 —— 界面与 Prompt 都要能回答这个问题 */
  reason: string;
}
