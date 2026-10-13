# 知识库构建报告

> 由 `knowledge/tools/build-index.py` 生成。真源是 `knowledge/知识库模板.xlsx`。

## 一、结论

| 项 | 值 |
| --- | --- |
| 条目总数 | 113 |
| 错误 | 0 |
| 警告 | 25 |
| 待核对条目 | 113 |
| 疑似近重复对 | 2（阈值 0.3，实际最大 0.3759） |
| 向量后端 | char-ngram-hash-512-v1（离线降级后端，非语义模型；换语义模型：--embedder bge） |
| 构建时间 | 2026-10-13T01:46:15Z |
| 自召回 Hit@5 | 0.9823 |
| 自召回 MRR | 0.8617 |

## 二、分布

| 维度 | 分布 |
| --- | --- |
| 类别 | 数据标准 47　口径规则 31　清洗案例 35 |
| 学科 | 通用 92　数据科学与大数据技术 21 |
| 权威度 | 行业 54　团队经验 57　国标 2 |

## 三、错误

（无）

## 四、警告

- （跨行） · 适用字段 · 别名「degree」被同属「数据标准」的 2 条规则声明：general-education-vs-degree（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「grade」被同属「数据标准」的 2 条规则声明：general-ordinal-order-lost（数据标准）、ds-grade-marker-special（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「key」被同属「清洗案例」的 2 条规则声明：general-case-cartesian-join（清洗案例）、general-case-join-key-type-mismatch（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「name」被同属「清洗案例」的 2 条规则声明：general-case-same-name-not-same-person（清洗案例）、general-case-duplicate-by-spelling（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「region」被同属「数据标准」的 2 条规则声明：general-na-as-real-value（数据标准）、general-gb-address-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「remark」被同属「数据标准」的 4 条规则声明：general-missing-literal（数据标准）、general-newline-in-cell（数据标准）、general-column-name-duplicate（数据标准）、ds-transcript-revision-flag（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「其他」被同属「数据标准」的 3 条规则声明：general-category-other-explosion（数据标准）、general-newline-in-cell（数据标准）、general-column-name-duplicate（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「受教育程度」被同属「数据标准」的 3 条规则声明：general-education-vs-degree（数据标准）、general-enrolled-status（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「地区」被同属「数据标准」的 2 条规则声明：general-na-as-real-value（数据标准）、general-gb-address-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「增幅」被同属「口径规则」的 2 条规则声明：general-percentage-points（口径规则）、general-yoy-vs-mom（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「备注」被同属「数据标准」的 4 条规则声明：general-missing-literal（数据标准）、general-category-other-explosion（数据标准）、general-newline-in-cell（数据标准）、general-column-name-duplicate（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「姓名」被同属「清洗案例」的 2 条规则声明：general-case-same-name-not-same-person（清洗案例）、general-case-duplicate-by-spelling（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「差额」被同属「数据标准」的 2 条规则声明：general-accounting-negative（数据标准）、ds-missing-sentinel-in-model（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「年龄段」被同属「数据标准」的 2 条规则声明：general-interval-text（数据标准）、general-ordinal-order-lost（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「得分」被同属「口径规则」的 2 条规则声明：general-likert-range（口径规则）、general-ceiling-effect（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「批次」被同属「清洗案例」的 2 条规则声明：ds-case-repeat-measurement-id（清洗案例）、ds-case-lab-timestamp-batch（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「文化程度」被同属「数据标准」的 2 条规则声明：general-enrolled-status（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「最高学历」被同属「数据标准」的 2 条规则声明：general-education-vs-degree（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「盈亏」被同属「数据标准」的 2 条规则声明：general-accounting-negative（数据标准）、ds-missing-sentinel-in-model（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「省份」被同属「数据标准」的 2 条规则声明：general-na-as-real-value（数据标准）、general-gb-address-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「说明」被同属「数据标准」的 3 条规则声明：general-category-other-explosion（数据标准）、general-newline-in-cell（数据标准）、general-column-name-duplicate（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「身高」被同属「数据标准」的 2 条规则声明：general-unit-mixed（数据标准）、general-unit-in-header（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「量表」被同属「口径规则」的 3 条规则声明：general-likert-range（口径规则）、general-ceiling-effect（口径规则）、general-scale-interval-not-equal（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「题项」被同属「口径规则」的 2 条规则声明：general-likert-range（口径规则）、general-scale-interval-not-equal（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 另有 49 个别名被跨类别的多条规则共用（amount、count、date、id、percent、rate、score、time、专业、主键、人数、分组、创建时间、剂量、区间、单位、占比、合计、地址、增减、学历、学号、工号、年月日、性别、总评成绩、成绩、收入、数量、日期、时间、机构、样本号、档次、比例、民族、满意度、率、电话、百分比、等级、编号、行政区划、距离、身份证、重量、金额、长度、频次）。这是约定的分工 —— 标准讲取值规范、口径讲怎么算、案例讲踩过的坑，同一字段由三处分别覆盖是对的。仅在其内容确实重复时才需合并

## 五、待核对清单

这些条目 `核验状态 = 待核对`。答辩要能逐条追溯出处，请对照原文核对后改成「已核对」。

