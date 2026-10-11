# 代码导读与 TypeScript 学习笔记

> **这个文件是干什么的**：每完成一个模块，就在下面追加一段讲解。讲清四件事——
> 1. 这块代码**做什么**（业务视角，不是技术视角）
> 2. **为什么**这样写（设计决策，答辩要讲的）
> 3. 里面出现的 **TypeScript 语法**（配本仓库真实例子，从零讲）
> 4. **答辩可能怎么问**，以及怎么答
>
> **怎么用**：不用按顺序读。学到哪块代码就翻到对应模块。看不懂的语法直接问，我会补进对应条目。

## 阅读建议

如果你是第一次接触 TypeScript，**别从源码开始，从测试开始**。

每个 `xxx.test.ts` 就是那个模块的活说明书——测试名字全是中文，看一眼就知道函数在干什么、边界在哪。读测试比读源码快十倍，而且不会迷路。

推荐顺序：

```
1. src/core/types.ts          ← 先认识"数据长什么样"
2. src/core/types.test.ts     ← 看它怎么被验证
3. src/core/numeric.ts        ← 第一个真正干活的模块
4. src/core/stats.ts          ← 数学部分
5. src/core/checks/*.ts       ← 业务逻辑
6. src/core/checks/index.ts   ← 怎么把前面拼起来
```

---

## 模块 0：工程骨架

**文件**：`package.json`、`tsconfig.json`、`next.config.ts`、`vitest.config.ts`、`eslint.config.mjs`、`prettier.config.mjs`

### 这个模块干什么

搭好一个能跑、能测、能构建的空架子。**没有业务逻辑**，只是配置。

### 为什么这样写

| 配置 | 取值 | 理由 |
| --- | --- | --- |
| `strict: true` | 严格模式 | 不用 strict 的 TypeScript 等于没类型 |
| `noUncheckedIndexedAccess: true` | 数组下标访问必检空 | **这个开关救过我们两次**，见下面 |
| `noUnusedLocals` / `noUnusedParameters` | 未使用的变量直接报错 | 防止留下死代码 |
| `moduleResolution: "bundler"` | 现代模块解析 | 配合 Next.js 的打包器 |

### TypeScript 教学点

**① `noUncheckedIndexedAccess` 是什么，为什么值得开**

不开这个开关时，这段代码不会报错：

```ts
const values: string[] = ['a'];
const first = values[0];   // 类型被推断为 string
first.toUpperCase();       // 运行时如果数组是空的，这里就崩了
```

开了之后，`values[0]` 的类型变成 `string | undefined`，逼你处理：

```ts
const first = values[0];
if (first === undefined) return;
first.toUpperCase();       // 到这里 TS 才允许你调用
```

**真实案例**：写完 `rangeRules.ts` 时，类型检查报了这个错——

```
error TS2345: Argument of type 'CellValue | undefined' is not assignable to parameter of type 'CellValue'
```

因为我写了 `column.values[i]`，在这个开关下它可能是 `undefined`。如果没开这个开关，**这行代码会在数据列长短不一时静默出错**，而且不会有任何提示。

**② `??` 和 `||` 的区别**

```ts
const threshold = options.highThreshold ?? 0.5;   // 我们用的
const threshold = options.highThreshold || 0.5;   // 陷阱写法
```

`??` 只在左侧是 `null` 或 `undefined` 时用右侧。`||` 在左侧是**任何假值**时都用右侧——包括 `0`、`''`、`false`。

如果用户把阈值设成 `0`，`||` 会把它替换成 `0.5`，`??` 则会正确保留 `0`。**这是最常见的 TS/JS 坑之一。**

### 答辩可能怎么问

> **问**：你们为什么用 TypeScript 而不是 JavaScript？

**答**：因为我们的核心业务是处理脏数据，数据的形态千变万化。TypeScript 的严格模式特别是 `noUncheckedIndexedAccess`，强制我们显式处理"这个格子可能是空的"。开发过程中它实际拦下了两处会导致静默错误的类型问题。

---

## 模块 1：类型契约

**文件**：`src/core/types.ts`、`src/core/numeric.ts`

### 这个模块干什么

定义整个引擎里"数据长什么样"。**所有模块都依赖它**，所以它最简单、也最重要。

核心就三个概念：

```
CellValue   一个格子里可能是什么      → 字符串 / 数字 / 布尔 / 空
ColumnData  一列                       → 列名 + 一串格子
Dataset     一个数据集                 → 若干列 + 行数
```