| id | 标题 | 来源 |
| --- | --- | --- |
| `general-missing-negative-code` | 负数编码表示未回答 | 国内社会科学调查数据的常见约定；具体码表待按数据集说明文档核对 |
| `general-missing-sentinel` | 哨兵值当作缺失 | 调查数据处理的通用约定 |
| `general-missing-literal` | 文字形式的缺失标记 | 数据清洗通用约定 |
| `general-date-ambiguous` | 日期格式存在多义 | 日期解析的通用问题 |
| `general-date-excel-serial` | Excel 序列号被当成数值 | Excel 数据交换的已知行为 |
| `general-unit-mixed` | 同一列混用单位 | 科研数据整理的常见问题 |
| `general-gender-code` | 性别字段的多种写法 | 数据清洗通用约定 |
| `general-excel-merged-cells` | Excel 合并单元格只留左上角值 | Excel 数据交换的已知行为 |
| `general-multi-header-rows` | 多级表头被读成数据行 | 数据清洗通用约定 |
| `general-footer-summary-rows` | 表尾合计行混在数据里 | Excel 数据交换的已知行为 |
| `general-boolean-variants` | 布尔列的多种写法 | 数据清洗通用约定 |
| `general-interval-text` | 区间型取值是定序类别不是数值 | 调查数据处理的通用约定 |
| `general-percent-scale-mixed` | 比例与百分数两种量纲混用 | 统计分析通用口径 |
| `general-category-other-explosion` | 其他与自由填写列导致类别爆炸 | 问卷数据整理的常见问题 |
| `general-scientific-notation` | 长数字被转成科学计数法 | Excel 与 CSV 数据交换的已知行为 |
| `general-fullwidth-comma-csv` | 全角标点导致分隔错位 | CSV 格式的已知解析行为 |
| `general-newline-in-cell` | 单元格内换行符破坏行结构 | CSV 格式的已知解析行为 |
| `general-formula-cell-value` | 公式列读到的是公式文本或过期缓存 | Excel 数据交换的已知行为 |
| `general-encoding-mojibake` | 中文编码错配导致取值碎裂 | 中文文本处理的通用问题 |
| `general-column-name-bom` | 表头带字节序标记导致列名对不上 | CSV 与编码处理的已知行为 |
| `general-column-name-duplicate` | 表头有重复列名 | 数据清洗通用约定 |
| `general-column-name-whitespace` | 列名前后有空白或换行 | 中文数据录入的常见问题 |
| `general-thousand-separator-number` | 数值列带千分位分隔符 | Excel 与 CSV 数据交换的已知行为 |
| `general-accounting-negative` | 负数用括号或尾部负号表示 | 报表数据交换的已知行为 |
| `general-na-as-real-value` | NA 可能是真实取值而不是缺失 | 数据清洗通用约定 |
| `general-skip-logic-missing` | 跳转题造成的结构性缺失 | 问卷数据整理的常见问题 |
| `general-excel-1904-datesystem` | 日期基准不同导致日期整体偏移 | Excel 数据交换的已知行为 |
| `general-id-checksum` | 身份证号有校验位且有两代长度 | 身份信息字段的通用校验约定（具体校验算法待团队对照权威口径） |
| `general-address-levels-mixed` | 地址列的行政区划层级不齐 | 中文地址数据处理的常见问题 |
| `general-education-vs-degree` | 学历与学位是两个不同字段 | 教育统计的通用口径（具体代码待团队对照现行标准原文） |
| `general-enrolled-status` | 在读与已毕业必须分开 | 教育统计的通用口径 |
| `general-org-name-variants` | 机构名称的全称与简称混用 | 中文机构名称处理的常见问题 |
| `general-unit-in-header` | 单位写在表头而不是取值里 | 科研数据整理的常见问题 |
| `general-absolute-vs-relative` | 绝对数与相对数放在同一列 | 统计报表的通用口径 |
| `general-ordinal-order-lost` | 有序分类的排序被字典序打乱 | 统计学基本口径 |
| `general-multi-select-in-single` | 单选题列里出现多选答案 | 问卷数据整理的常见问题 |
| `general-weight-column-detected` | 抽样权重列被当成普通变量 | 抽样调查的通用口径 |
| `general-timestamp-precision` | 时间戳精度不一致 | 日期时间处理的常见问题 |
| `general-gb-address-code` | 行政区划代码逐年调整 | 行政区划代码国家标准（GB/T 2260；具体码值待团队核对原文） |
| `general-gb-education-code` | 学历与专业代码有新旧版 | 学历与学科专业代码国家标准（GB/T 4658 等；具体版本与码值待团队核对原文） |
| `general-gb-ethnic-code` | 民族编码与自由填写 | 民族编码相关国家标准（具体标准号与码值待团队核对原文） |
| `ds-missing-sentinel-in-model` | 哨兵值与真实负值混用 | 数据清洗通用约定 |
| `ds-label-positive-class` | 二值字段的方向必须写明 | 数据清洗通用约定 |
| `ds-student-status-timeline` | 学籍状态是时间序列而非单一取值 | 教育统计的通用口径 |
| `ds-term-year-encoding` | 学年与学期编码跨系统不统一 | 教育统计的通用口径 |
| `ds-grade-marker-special` | 成绩列里的非数值特殊标记 | 教育统计的通用口径 |
| `ds-transcript-revision-flag` | 重修与补考后的成绩替换规则 | 教育统计的通用口径 |
| `general-missing-mechanism` | 区分缺失的三种机制 | 缺失数据处理的通用口径 |
| `general-likert-range` | 李克特量表的常见取值 | 心理测量学通用口径 |
| `general-ceiling-effect` | 量表分的天花板与地板效应 | 心理测量学通用口径 |
| `general-fullwidth` | 中文数据的全角与隐形字符 | 中文文本处理的通用问题 |
| `general-measurement-scales` | 测量尺度决定能算什么 | 统计学基本口径 |
| `general-identifier-not-variable` | 标识列不参与统计 | 统计学基本口径 |
| `general-missing-rate-no-threshold` | 缺失率没有通用阈值 | 缺失数据处理的通用口径 |
| `general-mean-imputation-bias` | 均值填补会压缩方差 | 缺失数据处理的通用口径 |
| `general-outlier-not-error` | 异常值不等于错误值 | 统计数据清洗的通用口径 |
| `general-rate-not-average-of-rates` | 汇总行的比率不能取平均 | 统计学基本口径 |
| `general-small-n-unstable` | 小样本分组的比率不可靠 | 统计推断的通用口径 |
| `general-percentage-sum-not-100` | 百分比之和不等于 100 的成因 | 问卷数据整理的常见问题 |
| `general-composition-vs-rate` | 构成比不能当率用 | 统计指标口径的通用约定 |
| `general-percentage-points` | 百分点与百分比不是一回事 | 统计指标口径的通用约定 |
| `general-age-standardization` | 年龄结构不同时分组率不可直比 | 统计指标口径的通用约定 |
| `general-nominal-vs-real-amount` | 跨年比较金额要区分名义与实际 | 统计指标口径的通用约定 |
| `general-period-vs-point` | 时期指标与时点指标不能相加 | 统计指标口径的通用约定 |
| `general-yoy-vs-mom` | 同比增长与环比增长不可混用 | 统计指标口径的通用约定 |
| `general-dedupe-scope` | 去重前必须明确唯一键 | 数据清洗通用口径 |
| `general-ranking-ties` | 排名遇到并列值要说明规则 | 数据呈现的通用口径 |
| `general-equal-vs-quantile-bins` | 等距分组与等频分组含义不同 | 统计分组的通用口径 |
| `general-small-cell-count` | 交叉表的小格频数不可解读 | 统计报表的通用口径 |
| `general-zero-vs-absent-event` | 计数为 0 不等于没有该记录 | 计数数据处理的通用口径 |
| `general-scale-interval-not-equal` | 定序量表的间距不能假设相等 | 测量学与统计的通用口径 |
| `general-coverage-rate-denominator` | 覆盖率类指标的分母要对齐 | 统计指标口径的通用约定 |
| `general-panel-unbalanced` | 面板数据不是每个对象都有每一期 | 面板数据处理的通用口径 |
| `ds-float-accumulation` | 大规模浮点求和的累积误差 | 数值计算的通用约定 |
| `ds-gpa-scale-caliber` | 绩点换算口径必须声明 | 统计分析通用口径 |
| `ds-credit-accounting-caliber` | 学分统计是否含重修与免修 | 教育统计的通用口径 |
| `ds-enrollment-base-caliber` | 在校生数的时点与分母口径 | 教育统计的通用口径 |
| `ds-grade-curve-rounding` | 成绩核算的进位与截断口径 | 统计报表的通用口径 |
| `general-case-leading-zero-lost` | 前导零已丢失的补救 | Excel 与 CSV 数据交换的已知行为（标识列被读成数字时丢失前导零） |
| `general-case-multiselect` | 多选题被拆成多个 0/1 列 | 问卷数据导出的常见形式（多选题被拆成一组 0/1 列） |
| `general-case-zero-variance` | 零方差列未必该删 | 统计数据清洗的通用口径 |
| `general-case-column-rename-across-waves` | 多轮数据的列名改过或含义变了 | 纵向数据合并的常见问题 |
| `general-case-copy-paste-offset` | 复制粘贴错位导致整列偏移 | 数据整理的常见问题 |
| `general-case-hidden-rows-dropped` | 隐藏行与筛选状态下的复制 | Excel 数据交换的已知行为 |
| `general-case-same-name-not-same-person` | 同名不代表同一个人 | 跨表匹配的常见问题 |
| `general-case-batch-sheets-unequal-columns` | 同表分批导出各 sheet 列不一致 | 数据整理的常见问题 |
| `general-case-overlapping-sources` | 两份来源有重叠样本 | 多来源数据合并的常见问题 |
| `general-case-date-column-half-text` | 日期列一半是文本一半是日期值 | 日期解析的通用问题 |
| `general-case-codebook-version-mismatch` | 码表版本与数据不匹配 | 编码标准存在版本差异这一已知事实（具体标准号与码值待团队对照原文） |
| `general-case-cartesian-join` | 合并产生笛卡尔积导致行数暴增 | 跨表合并的常见问题 |
| `general-case-join-key-type-mismatch` | 合并键两侧类型不一致 | 跨表匹配的常见问题 |
| `general-case-vlookup-approximate` | 近似匹配导致错行对齐 | Excel 数据交换的已知行为 |
| `general-case-merge-missing-jump` | 合并后缺失率骤增 | 跨表合并的常见问题 |
| `general-case-unit-conversion-direction` | 单位换算方向搞反 | 科研数据整理的常见问题 |
| `general-case-sample-size-unexplained` | 清洗前后样本量对不上 | 数据处理留痕的通用要求 |
| `general-case-file-version-chaos` | 中间文件版本混乱 | 科研数据管理的常见问题 |
| `general-case-manual-fix-no-record` | 手工改过的单元格没有留痕 | 科研数据管理的常见问题 |
| `general-case-duplicate-by-spelling` | 同一实体因写法不同未被识别为重复 | 跨表匹配的常见问题 |
| `general-case-delimiter-not-comma` | 分隔符不是逗号 | CSV 格式的已知解析行为 |
| `general-case-trailing-delimiter` | 行尾多余分隔符造出空列 | CSV 格式的已知解析行为 |
| `general-case-formula-range-shift` | 公式填充范围错位 | Excel 数据交换的已知行为 |
| `general-case-multi-source-unit-different` | 两个来源同一字段用了不同单位 | 多来源数据合并的常见问题 |
| `general-case-filter-then-stats` | 筛选状态下做的统计掩盖了整体 | Excel 数据交换的已知行为 |
| `ds-case-partition-key-format` | 分区键格式不一致导致漏读 | 大数据工程实践的常见问题 |
| `ds-case-row-order-not-guaranteed` | 分布式处理的输出顺序不保证 | 大数据工程实践的常见问题 |
| `ds-case-convenience-sampling` | 便利抽样造成的选择偏差 | 抽样调查的通用口径 |
| `ds-case-log-timezone` | 日志时间戳的时区不统一 | 大数据工程实践的常见问题 |
| `ds-case-nested-null-forms` | 嵌套结构里的空值形态不一 | 半结构化数据处理的常见问题 |
| `ds-case-upstream-schema-change` | 上游改结构导致下游静默错位 | 数据管道的常见问题 |
| `ds-case-course-code-revision` | 课程号跨年改版导致同名不同号 | 数据管道的常见问题 |
| `ds-case-instrument-range` | 实验数据超出仪器量程的取值 | 测量学与统计的通用口径 |
| `ds-case-repeat-measurement-id` | 重复测量的编号与批次丢失 | 测量学与统计的通用口径 |
| `ds-case-lab-timestamp-batch` | 实验记录时间与批次字段不一致 | 数据处理留痕的通用要求 |

## 六、入库质量分（升序，先看最后几行）

扣分项写给团队看：改哪里能把分提上去。权重定义见 `build-index.py` 的 `QUALITY_ITEMS`。

| 分数 | id | 标题 | 未得分项 |
| --- | --- | --- | --- |
| 90 | `ds-case-convenience-sampling` | 便利抽样造成的选择偏差 | 核验状态已核对 |
| 90 | `ds-case-course-code-revision` | 课程号跨年改版导致同名不同号 | 核验状态已核对 |
| 90 | `ds-case-instrument-range` | 实验数据超出仪器量程的取值 | 核验状态已核对 |
| 90 | `ds-case-lab-timestamp-batch` | 实验记录时间与批次字段不一致 | 核验状态已核对 |
| 90 | `ds-case-log-timezone` | 日志时间戳的时区不统一 | 核验状态已核对 |
| 90 | `ds-case-nested-null-forms` | 嵌套结构里的空值形态不一 | 核验状态已核对 |
| 90 | `ds-case-partition-key-format` | 分区键格式不一致导致漏读 | 核验状态已核对 |
| 90 | `ds-case-repeat-measurement-id` | 重复测量的编号与批次丢失 | 核验状态已核对 |
| 90 | `ds-case-row-order-not-guaranteed` | 分布式处理的输出顺序不保证 | 核验状态已核对 |
| 90 | `ds-case-upstream-schema-change` | 上游改结构导致下游静默错位 | 核验状态已核对 |
| 90 | `ds-credit-accounting-caliber` | 学分统计是否含重修与免修 | 核验状态已核对 |
| 90 | `ds-enrollment-base-caliber` | 在校生数的时点与分母口径 | 核验状态已核对 |
| 90 | `ds-float-accumulation` | 大规模浮点求和的累积误差 | 核验状态已核对 |
| 90 | `ds-gpa-scale-caliber` | 绩点换算口径必须声明 | 核验状态已核对 |
| 90 | `ds-grade-curve-rounding` | 成绩核算的进位与截断口径 | 核验状态已核对 |
| 90 | `ds-grade-marker-special` | 成绩列里的非数值特殊标记 | 核验状态已核对 |
| 90 | `ds-label-positive-class` | 二值字段的方向必须写明 | 核验状态已核对 |
| 90 | `ds-missing-sentinel-in-model` | 哨兵值与真实负值混用 | 核验状态已核对 |
| 90 | `ds-student-status-timeline` | 学籍状态是时间序列而非单一取值 | 核验状态已核对 |
| 90 | `ds-term-year-encoding` | 学年与学期编码跨系统不统一 | 核验状态已核对 |
| 90 | `ds-transcript-revision-flag` | 重修与补考后的成绩替换规则 | 核验状态已核对 |
| 90 | `general-absolute-vs-relative` | 绝对数与相对数放在同一列 | 核验状态已核对 |
| 90 | `general-accounting-negative` | 负数用括号或尾部负号表示 | 核验状态已核对 |
| 90 | `general-address-levels-mixed` | 地址列的行政区划层级不齐 | 核验状态已核对 |
| 90 | `general-age-standardization` | 年龄结构不同时分组率不可直比 | 核验状态已核对 |
| 90 | `general-boolean-variants` | 布尔列的多种写法 | 核验状态已核对 |
| 90 | `general-case-batch-sheets-unequal-columns` | 同表分批导出各 sheet 列不一致 | 核验状态已核对 |
| 90 | `general-case-cartesian-join` | 合并产生笛卡尔积导致行数暴增 | 核验状态已核对 |
| 90 | `general-case-codebook-version-mismatch` | 码表版本与数据不匹配 | 核验状态已核对 |
| 90 | `general-case-column-rename-across-waves` | 多轮数据的列名改过或含义变了 | 核验状态已核对 |
| 90 | `general-case-copy-paste-offset` | 复制粘贴错位导致整列偏移 | 核验状态已核对 |
| 90 | `general-case-date-column-half-text` | 日期列一半是文本一半是日期值 | 核验状态已核对 |
| 90 | `general-case-delimiter-not-comma` | 分隔符不是逗号 | 核验状态已核对 |
| 90 | `general-case-duplicate-by-spelling` | 同一实体因写法不同未被识别为重复 | 核验状态已核对 |
| 90 | `general-case-file-version-chaos` | 中间文件版本混乱 | 核验状态已核对 |
| 90 | `general-case-filter-then-stats` | 筛选状态下做的统计掩盖了整体 | 核验状态已核对 |
| 90 | `general-case-formula-range-shift` | 公式填充范围错位 | 核验状态已核对 |
| 90 | `general-case-hidden-rows-dropped` | 隐藏行与筛选状态下的复制 | 核验状态已核对 |
| 90 | `general-case-join-key-type-mismatch` | 合并键两侧类型不一致 | 核验状态已核对 |
| 90 | `general-case-leading-zero-lost` | 前导零已丢失的补救 | 核验状态已核对 |
| 90 | `general-case-manual-fix-no-record` | 手工改过的单元格没有留痕 | 核验状态已核对 |
| 90 | `general-case-merge-missing-jump` | 合并后缺失率骤增 | 核验状态已核对 |
| 90 | `general-case-multi-source-unit-different` | 两个来源同一字段用了不同单位 | 核验状态已核对 |
| 90 | `general-case-multiselect` | 多选题被拆成多个 0/1 列 | 核验状态已核对 |
| 90 | `general-case-overlapping-sources` | 两份来源有重叠样本 | 核验状态已核对 |
| 90 | `general-case-same-name-not-same-person` | 同名不代表同一个人 | 核验状态已核对 |
| 90 | `general-case-sample-size-unexplained` | 清洗前后样本量对不上 | 核验状态已核对 |
| 90 | `general-case-trailing-delimiter` | 行尾多余分隔符造出空列 | 核验状态已核对 |
| 90 | `general-case-unit-conversion-direction` | 单位换算方向搞反 | 核验状态已核对 |
| 90 | `general-case-vlookup-approximate` | 近似匹配导致错行对齐 | 核验状态已核对 |
| 90 | `general-case-zero-variance` | 零方差列未必该删 | 核验状态已核对 |
| 90 | `general-category-other-explosion` | 其他与自由填写列导致类别爆炸 | 核验状态已核对 |
| 90 | `general-ceiling-effect` | 量表分的天花板与地板效应 | 核验状态已核对 |
| 90 | `general-column-name-bom` | 表头带字节序标记导致列名对不上 | 核验状态已核对 |
| 90 | `general-column-name-duplicate` | 表头有重复列名 | 核验状态已核对 |
| 90 | `general-column-name-whitespace` | 列名前后有空白或换行 | 核验状态已核对 |
| 90 | `general-composition-vs-rate` | 构成比不能当率用 | 核验状态已核对 |
| 90 | `general-coverage-rate-denominator` | 覆盖率类指标的分母要对齐 | 核验状态已核对 |
| 90 | `general-date-ambiguous` | 日期格式存在多义 | 核验状态已核对 |
| 90 | `general-date-excel-serial` | Excel 序列号被当成数值 | 核验状态已核对 |
| 90 | `general-dedupe-scope` | 去重前必须明确唯一键 | 核验状态已核对 |
| 90 | `general-education-vs-degree` | 学历与学位是两个不同字段 | 核验状态已核对 |
| 90 | `general-encoding-mojibake` | 中文编码错配导致取值碎裂 | 核验状态已核对 |
| 90 | `general-enrolled-status` | 在读与已毕业必须分开 | 核验状态已核对 |
| 90 | `general-equal-vs-quantile-bins` | 等距分组与等频分组含义不同 | 核验状态已核对 |
| 90 | `general-excel-1904-datesystem` | 日期基准不同导致日期整体偏移 | 核验状态已核对 |
| 90 | `general-excel-merged-cells` | Excel 合并单元格只留左上角值 | 核验状态已核对 |
| 90 | `general-footer-summary-rows` | 表尾合计行混在数据里 | 核验状态已核对 |
| 90 | `general-formula-cell-value` | 公式列读到的是公式文本或过期缓存 | 核验状态已核对 |
| 90 | `general-fullwidth` | 中文数据的全角与隐形字符 | 核验状态已核对 |
| 90 | `general-fullwidth-comma-csv` | 全角标点导致分隔错位 | 核验状态已核对 |
| 90 | `general-gb-address-code` | 行政区划代码逐年调整 | 核验状态已核对 |
| 90 | `general-gb-education-code` | 学历与专业代码有新旧版 | 核验状态已核对 |
| 90 | `general-gb-ethnic-code` | 民族编码与自由填写 | 核验状态已核对 |
| 90 | `general-gender-code` | 性别字段的多种写法 | 核验状态已核对 |
| 90 | `general-id-checksum` | 身份证号有校验位且有两代长度 | 核验状态已核对 |
| 90 | `general-identifier-not-variable` | 标识列不参与统计 | 核验状态已核对 |
| 90 | `general-interval-text` | 区间型取值是定序类别不是数值 | 核验状态已核对 |
| 90 | `general-likert-range` | 李克特量表的常见取值 | 核验状态已核对 |
| 90 | `general-mean-imputation-bias` | 均值填补会压缩方差 | 核验状态已核对 |
| 90 | `general-measurement-scales` | 测量尺度决定能算什么 | 核验状态已核对 |
| 90 | `general-missing-literal` | 文字形式的缺失标记 | 核验状态已核对 |
| 90 | `general-missing-mechanism` | 区分缺失的三种机制 | 核验状态已核对 |
| 90 | `general-missing-negative-code` | 负数编码表示未回答 | 核验状态已核对 |
| 90 | `general-missing-rate-no-threshold` | 缺失率没有通用阈值 | 核验状态已核对 |
| 90 | `general-missing-sentinel` | 哨兵值当作缺失 | 核验状态已核对 |
| 90 | `general-multi-header-rows` | 多级表头被读成数据行 | 核验状态已核对 |
| 90 | `general-multi-select-in-single` | 单选题列里出现多选答案 | 核验状态已核对 |
| 90 | `general-na-as-real-value` | NA 可能是真实取值而不是缺失 | 核验状态已核对 |
| 90 | `general-newline-in-cell` | 单元格内换行符破坏行结构 | 核验状态已核对 |
| 90 | `general-nominal-vs-real-amount` | 跨年比较金额要区分名义与实际 | 核验状态已核对 |
| 90 | `general-ordinal-order-lost` | 有序分类的排序被字典序打乱 | 核验状态已核对 |
| 90 | `general-org-name-variants` | 机构名称的全称与简称混用 | 核验状态已核对 |
| 90 | `general-outlier-not-error` | 异常值不等于错误值 | 核验状态已核对 |
| 90 | `general-panel-unbalanced` | 面板数据不是每个对象都有每一期 | 核验状态已核对 |
| 90 | `general-percent-scale-mixed` | 比例与百分数两种量纲混用 | 核验状态已核对 |
| 90 | `general-percentage-points` | 百分点与百分比不是一回事 | 核验状态已核对 |
| 90 | `general-percentage-sum-not-100` | 百分比之和不等于 100 的成因 | 核验状态已核对 |
| 90 | `general-period-vs-point` | 时期指标与时点指标不能相加 | 核验状态已核对 |
| 90 | `general-ranking-ties` | 排名遇到并列值要说明规则 | 核验状态已核对 |
| 90 | `general-rate-not-average-of-rates` | 汇总行的比率不能取平均 | 核验状态已核对 |
| 90 | `general-scale-interval-not-equal` | 定序量表的间距不能假设相等 | 核验状态已核对 |
| 90 | `general-scientific-notation` | 长数字被转成科学计数法 | 核验状态已核对 |
| 90 | `general-skip-logic-missing` | 跳转题造成的结构性缺失 | 核验状态已核对 |
| 90 | `general-small-cell-count` | 交叉表的小格频数不可解读 | 核验状态已核对 |
| 90 | `general-small-n-unstable` | 小样本分组的比率不可靠 | 核验状态已核对 |
| 90 | `general-thousand-separator-number` | 数值列带千分位分隔符 | 核验状态已核对 |
| 90 | `general-timestamp-precision` | 时间戳精度不一致 | 核验状态已核对 |
| 90 | `general-unit-in-header` | 单位写在表头而不是取值里 | 核验状态已核对 |
| 90 | `general-unit-mixed` | 同一列混用单位 | 核验状态已核对 |
| 90 | `general-weight-column-detected` | 抽样权重列被当成普通变量 | 核验状态已核对 |
| 90 | `general-yoy-vs-mom` | 同比增长与环比增长不可混用 | 核验状态已核对 |
| 90 | `general-zero-vs-absent-event` | 计数为 0 不等于没有该记录 | 核验状态已核对 |