### 为什么这样写

**① 为什么缺失用 `null` 表示，而不是空字符串或特殊数字**

科研数据里 `0`（年龄 0 岁？还是缺失？）和 `false`（"否"还是没填？）都是**有效取值**。如果拿它们当缺失标记，会把真实数据抹掉。

所以 `isMissingValue` 里专门写了一句注释钉住这条：

```ts
// 0 和 false 是有效取值，误判为缺失会把真实数据抹掉
expect(isMissingValue(0)).toBe(false);
expect(isMissingValue(false)).toBe(false);
```

**② 为什么单独抽一个 `numeric.ts`**

原本数字解析的逻辑写在两个地方（列画像、类型一致性检查），都含一条"超过 15 位的数字不算数值"的规则。

**同一个规则写在两处，早晚会漂移**——改了一处忘了另一处，两个检查就会对同一个数给出不同判断。所以抽成单一真源。

那条 15 位的规则是干什么的：学号 `12345678901234567890` 如果被当成数值，JavaScript 会丢掉精度（超出安全整数范围），算出来的均值毫无意义。这是实证数据里最常见的一类误判。

### TypeScript 教学点

**③ 联合类型 `|` —— 表示"可能是这几种之一"**

```ts
export type CellValue = string | number | boolean | null;
```

读作："CellValue 是字符串、或数字、或布尔、或空"。这是 TS 最常用的类型写法。

**④ 字面量联合类型 —— 比 enum 更轻的"枚举"**

```ts
export type ColumnType = 'number' | 'category' | 'text' | 'boolean' | 'empty' | 'mixed';
```

不是"任意字符串"，而是**只能是这六个值之一**。写错拼写会立刻报错：

```ts
const t: ColumnType = 'numbers';   // ❌ 报错：Type '"numbers"' is not assignable to type 'ColumnType'
```

**⑤ `interface` 和 `type` 的区别**

```ts
export interface ColumnData {   // 描述"一个对象长什么样"
  name: string;
  values: CellValue[];
}

export type CellValue = ...;    // 给一个类型起别名，或做联合类型
```

经验规则：**描述对象用 `interface`，联合类型/别名用 `type`**。两者在多数场景下可以互换，不用纠结。

**⑥ 可选属性 `?`**

```ts
export interface ColumnProfile {
  numeric?: NumericStats;   // 问号 = 这个字段可能不存在
}
```

用的时候 TS 会提醒你先判断：

```ts
profile.numeric.median        // ❌ 报错：对象可能为 undefined
profile.numeric?.median       // ✅ 可选链，不存在时返回 undefined
```

所以我们代码里到处是 `profile.numeric?.min`——`?.` 的意思是"如果左边是空的，整个表达式就是 undefined，别往下取"。

**⑦ 数组类型 `T[]` 和 `readonly T[]`**

```ts
values: CellValue[]                 // 普通数组，可以改
function meanOf(values: readonly number[]): number   // 只读，函数内部改不了
```

`readonly` 是给调用方的承诺：**我这个函数不会改你传进来的数组**。统计函数全用这个，因为我们只读不算写。

**⑧ 类型谓词 `value is number` —— 一个进阶但很有用的东西**

```ts
function numericStatsOf(values: readonly number[]): NumericStats { ... }

const numbers = present
  .map((value) => parseNumeric(value))
  .filter((value): value is number => value !== null);   // ← 这里
```

`parseNumeric` 返回 `number | null`。`.filter()` 之后，TS 并不知道 `null` 已经被滤掉了，`numbers` 的类型还是 `(number | null)[]`。

`(value): value is number =>` 这句是在告诉 TS："**我保证，这个函数返回 true 的时候，参数一定是 number**"。之后 `numbers` 就被正确推断为 `number[]`，可以直接传给统计函数。

### 答辩可能怎么问

> **问**：你们怎么处理缺失值？为什么不用 -1 或 999 表示？

**答**：因为 `0` 和 `false` 在实证数据里都是有效取值——年龄 0 岁、答题"否"。用特殊数字当缺失标记，会把真实数据当成缺失抹掉。我们用 `null` 表示缺失，并在类型层面钉死"0 和 false 不算缺失"，有专门的测试守着。

> **追问**：那学号这种超长的数字呢？

**答**：我们设了 15 位的上限。超过就不再当数值处理，因为 JavaScript 的安全整数范围有限，20 位学号参与统计会丢精度、算出无意义的均值。这条规则抽在单独一个文件里，两处调用点共用，避免规则漂移。

---

## 模块 2：值规范化

**文件**：`src/core/normalize/index.ts`

### 这个模块干什么

把同一个意思的不同写法**统一成一种**，这样才判断得出"这两个值是不是同一个类别"。

```
'ＭＧ'  →  'MG'      全角转半角
'mg '   →  'mg'      去首尾空白
'mg'    →  'mg'      统一小写（只在用作分组键时）
'本科\u200B' → '本科'  去掉不可见的零宽字符
```

### 为什么这样写

**零宽字符那条是真实痛点**。从网页复制问卷选项时，很容易带进 `U+200B`（零宽空格）这种肉眼看不见的字符。两个值看起来一模一样，但字符串比较不相等，分组就会错位。而且**你根本看不出来问题在哪**——这是最折磨人的一类 bug。

三个函数分开是有意的，因为**大小写是否等价取决于场景**：

| 函数 | 做什么 | 什么时候用 |
| --- | --- | --- |
| `toHalfWidth` | 只做全角转半角 | 需要保留原始大小写时 |
| `normalizeText` | 去不可见字符 + 全角转半角 + 去空白 | 展示、比较 |
| `normalizeKey` | 在 `normalizeText` 基础上再小写 | 分组统计 |

`MG` 和 `mg` 在**单位**场景下是同一个意思，但在**基因名**场景下可能不是。所以底层函数不替你做决定，把大小写归一放在最后一步。

### TypeScript 教学点

**⑨ `for...of` 遍历字符串会按"字符"而不是"字节"**

```ts
for (const ch of input) {
  const code = ch.codePointAt(0);
  ...
}
```

中文、emoji 这类字符在 JS 里长度不止 1。`for...of` 会自动按完整字符遍历，比 `for (let i = 0; ...)` 安全。

**⑩ 正则表达式字面量 `/.../g`**

```ts
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
```

`\u200B` 是字符的 Unicode 码点写法。末尾的 `g` 表示"全局匹配"（找到所有，不是只找第一个）。

**⑪ 类型收窄（narrowing）—— TS 最核心的机制**

```ts
export function normalizeKey(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return normalizeText(value).toLowerCase();   // 到这里 TS 知道它一定是 string
}
```

注意最后一行：经过前面三个 `if` 的排除，TS **自动推断**出 `value` 只剩 `string` 这一种可能，所以可以放心传给 `normalizeText`。

这就是为什么这里没有用 `isMissingValue` 来判空——**它不是类型守卫，TS 无法据此收窄类型**。代码里留了注释说明这个取舍。

### 答辩可能怎么问

> **问**：类别归并为什么不能简单用字符串相等判断？

**答**：因为原始数据里的同一个类别有大量书写变体：全角半角、大小写、前后空格、网页复制带进来的零宽字符。我们做了三层处理——先规范化（这一层解决大部分），再用字面相似度（编辑距离、子串包含），最后才用语义 embedding 处理字面完全不同但意思相同的情况。分层的好处是大部分情况不依赖模型，而且模型不可用时有降级路径。

---

## 模块 3：统计原语

**文件**：`src/core/stats/index.ts`

### 这个模块干什么

提供基础统计计算：分位数、均值、标准差、四分位距、Z 分数、修正 Z 分数。

**它是纯数学，不含业务判断**——业务判断在上层的检查模块里。

### 为什么这样写

**核心设计约定写在文件开头**：

> 空输入与退化输入（全部取值相同、只有一个元素）一律返回有限的 0 或等价边界，**绝不返回 NaN / Infinity**。

原因是这些结果会**直接渲染到界面上**。`NaN` 一路传播下去，最后用户看到的是空白格或者整个页面崩掉。所以在最底层就堵死。

举几个例子：

| 输入 | 普通实现会返回 | 我们返回 | 为什么 |
| --- | --- | --- | --- |
| `stdDevOf([])` | `NaN` | `0` | 空数组的标准差无意义，但界面要显示数字 |
| `stdDevOf([5])` | `0` 或 `NaN` | `0` | 单个值没有离散度 |
| `zScoresOf([5,5,5])` | `NaN`（除以 0） | `[0,0,0]` | 标准差为 0 时无法归一化 |
| `quantile([], 0.5)` | `NaN` | `0` | 同上 |