## 七、字段别名体系

一级=学科，二级=字段别名组。别名组由「共同出现在同一条规则里」聚类得出 —— 脚本不做同义判定，只把「你们已经写在一起的」归成一组，并记下依据。

### 通用

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 单位 | 68 | 单位、剂量、浓度、重量、长度、重量kg、身高、比例、占比、百分比、率、percent、rate、金额、收入、数量、费用、价格、amount、差额、增减、盈亏、地址、所在地区、籍贯、住址、address、学院、学校、机构、部门、单位名称、体重、时长、距离、人数、合计、频次、count、total、收益、年龄、age、构成、变化、增幅、差值、change、患病率、死亡率、产值、支出、存量、流量、总量、增长率、同比、环比、次数、覆盖率、普及率、渗透率、sum、姓名、名字、name、名称、面积 | `ds-float-accumulation`、`ds-missing-sentinel-in-model`、`general-absolute-vs-relative`、`general-accounting-negative`、`general-address-levels-mixed`、`general-age-standardization`、`general-case-duplicate-by-spelling`、`general-case-multi-source-unit-different`、`general-case-same-name-not-same-person`、`general-case-unit-conversion-direction`、`general-composition-vs-rate`、`general-coverage-rate-denominator`、`general-nominal-vs-real-amount`、`general-org-name-variants`、`general-percent-scale-mixed`、`general-percentage-points`、`general-percentage-sum-not-100`、`general-period-vs-point`、`general-rate-not-average-of-rates`、`general-thousand-separator-number`、`general-unit-in-header`、`general-unit-mixed`、`general-yoy-vs-mom`、`general-zero-vs-absent-event` |
| 缺失 | 64 | 缺失、未填写、备注、remark、note、性别、sex、gender、年龄段、区间、范围、分组、档次、其他、其他请注明、说明、补充、开放题、备注2、地区、省份、国家、洲、区域、region、area、学历、学位、受教育程度、最高学历、degree、文化程度、就读状态、edu、满意度、等级、grade、行政区划、城市、区县、专业、学科、民族、民族成分、ethnicity、成绩、分数、考核成绩、score、总评成绩、修读类型、是否重修、成绩备注、替代成绩、量表、题项、item、得分、总分、bin、平均分、最终成绩、行业、职业 | `ds-grade-curve-rounding`、`ds-grade-marker-special`、`ds-transcript-revision-flag`、`general-case-codebook-version-mismatch`、`general-category-other-explosion`、`general-ceiling-effect`、`general-column-name-duplicate`、`general-education-vs-degree`、`general-enrolled-status`、`general-equal-vs-quantile-bins`、`general-gb-address-code`、`general-gb-education-code`、`general-gb-ethnic-code`、`general-gender-code`、`general-interval-text`、`general-likert-range`、`general-missing-literal`、`general-na-as-real-value`、`general-newline-in-cell`、`general-ordinal-order-lost`、`general-scale-interval-not-equal` |
| 学号 | 18 | 学号、编号、身份证、电话、手机号、账号、卡号、身份证号、证件号、idcard、工号、id、样本号、主键、轮次、年份、period、key | `general-case-cartesian-join`、`general-case-join-key-type-mismatch`、`general-case-leading-zero-lost`、`general-case-overlapping-sources`、`general-dedupe-scope`、`general-id-checksum`、`general-identifier-not-variable`、`general-panel-unbalanced`、`general-scientific-notation` |
| 日期 | 13 | 日期、时间、date、time、年月日、创建时间、更新时间、分区、partition、dt、时间戳、updated_at、timestamp | `ds-case-log-timezone`、`ds-case-partition-key-format`、`general-case-date-column-half-text`、`general-date-ambiguous`、`general-date-excel-serial`、`general-excel-1904-datesystem`、`general-timestamp-precision` |
| 是否 | 6 | 是否、有无、同意、标记、flag、is | `general-boolean-variants` |
| 权重 | 5 | 权重、权数、weight、权重系数、wgt | `general-weight-column-detected` |
| 排名 | 4 | 排名、名次、rank、排序 | `general-ranking-ties` |