**修正 Z 分数是什么，为什么需要它**

标准 Z 分数是 `(值 - 均值) / 标准差`。问题是：**一个极端值会把标准差自己也抬高**，结果它反而显得不那么异常了。

举例：`[10, 11, 12, 13, 14, 15, 16, 1000]` 里，1000 是明显的异常值。但算出来它的标准 Z 分数只有 2.65，**没超过常用的 3 倍阈值**——漏报了。

修正 Z 分数改用**中位数**和 **MAD**（中位数绝对偏差）作基准，这两个对极端值不敏感，所以能正确识别：

```
标准 Z 分数：1000 的得分 2.65  → 判为正常 ✗
修正 Z 分数：1000 的得分 332.7 → 判为异常 ✓
```

那个 `0.6745` 常数是正态分布下 MAD 与标准差的换算系数。

**但它也有死角**：如果超过一半的取值相同，MAD 会变成 0，此时修正 Z 全部返回 0（也就是什么都不报）。这是有意选择——**无法判断时宁可不说，也不乱说**。这个限制写进了测试用例。

### TypeScript 教学点

**⑫ `Record<K, V>` —— 描述"键值对表"**

```ts
const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
```

读作："一个对象，键必须是 `Severity` 类型（也就是 high/medium/low），值必须是数字"。

好处是**少一个键 TS 就报错**。如果以后给 `Severity` 加了第四种等级，这里会立刻提示你补上。

**⑬ 数组解构 + 默认值**

```ts
const lower = sorted[lowerIndex] ?? 0;
```

在 `noUncheckedIndexedAccess` 下，`sorted[lowerIndex]` 的类型是 `number | undefined`。`?? 0` 给了个兜底值。

**⑭ `.map()` / `.filter()` 的函数式写法**

```ts
const deviations = values.map((v) => Math.abs(v - median));
```

`map` = 把每个元素变形成另一个；`filter` = 保留满足条件的。这是 JS/TS 里最常用的数据处理写法，和 Python 的列表推导式功能类似：

```python
# Python
deviations = [abs(v - median) for v in values]
```

```ts
// TypeScript
const deviations = values.map((v) => Math.abs(v - median));
```

**⑮ 箭头函数 `(参数) => 返回值`**

```ts
values.sort((a, b) => a - b)
```

`(a, b) => a - b` 就是一个小函数，等价于：

```ts
function (a, b) { return a - b; }
```

箭头函数省略了 `function` 和 `return`（单表达式时可以省）。

### 答辩可能怎么问

> **问**：你们的异常值检测用的什么方法？

**答**：三种方法都实现了——IQR、标准 Z 分数、修正 Z 分数，可以切换。默认用 IQR，因为它对分布形态没有假设。我们发现一个实际问题：**标准 Z 分数在个别极端值场景下会漏报**，因为极端值把标准差自己抬高了。所以额外实现了修正 Z 分数，用中位数和 MAD 作基准。但它也有死角——超过半数取值相同时 MAD 退化为 0，此时会放弃判断而不是乱报，这个行为有测试守着。

---

## 模块 4：列画像

**文件**：`src/core/profile/index.ts`

### 这个模块干什么

对每一列回答四个问题：

1. 这列**是什么类型**（数值 / 分类 / 文本 / 布尔 / 全空 / 混合）
2. 有多少**缺失**
3. 有多少**不同取值**
4. 如果是数值，**分布统计量**是多少

这是整个产品递给 AI 的"结构摘要"的来源——**原始数据不出浏览器，出去的就是这些聚合结果**。

### 为什么这样写

**① 类型推断为什么需要两条规则**

判断一列是不是"分类列"，光看唯一值占比不够。设想：

| 数据 | 唯一值 | 占比 | 只看占比 | 加绝对数量上限 |
| --- | --- | --- | --- | --- |
| `[本科, 硕士, 本科, 硕士]` | 2 | 0.5 | 分类 ✓ | 分类 ✓ |
| 20 条互不相同的备注 | 20 | 1.0 | 文本 ✓ | 文本 ✓ |
| 5 条互不相同的短备注 | 5 | 1.0 | 文本 ✓ | 文本 ✓ |

规则是：**唯一值占比 ≤ 0.5 且唯一值数量 ≤ 20**，两条件同时满足才算分类列。绝对数量上限是为了防止小样本下把自由文本误判成分类。

**② 为什么要单独有个 `detectShape`**

这是审查时发现性能问题后加的。

原本异常值检查会调用 `inferColumnType` 判断"这列是不是数值列"。但 `inferColumnType` 为了区分"分类"和"文本"，**会对整列文本做一遍归一化**——而异常值检查根本不在乎这个结果。

5 万行 × 50 列的数据上，这种无效计算会让剖析耗时翻倍。

`detectShape` 只判断"数值 / 布尔 / 混合 / 其他"，**不碰文本归一化**，让只关心数值的检查提前退出。

改造前后实测：

```
profileDataset   3375 ms  →  1408 ms
runAllChecks     6574 ms  →  3971 ms
```

对应的，性能预算写在类型里的注释里（5 万行 × 50 列 ≤ 3 秒），并有专门的性能回归测试守着。

### TypeScript 教学点

**⑯ `Set` 和 `Map` —— 去重和查表**

```ts
const seen = new Set<string>();     // 自动去重的集合
const buckets = new Map<string, number[]>();   // 键值对，键可以是任意类型
```

`new Set(array).size` 是最常用的去重计数写法。`Map` 比普通对象强的地方是**键可以是任何类型**，而且有 `.size`、`.has()`、`.get()` 这些顺手的方法。

**⑰ 内部接口不用导出**

```ts
interface Classification {   // 注意：没有 export
  type: ColumnType;
  keys: string[];
  uniqueCount: number;
}
```

只在本文件内部用的类型不需要 `export`。**导出得越少，别人越难误用。**

**⑱ 返回多值的两种写法**

```ts
// 写法一：返回一个对象（我们现在用的）
function classify(column: ColumnData): Classification { ... }

// 写法二：返回元组
function split(a: string): [string, string] { return a.split(':'); }
```

对象写法可读性更好，元组适合固定两个值且调用方很短的情况。

### 答辩可能怎么问

> **问**：你们怎么判断一列是什么类型？

**答**：分两层。先做"形态判断"——全是数值就是数值列，全是布尔就是布尔列，混杂就是混合列，这三种不涉及文本处理。只有都不是的时候，才会做文本归一化，然后按"唯一值占比 ≤ 0.5 且唯一值数量 ≤ 20"判定是分类列还是自由文本列。这样把昂贵的文本归一化限制在真正需要的列上——这是性能优化后重构的结果，5 万 × 50 列的数据上，剖析从 3.4 秒降到 1.4 秒。

---

## 模块 5：检查项

**文件**：`src/core/checks/` 下的 `missing.ts`、`duplicates.ts`、`typeConsistency.ts`、`outliers.ts`、`rangeRules.ts`、`columnNames.ts`

### 这个模块干什么

这是**业务逻辑所在的地方**。每个文件是一个独立的检查，输入数据集，输出发现的问题。

六个检查：

| 检查 | 找什么 | 严重度 |
| --- | --- | --- |
| `columnNames` | 表头重名 | high |
| `missing` | 缺失率过高 | high / medium |
| `duplicates` | 完全重复的行、主键重复 | medium / high |
| `typeConsistency` | 数值列混进文本 | medium |
| `outliers` | 数值异常值 | medium |
| `rangeRules` | 超出合理值域（如年龄 999） | high |

**它们的输出结构是统一的**，这叫 `QualityIssue`：

```ts
{
  checkId: 'missing',              // 哪个检查发现的
  severity: 'high',                // 多严重
  title: '「年龄」存在缺失值',       // 给人看的标题
  description: '...',              // 详细说明
  evidence: { ... },               // 证据：哪些行、什么统计量
  suggestion: { ... },             // 建议怎么处理 + 为什么
  confidence: 1,                   // 置信度
}
```

**证据和建议是分开的，这个设计很关键**——它对应产品里"人在环路"那一步：用户看到问题、看到证据，然后**自己决定**接不接受建议。AI 不直接改数据。

### 为什么这样写

**① 为什么每个检查是独立文件、纯函数**

纯函数 = 同样的输入永远给同样的输出，不改外部状态。好处：

- 可以单独测试（121 个测试里大部分是这些）
- 一个检查崩了不影响别人（调度器会捕获）
- 未来 MCP Server 能复用同一份代码

**② 建议里必须写"为什么"**

```ts
rationale: '先判断缺失机制（完全随机 / 随机 / 非随机）再决定插补还是剔除，直接插补可能引入偏差。'
```