- **待确认 · 单位**：该组 68 个别名里有 7 个来自同一条规则 `general-unit-in-header`。请判断这 7 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 缺失**：该组 64 个别名里有 7 个来自同一条规则 `general-case-codebook-version-mismatch`。请判断这 7 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 学号**：该组 18 个别名里有 7 个来自同一条规则 `general-identifier-not-variable`。请判断这 7 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 日期**：该组 13 个别名里有 6 个来自同一条规则 `general-timestamp-precision`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 是否**：该组 6 个别名里有 6 个来自同一条规则 `general-boolean-variants`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 权重**：该组 5 个别名里有 5 个来自同一条规则 `general-weight-column-detected`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。

> 上面这份是**候选人清单，不是缺陷列表**。别名多本身是对的 —— 别名就是给检索用的，写全才能命中不同表头。只有当一个字段族的别名里混进了另一个字段族（如`学号／工号／编号` 与 `性别／学历／民族` 混在一条里），才该拆。机器分不出这两者（`学号` 与 `编号` 的字面重合度是 0），所以判定权交回填表的人。

### 数据科学与大数据技术

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 测量编号 | 11 | 测量编号、重复序号、批次、run_id、sample_id、样本编号、实验时间、记录时间、batch、上机时间、采样时间 | `ds-case-lab-timestamp-batch`、`ds-case-repeat-measurement-id` |
| 标签 | 6 | 标签、label、target、y、结果、状态 | `ds-label-positive-class` |
| 测量值 | 6 | 测量值、读数、量程、measurement、仪器、值 | `ds-case-instrument-range` |
| 绩点 | 6 | 绩点、平均绩点、GPA、gpa、学分绩点、加权平均分 | `ds-gpa-scale-caliber` |
| 在校生数 | 5 | 在校生数、招生数、毕业生数、学年初、统计时点 | `ds-enrollment-base-caliber` |
| 学分 | 5 | 学分、已获学分、总学分、credit、credits | `ds-credit-accounting-caliber` |
| 学年 | 5 | 学年、学期、开课学期、academic_term、学年学期 | `ds-term-year-encoding` |
| 学籍状态 | 5 | 学籍状态、学籍状况、在读状态、status、学籍异动 | `ds-student-status-timeline` |
| 课程号 | 5 | 课程号、课程代码、course_id、课程编号、课程名称 | `ds-case-course-code-revision` |

- **待确认 · 测量编号**：该组 11 个别名里有 6 个来自同一条规则 `ds-case-lab-timestamp-batch`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 标签**：该组 6 个别名里有 6 个来自同一条规则 `ds-label-positive-class`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 测量值**：该组 6 个别名里有 6 个来自同一条规则 `ds-case-instrument-range`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 绩点**：该组 6 个别名里有 6 个来自同一条规则 `ds-gpa-scale-caliber`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 在校生数**：该组 5 个别名里有 5 个来自同一条规则 `ds-enrollment-base-caliber`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 学分**：该组 5 个别名里有 5 个来自同一条规则 `ds-credit-accounting-caliber`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 学年**：该组 5 个别名里有 5 个来自同一条规则 `ds-term-year-encoding`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 学籍状态**：该组 5 个别名里有 5 个来自同一条规则 `ds-student-status-timeline`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 课程号**：该组 5 个别名里有 5 个来自同一条规则 `ds-case-course-code-revision`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。

> 上面这份是**候选人清单，不是缺陷列表**。别名多本身是对的 —— 别名就是给检索用的，写全才能命中不同表头。只有当一个字段族的别名里混进了另一个字段族（如`学号／工号／编号` 与 `性别／学历／民族` 混在一条里），才该拆。机器分不出这两者（`学号` 与 `编号` 的字面重合度是 0），所以判定权交回填表的人。