不是"建议删除"，而是"建议删除，因为……"。科研场景里，**用户需要的是理由，不是指令**。

**③ 严重度分级不是装饰**

`high` 和 `medium` 会决定界面上的排序和视觉强调，也会影响用户先处理哪个。所以分级的依据要站得住：

- 全列缺失 → `high`（这列完全没用）
- 缺失率 30% → `medium`（还能用，但要小心）
- 值域越界（年龄 999）→ `high`（几乎肯定是错误）

### TypeScript 教学点

**⑲ `Promise` 无关的同步代码为什么简短**

这些检查全是同步函数——输入数据，直接算，返回结果。**没有异步、没有 IO**，所以代码读起来就是一条直线。这是刻意的：把复杂度留在数据本身，而不是代码结构上。

**⑳ 可选参数与默认值**

```ts
export function checkMissing(dataset: Dataset, options: MissingOptions = {}): QualityIssue[] {
  const highThreshold = options.highThreshold ?? 0.5;
```

`options: MissingOptions = {}` 的意思是"这个参数可以不传，不传时默认是空对象"。然后 `??` 给每个字段兜底。

**㉑ 接口定义"选项"的形状**

```ts
export interface MissingOptions {
  highThreshold?: number;   // 可选
  lowThreshold?: number;
}
```

调用时可以只传一个：

```ts
checkMissing(data, { highThreshold: 0.8 })   // lowThreshold 用默认值
```

**㉒ 字符串模板 `` `${}` ``**

```ts
title: `「${column.name}」存在缺失值`,
```

和 Python 的 f-string 一样：

```python
title = f'「{column.name}」存在缺失值'
```

### 答辩可能怎么问

> **问**：如果 AI 建议把"男/女"合并了怎么办？

**答**：三层防护。第一层，我们的类别归并是**分层策略**——先做规范化（全角、大小写、空白）和字面相似度，语义 embedding 只处理字面完全不同但意思相同的情况，候选对数量已经被大幅压缩。第二层，只有当**多个信号方向一致**时才建议归并，而且对数值型、布尔型、长度极短的取值设了"反义护栏"，不进入语义流程。第三层，**所有归并建议都必须用户逐条确认才会执行**，AI 不直接改数据。而且我们在评测集上以 Precision 优先调阈值，目标是 0.95，宁可漏报也不误报。

---

## 模块 6：调度器与包出口

**文件**：`src/core/checks/index.ts`、`src/core/index.ts`、`src/core/checks/id.ts`

### 这个模块干什么

把六个独立检查拼成一个可调用的整体 `runAllChecks()`，处理失败、排序、并对外暴露整个包的入口。

### 为什么这样写

**① 失败隔离：单个检查崩了不能让整份报告出不来**

数据里总有意料之外的形态。如果缺失检查因为某种奇怪数据崩了，不该导致重复检查的结果也丢了。

所以每个检查包在 `try/catch` 里。

**② 但"崩了"必须让用户看见**

这是**独立审查抓出来的问题**。最初的版本是崩了就 `console.error` 然后继续——结果是：

> **检查崩掉** 和 **检查没发现问题** 在返回值上完全一样。

用户会看到一份"全部合格"的报告，而实际上有一项根本没跑。对数据质量工具来说这是危险的失效模式。

改法是：失败时产出一条 `checkId: 'check-failed'` 的问题，明明白白告诉用户"这项没跑成"。

**③ 未知的检查标识直接抛错**

```ts
runAllChecks(data, { enabled: ['typo'] })   // 抛错，不是返回空数组
```

同样理由：工具分发层（未来 AI 调用工具）如果拼错了检查名，静默返回空数组会看起来像"数据很干净"。抛错能让问题立刻暴露。

**④ 为什么重名列检查排在第一个**

```ts
// 重名列放最前：它会让其余按列名定位的检查失去意义
{ id: 'duplicate-column-names', run: ... },
```

CSV 表头重名时，所有"按列名找列"的逻辑都会出错。这是独立审查抓到的 **Critical 问题**：

> 两行的真实取值分别是 `(1,2)` 和 `(1,3)`，并不重复。但按列名解析时两列都被解析成第一列，签名相同 → 误报为"完全重复的记录" → **并建议删除其中一行**。

用户一旦接受就是数据丢失。修法是全部改成按列引用（下标）定位，并把重名列本身单独报为问题。

**⑤ 排序：high 在前**

```ts
const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
```