泛化规则（适用字段留空，任何列都适用，不参与列名加权）：39 条

- `general-missing-negative-code`
- `general-missing-sentinel`
- `general-excel-merged-cells`
- `general-multi-header-rows`
- `general-footer-summary-rows`
- `general-fullwidth-comma-csv`
- `general-formula-cell-value`
- `general-encoding-mojibake`
- `general-column-name-bom`
- `general-column-name-whitespace`
- `general-skip-logic-missing`
- `general-multi-select-in-single`
- `general-missing-mechanism`
- `general-fullwidth`
- `general-measurement-scales`
- `general-missing-rate-no-threshold`
- `general-mean-imputation-bias`
- `general-outlier-not-error`
- `general-small-n-unstable`
- `general-small-cell-count`
- `general-case-multiselect`
- `general-case-zero-variance`
- `general-case-column-rename-across-waves`
- `general-case-copy-paste-offset`
- `general-case-hidden-rows-dropped`
- `general-case-batch-sheets-unequal-columns`
- `general-case-vlookup-approximate`
- `general-case-merge-missing-jump`
- `general-case-sample-size-unexplained`
- `general-case-file-version-chaos`
- `general-case-manual-fix-no-record`
- `general-case-delimiter-not-comma`
- `general-case-trailing-delimiter`
- `general-case-formula-range-shift`
- `general-case-filter-then-stats`
- `ds-case-row-order-not-guaranteed`
- `ds-case-convenience-sampling`
- `ds-case-nested-null-forms`
- `ds-case-upstream-schema-change`

## 八、同科条目相似度

同一学科内两两比较的余弦相似度。**为什么连分布一起报**：近重复阈值若够不着，这个检查就会长期沉默，看起来像「没有问题」。把分布摊开，阈值是否校准一眼可见。

> **阈值精度有限，请当提示看而不是判决看。** 当前离线后端的余弦尺度是被压扁的，上面这个阈值只能照实测分布定，**没有标注集可校准**，因此既有漏报也有误报。换 bge 语义后端后阈值必须重定，Plan 4 建起评测集才谈得上校准。

| 对数 | 最大 | p99 | p90 | 中位 | 本条阈值 |
| --- | --- | --- | --- | --- | --- |
| 4396 | 0.3759 | 0.1913 | 0.1191 | 0.0481 | 0.3 |

**最相似 TOP 5**（无条件展示，供人工判断）

| 余弦 | A | B |
| --- | --- | --- |
| 0.3759 | `general-gender-code` | `general-boolean-variants` |
| 0.3287 | `general-date-ambiguous` | `general-case-date-column-half-text` |
| 0.2981 | `general-case-copy-paste-offset` | `general-case-formula-range-shift` |
| 0.2695 | `general-yoy-vs-mom` | `general-case-sample-size-unexplained` |
| 0.2575 | `general-unit-mixed` | `general-percent-scale-mixed` |

**超过阈值 0.3 的 2 对**

| 余弦 | A | B |
| --- | --- | --- |
| 0.3759 | `general-gender-code` | `general-boolean-variants` |
| 0.3287 | `general-date-ambiguous` | `general-case-date-column-half-text` |

两条可能在讲同一件事。确认后请删掉一条，或把边界写进反例。

## 九、自召回冒烟测试

> 机械生成的自召回冒烟测试，用于发现索引故障（别名未进索引、学科过滤写反、向量未算）。不是检索质量评测 —— 真实评测需要团队标注的数据摘要→规则对，见设计文档 §5.9。

| 指标 | 值 |
| --- | --- |
| 总用例 | 113 |
| Hit@1 | 0.7788 |
| Hit@5 | 0.9823 |
| MRR | 0.8617 |

### 未命中明细

- `general-column-name-whitespace` 未进 Top-5
  - 查询：取值分布: 列名「学号 」与「学号」规范化后视为同一列
  - 实际召回：general-education-vs-degree、general-column-name-bom、general-absolute-vs-relative、general-unit-mixed、general-category-other-explosion
- `general-case-formula-range-shift` 未进 Top-5
  - 查询：取值分布: 逐行核对公式的引用区域，或改用可复现的脚本重算
  - 实际召回：general-formula-cell-value、general-unit-mixed、general-interval-text、general-measurement-scales、general-case-copy-paste-offset

---

本报告由 AI 依据 `knowledge/schema.md` 的规格生成。分数、指标均可由构建脚本复现。