用户先看最严重的。这是产品判断，不是技术判断。

### TypeScript 教学点

**㉓ `export * from` —— 统一出口**

```ts
// src/core/index.ts
export * from './types';
export * from './normalize';
export * from './stats';
```

把散在各子目录的东西**汇总到一个入口**。外面使用时只需要：

```ts
import { runAllChecks, profileDataset } from '@/core';
```

而不是记住每个东西在哪个文件里。这个文件的注释里写清了为什么 core 必须平台无关——它是浏览器和 MCP Server 共用的唯一入口。

**㉔ `export { A, B }` 与 `export type { T }`**

```ts
export { checkMissing, checkDuplicates, ... };   // 导出函数（运行时存在）
export type { MissingOptions, RangeRule };        // 只导出类型（编译后消失）
```

区分是因为**类型在编译后不存在**。有些打包工具需要知道这一点，用 `export type` 能避免把它们错误地打进产物。

**㉕ 函数类型作为参数**

```ts
export interface CheckDefinition {
  id: string;
  run: (dataset: Dataset) => QualityIssue[];
}
```

`run` 的类型是"一个函数，接受 Dataset，返回 QualityIssue 数组"。这样调度器就可以把检查项当成数据来遍历。

这个设计后来还派上用场——审查指出降级路径**零测试覆盖**，因为没有任何检查会抛错。有了这个接口，测试里可以**注入一个必然抛错的检查**来验证降级逻辑。

**㉖ `unknown` 而不是 `any`**

```ts
function checkFailedIssue(checkId: string, error: unknown): QualityIssue {
  ...
  reason: error instanceof Error ? error.message : String(error),
}
```

`any` 会关闭所有类型检查；`unknown` 是"我不知道它是什么，**用之前必须先判断**"。这是更安全的写法——TS 会强制你先做类型判断才能访问属性。

### 答辩可能怎么问

> **问**：你们怎么保证系统的健壮性？

**答**：三层。第一，每个检查是独立的纯函数，单个检查抛错不会影响其余检查，而且失败会产出明确的诊断问题——这一点是独立审查发现并修正的，最初版本只打日志，导致"检查崩了"和"没问题"在结果上无法区分。第二，所有统计函数在空输入和退化输入下都返回有限值而不是 NaN，避免错误向上传播。第三，未知的检查标识直接抛错而不是静默忽略，防止工具调用层的一个拼写错误看起来像"数据很干净"。

---

## 待补充的模块

后续每完成一个模块就追加到这里。

| 模块 | 计划 | 状态 |
| --- | --- | --- |
| 文件解析（CSV/Excel + Web Worker） | Plan 1b | ⏳ 待写 |
| 状态管理与上传界面 | Plan 1b | ⏳ 待写 |
| 数据预览表格与问题清单 | Plan 1b | ⏳ 待写 |
| Agent 六阶段工作流 | Plan 2 | ⏳ 待写 |
| AI SDK 集成与流式对话 | Plan 2 | ⏳ 待写 |
| 端侧 embedding 与类别归并 | Plan 3 | ⏳ 待写 |
| RAG 混合检索 | Plan 3 | ⏳ 待写 |
| 清洗执行与 pandas 脚本生成 | Plan 3 | ⏳ 待写 |
| 评测体系 | Plan 4 | ⏳ 待写 |
| MCP Server | Plan 5 | ⏳ 待写 |

---

## 附：TypeScript 速查（对照 Python）

| 概念 | Python | TypeScript |
| --- | --- | --- |
| 类型标注 | `def f(x: int) -> str:` | `function f(x: number): string` |
| 联合类型 | `int \| None` | `number \| null` |
| 可选属性 | `dataclass` 默认值 | `field?: number` |
| 字典 | `dict[str, int]` | `Record<string, number>` |
| 列表推导 | `[f(x) for x in xs]` | `xs.map(f)` |
| 过滤 | `[x for x in xs if p(x)]` | `xs.filter(p)` |
| 求和 | `sum(xs)` | `xs.reduce((a, b) => a + b, 0)` |
| 字符串插值 | `f'{name} 缺失'` | `` `${name} 缺失` `` |
| 空值合并 | `x if x is not None else 0` | `x ?? 0` |
| 空安全访问 | `x.y if x else None` | `x?.y` |
| 接口/协议 | `Protocol` | `interface` |
| 枚举 | `Enum` | 字面量联合 `'a' \| 'b'` |
