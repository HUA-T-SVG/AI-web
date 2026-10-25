# 知识库构建报告

> 由 `knowledge/tools/build-index.py` 生成。真源是 `knowledge/知识库模板.xlsx`。

## 一、结论

| 项 | 值 |
| --- | --- |
| 条目总数 | 178 |
| 错误 | 0 |
| 警告 | 36 |
| 待核对条目 | 74 |
| 疑似近重复对 | 1（阈值 0.3，实际最大 0.3037） |
| 向量后端 | char-ngram-hash-512-v1（离线降级后端，非语义模型；换语义模型：--embedder bge） |
| 构建时间 | 2026-10-25T07:28:32Z |
| 自召回 Hit@5 | 0.9663 |
| 自召回 MRR | 0.8979 |

## 二、分布

| 维度 | 分布 |
| --- | --- |
| 类别 | 数据标准 66　口径规则 64　清洗案例 48 |
| 学科 | 通用 126　数据科学与大数据技术 27　心理学 5　教育学 5　公共卫生 5　社会学 5　经济学 5 |
| 权威度 | 团队经验 24　行业 153　国标 1 |

## 三、错误

（无）

## 四、警告

- 数据标准 第 2 行 · 权威度 · [general-missing-negative-code] 标了「团队经验」但来源「国内社会科学调查数据的常见约定；具体码表待按数据集说明文档核对」是可引用的方法学依据，够得上「行业」
- （跨行） · 适用字段 · 别名「age」被同属「数据标准」的 2 条规则声明：ds-missing-sentinel-in-model（数据标准）、education-age-at-reference-date（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「degree」被同属「数据标准」的 2 条规则声明：general-education-vs-degree（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「event_time」被同属「口径规则」的 2 条规则声明：ds-time-ordered-evaluation-split（口径规则）、general-late-arrival-revision（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「grade」被同属「数据标准」的 2 条规则声明：general-ordinal-order-lost（数据标准）、ds-grade-marker-special（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「key」被同属「清洗案例」的 2 条规则声明：general-case-cartesian-join（清洗案例）、general-case-join-key-type-mismatch（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「name」被同属「清洗案例」的 2 条规则声明：general-case-same-name-not-same-person（清洗案例）、general-case-duplicate-by-spelling（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「pvalue」被同属「口径规则」的 2 条规则声明：general-multiple-testing-family（口径规则）、general-pvalue-effect-size（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「p值」被同属「口径规则」的 2 条规则声明：general-multiple-testing-family（口径规则）、general-pvalue-effect-size（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「region」被同属「数据标准」的 2 条规则声明：general-na-as-real-value（数据标准）、general-gb-address-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「remark」被同属「数据标准」的 4 条规则声明：general-missing-literal（数据标准）、general-newline-in-cell（数据标准）、general-column-name-duplicate（数据标准）、ds-transcript-revision-flag（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「status」被同属「数据标准」的 2 条规则声明：ds-student-status-timeline（数据标准）、general-conditional-required-fields（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「timestamp」被同属「清洗案例」的 2 条规则声明：ds-case-log-timezone（清洗案例）、general-dst-ambiguous-local-time（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「其他」被同属「数据标准」的 3 条规则声明：general-category-other-explosion（数据标准）、general-newline-in-cell（数据标准）、general-column-name-duplicate（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「分项」被同属「口径规则」的 2 条规则声明：general-component-total-reconcile（口径规则）、economics-chain-volume-nonadditive（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「受教育程度」被同属「数据标准」的 3 条规则声明：general-education-vs-degree（数据标准）、general-enrolled-status（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「地区」被同属「数据标准」的 2 条规则声明：general-na-as-real-value（数据标准）、general-gb-address-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「坐标」被同属「清洗案例」的 2 条规则声明：general-crs-assignment-versus-transform（清洗案例）、general-coordinate-rounding-collapse（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「增幅」被同属「口径规则」的 2 条规则声明：general-percentage-points（口径规则）、general-yoy-vs-mom（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「姓名」被同属「清洗案例」的 2 条规则声明：general-case-same-name-not-same-person（清洗案例）、general-case-duplicate-by-spelling（清洗案例）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「差额」被同属「数据标准」的 2 条规则声明：general-accounting-negative（数据标准）、ds-missing-sentinel-in-model（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「年龄段」被同属「数据标准」的 2 条规则声明：general-interval-text（数据标准）、general-ordinal-order-lost（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「开放题」被同属「数据标准」的 2 条规则声明：general-newline-in-cell（数据标准）、general-ai-untrusted-cell-instructions（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「得分」被同属「口径规则」的 2 条规则声明：general-likert-range（口径规则）、general-ceiling-effect（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「总分」被同属「口径规则」的 3 条规则声明：general-ceiling-effect（口径规则）、psychology-scale-missing-score（口径规则）、psychology-language-group-comparability（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「文化程度」被同属「数据标准」的 3 条规则声明：general-education-vs-degree（数据标准）、general-enrolled-status（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「最高学历」被同属「数据标准」的 2 条规则声明：general-education-vs-degree（数据标准）、general-gb-education-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「状态」被同属「数据标准」的 2 条规则声明：ds-label-positive-class（数据标准）、general-conditional-required-fields（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「生效时间」被同属「口径规则」的 2 条规则声明：general-effective-interval-overlap（口径规则）、general-rule-effective-version（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「盈亏」被同属「数据标准」的 2 条规则声明：general-accounting-negative（数据标准）、ds-missing-sentinel-in-model（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「省份」被同属「数据标准」的 2 条规则声明：general-na-as-real-value（数据标准）、general-gb-address-code（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「说明」被同属「数据标准」的 3 条规则声明：general-category-other-explosion（数据标准）、general-newline-in-cell（数据标准）、general-column-name-duplicate（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「身高」被同属「数据标准」的 2 条规则声明：general-unit-mixed（数据标准）、general-unit-in-header（数据标准）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「量表」被同属「口径规则」的 3 条规则声明：general-likert-range（口径规则）、general-ceiling-effect（口径规则）、general-scale-interval-not-equal（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 别名「题项」被同属「口径规则」的 4 条规则声明：general-likert-range（口径规则）、general-scale-interval-not-equal（口径规则）、psychology-alpha-not-dimensionality（口径规则）、psychology-language-group-comparability（口径规则）。两条规则管同一个字段时冗余的可能性较高，请确认是互补规则还是重复规则
- （跨行） · 适用字段 · 另有 68 个别名被跨类别的多条规则共用（amount、count、date、end、feature、geometry、id、item、percent、rate、score、start、time、total、专业、主键、人数、分组、创建时间、剂量、区间、单位、占比、合计、地址、增减、备注、学历、学号、学校、工号、年月日、年龄、性别、总评成绩、成绩、批次、排序、收入、数量、日期、时间、时间戳、机构、权重、标签、样本号、档次、比例、民族、满意度、率、电话、百分比、等级、纬度、经度、编号、行政区划、课程号、距离、身份证、采样时间、重量、金额、长度、面积、频次）。这是约定的分工 —— 标准讲取值规范、口径讲怎么算、案例讲踩过的坑，同一字段由三处分别覆盖是对的。仅在其内容确实重复时才需合并

## 五、待核对清单

这些条目 `核验状态 = 待核对`。答辩要能逐条追溯出处，请对照原文核对后改成「已核对」。

| id | 标题 | 来源 |
| --- | --- | --- |
| `general-missing-negative-code` | 负数编码表示未回答 | 国内社会科学调查数据的常见约定；具体码表待按数据集说明文档核对 |
| `general-missing-sentinel` | 哨兵值当作缺失 | 调查数据处理的通用约定 |
| `general-gender-code` | 性别字段的多种写法 | 数据清洗通用约定 |
| `general-excel-merged-cells` | Excel 合并单元格只留左上角值 | pandas 官方文档：read_excel（表头、工作表、缺失与类型）
https://pandas.pydata.org/docs/reference/api/pandas.read_excel.html
核对日期：2026-10-25 |
| `general-footer-summary-rows` | 表尾合计行混在数据里 | Excel 数据交换的已知行为 |
| `general-boolean-variants` | 布尔列的多种写法 | 数据清洗通用约定 |
| `general-interval-text` | 区间型取值需保留边界与顺序 | pandas 官方文档：Categorical data（类别与排序）
https://pandas.pydata.org/docs/user_guide/categorical.html
核对日期：2026-10-25 |
| `general-percent-scale-mixed` | 比例与百分数两种量纲混用 | 统计分析通用口径 |
| `general-category-other-explosion` | 其他与自由填写列导致类别爆炸 | 问卷数据整理的常见问题 |
| `general-column-name-duplicate` | 表头有重复列名 | 数据清洗通用约定 |
| `general-accounting-negative` | 负数用括号或尾部负号表示 | 报表数据交换的已知行为 |
| `general-skip-logic-missing` | 跳转题造成的结构性缺失 | 问卷数据整理的常见问题 |
| `general-id-checksum` | 身份证号有校验位且有两代长度 | 身份信息字段的通用校验约定（具体校验算法待团队对照权威口径） |
| `general-address-levels-mixed` | 地址列的行政区划层级不齐 | 中文地址数据处理的常见问题 |
| `general-org-name-variants` | 机构名称的全称与简称混用 | 中文机构名称处理的常见问题 |
| `general-unit-in-header` | 单位写在表头而不是取值里 | 科研数据整理的常见问题 |
| `general-absolute-vs-relative` | 绝对数与相对数放在同一列 | 统计报表的通用口径 |
| `general-multi-select-in-single` | 单选题列里出现多选答案 | 问卷数据整理的常见问题 |
| `general-weight-column-detected` | 抽样权重列被当成普通变量 | 抽样调查的通用口径 |
| `general-timestamp-precision` | 时间戳精度不一致 | pandas 官方文档：to_datetime（明确格式、精度、时区）
https://pandas.pydata.org/docs/reference/api/pandas.to_datetime.html
核对日期：2026-10-25 |
| `general-gb-address-code` | 行政区划代码需核对层级与有效时间 | 司法部公开：《行政区划代码管理办法》，2025年6月30日公布
https://www.moj.gov.cn/pub/sfbgw/flfggz/flfggzbmgz/202512/t20251204_528920.html
核对日期：2026-10-25 |
| `general-gb-education-code` | 学历代码与专业目录需分别核对 | 全国标准信息公共服务平台：GB/T 4658-2006《学历代码》（核对标准元数据）
https://std.samr.gov.cn/gb/search/gbDetailed?id=71F772D7C819D3A7E05397BE0A0AB82A
核对日期：2026-10-25 |
| `general-gb-ethnic-code` | 民族编码与自由填写 | 民族编码相关国家标准（具体标准号与码值待团队核对原文） |
| `ds-missing-sentinel-in-model` | 哨兵值与真实负值混用 | 数据清洗通用约定 |
| `ds-label-positive-class` | 二值字段的方向必须写明 | 数据清洗通用约定 |
| `ds-student-status-timeline` | 学籍状态是时间序列而非单一取值 | 教育统计的通用口径 |
| `ds-term-year-encoding` | 学年与学期编码跨系统不统一 | 教育统计的通用口径 |
| `ds-grade-marker-special` | 成绩列里的非数值特殊标记 | 教育统计的通用口径 |
| `ds-transcript-revision-flag` | 重修与补考后的成绩替换规则 | 教育统计的通用口径 |
| `education-age-at-reference-date` | 年龄分组需使用声明的统计基准日 | Python官方文档：datetime（日期表示与比较，不规定入学年龄口径）
https://docs.python.org/3/library/datetime.html
资料查阅日期：2026-10-25 |
| `general-likert-range` | 李克特量表的常见取值 | 心理测量学通用口径 |
| `general-ceiling-effect` | 量表分的天花板与地板效应 | 心理测量学通用口径 |
| `general-measurement-scales` | 测量尺度决定能算什么 | 统计学基本口径 |
| `general-identifier-not-variable` | 标识列不参与统计 | 统计学基本口径 |
| `general-small-n-unstable` | 小样本分组的比率不可靠 | SciPy 官方文档：二项比例的区间估计
https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html
核对日期：2026-10-25 |
| `general-age-standardization` | 年龄结构不同时分组率不可直比 | 统计指标口径的通用约定 |
| `general-nominal-vs-real-amount` | 跨年比较金额要区分名义与实际 | 统计指标口径的通用约定 |
| `general-zero-vs-absent-event` | 计数为 0 不等于没有该记录 | 计数数据处理的通用口径 |
| `general-scale-interval-not-equal` | 定序量表的间距不能假设相等 | 测量学与统计的通用口径 |
| `general-coverage-rate-denominator` | 覆盖率类指标的分母要对齐 | 统计指标口径的通用约定 |
| `general-panel-unbalanced` | 面板数据不是每个对象都有每一期 | 面板数据处理的通用口径 |
| `ds-gpa-scale-caliber` | 绩点换算口径必须声明 | 统计分析通用口径 |
| `ds-credit-accounting-caliber` | 学分统计是否含重修与免修 | 教育统计的通用口径 |
| `ds-enrollment-base-caliber` | 在校生数的时点与分母口径 | 教育统计的通用口径 |
| `ds-grade-curve-rounding` | 成绩核算的进位与截断口径 | Python 官方文档：decimal（十进制精度与舍入）
https://docs.python.org/3/library/decimal.html
核对日期：2026-10-25 |
| `general-license-and-consent-scope` | 可下载数据不等于可任意再利用 | Frictionless Data Package v1规范，licenses元数据（不代替许可原文）
https://specs.frictionlessdata.io/data-package/
资料查阅日期：2026-10-25 |
| `general-rule-effective-version` | 知识规则需记录版本与适用时段 | W3C PROV-O，来源、活动、派生与修订关系
https://www.w3.org/TR/prov-o/
资料查阅日期：2026-10-25 |
| `general-retrieval-score-not-rule-validity` | 检索命中与规则正确适用需分别验证 | W3C Data Quality Vocabulary，按用途评估质量
https://www.w3.org/TR/vocab-dqv/
资料查阅日期：2026-10-25 |
| `education-assessment-weight-total` | 成绩权重与缺项处理需明确 | Python官方文档：decimal（仅支持算术与舍入方法，不替代教务制度）
https://docs.python.org/3/library/decimal.html
资料查阅日期：2026-10-25 |
| `general-case-zero-variance` | 零方差列未必该删 | 统计数据清洗的通用口径 |
| `general-case-column-rename-across-waves` | 多轮数据的列名改过或含义变了 | 纵向数据合并的常见问题 |
| `general-case-copy-paste-offset` | 复制粘贴错位导致整列偏移 | 数据整理的常见问题 |
| `general-case-same-name-not-same-person` | 同名不代表同一个人 | 跨表匹配的常见问题 |
| `general-case-overlapping-sources` | 两份来源有重叠样本 | pandas 官方文档：merge（连接方式、indicator、validate）
https://pandas.pydata.org/docs/reference/api/pandas.merge.html
核对日期：2026-10-25 |
| `general-case-codebook-version-mismatch` | 码表版本与数据不匹配 | 编码标准存在版本差异这一已知事实（具体标准号与码值待团队对照原文） |
| `general-case-vlookup-approximate` | 近似匹配导致错行对齐 | Excel 数据交换的已知行为 |
| `general-case-unit-conversion-direction` | 单位换算方向搞反 | 科研数据整理的常见问题 |
| `general-case-sample-size-unexplained` | 清洗前后样本量对不上 | 数据处理留痕的通用要求 |
| `general-case-manual-fix-no-record` | 手工改过的单元格没有留痕 | 科研数据管理的常见问题 |
| `general-case-duplicate-by-spelling` | 同一实体因写法不同未被识别为重复 | 跨表匹配的常见问题 |
| `general-case-formula-range-shift` | 公式填充范围错位 | Excel 数据交换的已知行为 |
| `general-case-multi-source-unit-different` | 两个来源同一字段用了不同单位 | NIST：Metric (SI) Prefixes
https://www.nist.gov/pml/owm/metric-si-prefixes
核对日期：2026-10-25 |
| `ds-case-partition-key-format` | 分区键格式不一致导致漏读 | 大数据工程实践的常见问题 |
| `ds-case-row-order-not-guaranteed` | 分布式处理的输出顺序不保证 | 大数据工程实践的常见问题 |
| `ds-case-convenience-sampling` | 便利抽样造成的选择偏差 | 抽样调查的通用口径 |
| `ds-case-log-timezone` | 日志时间戳的时区不统一 | pandas 官方文档：to_datetime（明确格式、精度、时区）
https://pandas.pydata.org/docs/reference/api/pandas.to_datetime.html
核对日期：2026-10-25 |
| `ds-case-nested-null-forms` | 嵌套结构里的空值形态不一 | 半结构化数据处理的常见问题 |
| `ds-case-upstream-schema-change` | 上游改结构导致下游静默错位 | 数据管道的常见问题 |
| `ds-case-course-code-revision` | 课程号跨年改版导致同名不同号 | 数据管道的常见问题 |
| `ds-case-instrument-range` | 实验数据超出仪器量程的取值 | 测量学与统计的通用口径 |
| `ds-case-repeat-measurement-id` | 重复测量的编号与批次丢失 | 测量学与统计的通用口径 |
| `ds-case-lab-timestamp-batch` | 实验记录时间与批次字段不一致 | 数据处理留痕的通用要求 |
| `general-simpson-aggregation-reversal` | 分组趋势与合并趋势可能反向 | 自拟分层算术例题已复核；通用调整方案仍待研究方法依据。
复核日期：2026-10-25 |
| `general-preview-sample-coverage` | 预览样本不能直接代表全量质量 | pandas 官方文档：DataFrame.sample，抽样参数
https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.sample.html
资料查阅日期：2026-10-25 |

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
| 90 | `ds-gpa-scale-caliber` | 绩点换算口径必须声明 | 核验状态已核对 |
| 90 | `ds-grade-curve-rounding` | 成绩核算的进位与截断口径 | 核验状态已核对 |
| 90 | `ds-grade-marker-special` | 成绩列里的非数值特殊标记 | 核验状态已核对 |
| 90 | `ds-label-positive-class` | 二值字段的方向必须写明 | 核验状态已核对 |
| 90 | `ds-missing-sentinel-in-model` | 哨兵值与真实负值混用 | 核验状态已核对 |
| 90 | `ds-student-status-timeline` | 学籍状态是时间序列而非单一取值 | 核验状态已核对 |
| 90 | `ds-term-year-encoding` | 学年与学期编码跨系统不统一 | 核验状态已核对 |
| 90 | `ds-transcript-revision-flag` | 重修与补考后的成绩替换规则 | 核验状态已核对 |
| 90 | `education-age-at-reference-date` | 年龄分组需使用声明的统计基准日 | 核验状态已核对 |
| 90 | `education-assessment-weight-total` | 成绩权重与缺项处理需明确 | 核验状态已核对 |
| 90 | `general-absolute-vs-relative` | 绝对数与相对数放在同一列 | 核验状态已核对 |
| 90 | `general-accounting-negative` | 负数用括号或尾部负号表示 | 核验状态已核对 |
| 90 | `general-address-levels-mixed` | 地址列的行政区划层级不齐 | 核验状态已核对 |
| 90 | `general-age-standardization` | 年龄结构不同时分组率不可直比 | 核验状态已核对 |
| 90 | `general-boolean-variants` | 布尔列的多种写法 | 核验状态已核对 |
| 90 | `general-case-codebook-version-mismatch` | 码表版本与数据不匹配 | 核验状态已核对 |
| 90 | `general-case-column-rename-across-waves` | 多轮数据的列名改过或含义变了 | 核验状态已核对 |
| 90 | `general-case-copy-paste-offset` | 复制粘贴错位导致整列偏移 | 核验状态已核对 |
| 90 | `general-case-duplicate-by-spelling` | 同一实体因写法不同未被识别为重复 | 核验状态已核对 |
| 90 | `general-case-formula-range-shift` | 公式填充范围错位 | 核验状态已核对 |
| 90 | `general-case-manual-fix-no-record` | 手工改过的单元格没有留痕 | 核验状态已核对 |
| 90 | `general-case-multi-source-unit-different` | 两个来源同一字段用了不同单位 | 核验状态已核对 |
| 90 | `general-case-overlapping-sources` | 两份来源有重叠样本 | 核验状态已核对 |
| 90 | `general-case-same-name-not-same-person` | 同名不代表同一个人 | 核验状态已核对 |
| 90 | `general-case-sample-size-unexplained` | 清洗前后样本量对不上 | 核验状态已核对 |
| 90 | `general-case-unit-conversion-direction` | 单位换算方向搞反 | 核验状态已核对 |
| 90 | `general-case-vlookup-approximate` | 近似匹配导致错行对齐 | 核验状态已核对 |
| 90 | `general-case-zero-variance` | 零方差列未必该删 | 核验状态已核对 |
| 90 | `general-category-other-explosion` | 其他与自由填写列导致类别爆炸 | 核验状态已核对 |
| 90 | `general-ceiling-effect` | 量表分的天花板与地板效应 | 核验状态已核对 |
| 90 | `general-column-name-duplicate` | 表头有重复列名 | 核验状态已核对 |
| 90 | `general-coverage-rate-denominator` | 覆盖率类指标的分母要对齐 | 核验状态已核对 |
| 90 | `general-excel-merged-cells` | Excel 合并单元格只留左上角值 | 核验状态已核对 |
| 90 | `general-footer-summary-rows` | 表尾合计行混在数据里 | 核验状态已核对 |
| 90 | `general-gb-address-code` | 行政区划代码需核对层级与有效时间 | 核验状态已核对 |
| 90 | `general-gb-education-code` | 学历代码与专业目录需分别核对 | 核验状态已核对 |
| 90 | `general-gb-ethnic-code` | 民族编码与自由填写 | 核验状态已核对 |
| 90 | `general-gender-code` | 性别字段的多种写法 | 核验状态已核对 |
| 90 | `general-id-checksum` | 身份证号有校验位且有两代长度 | 核验状态已核对 |
| 90 | `general-identifier-not-variable` | 标识列不参与统计 | 核验状态已核对 |
| 90 | `general-interval-text` | 区间型取值需保留边界与顺序 | 核验状态已核对 |
| 90 | `general-license-and-consent-scope` | 可下载数据不等于可任意再利用 | 核验状态已核对 |
| 90 | `general-likert-range` | 李克特量表的常见取值 | 核验状态已核对 |
| 90 | `general-measurement-scales` | 测量尺度决定能算什么 | 核验状态已核对 |
| 90 | `general-missing-negative-code` | 负数编码表示未回答 | 核验状态已核对 |
| 90 | `general-missing-sentinel` | 哨兵值当作缺失 | 核验状态已核对 |
| 90 | `general-multi-select-in-single` | 单选题列里出现多选答案 | 核验状态已核对 |
| 90 | `general-nominal-vs-real-amount` | 跨年比较金额要区分名义与实际 | 核验状态已核对 |
| 90 | `general-org-name-variants` | 机构名称的全称与简称混用 | 核验状态已核对 |
| 90 | `general-panel-unbalanced` | 面板数据不是每个对象都有每一期 | 核验状态已核对 |
| 90 | `general-percent-scale-mixed` | 比例与百分数两种量纲混用 | 核验状态已核对 |
| 90 | `general-preview-sample-coverage` | 预览样本不能直接代表全量质量 | 核验状态已核对 |
| 90 | `general-retrieval-score-not-rule-validity` | 检索命中与规则正确适用需分别验证 | 核验状态已核对 |
| 90 | `general-rule-effective-version` | 知识规则需记录版本与适用时段 | 核验状态已核对 |
| 90 | `general-scale-interval-not-equal` | 定序量表的间距不能假设相等 | 核验状态已核对 |
| 90 | `general-simpson-aggregation-reversal` | 分组趋势与合并趋势可能反向 | 核验状态已核对 |
| 90 | `general-skip-logic-missing` | 跳转题造成的结构性缺失 | 核验状态已核对 |
| 90 | `general-small-n-unstable` | 小样本分组的比率不可靠 | 核验状态已核对 |
| 90 | `general-timestamp-precision` | 时间戳精度不一致 | 核验状态已核对 |
| 90 | `general-unit-in-header` | 单位写在表头而不是取值里 | 核验状态已核对 |
| 90 | `general-weight-column-detected` | 抽样权重列被当成普通变量 | 核验状态已核对 |
| 90 | `general-zero-vs-absent-event` | 计数为 0 不等于没有该记录 | 核验状态已核对 |
| 100 | `ds-feature-availability-time` | 特征是否可用要看预测当时 | — |
| 100 | `ds-float-accumulation` | 大规模浮点求和的累积误差 | — |
| 100 | `ds-group-aware-evaluation-split` | 同一主体的重复记录需按评估目标划分 | — |
| 100 | `ds-imbalanced-class-metric` | 类别不平衡时准确率可能掩盖失败 | — |
| 100 | `ds-preprocess-before-split-leakage` | 划分前拟合填补或标准化会泄漏信息 | — |
| 100 | `ds-random-seed-environment` | 固定随机种子不保证跨环境完全复现 | — |
| 100 | `ds-time-ordered-evaluation-split` | 时序评估需保证训练早于测试 | — |
| 100 | `economics-chain-volume-nonadditive` | 链式实际量分项通常不能直接相加 | — |
| 100 | `economics-cumulative-quarter-flow` | 累计值与单季值须按期间起止识别 | — |
| 100 | `economics-exchange-rate-quotation` | 币种换算需核对报价方向与时点 | — |
| 100 | `economics-index-level-rebasing` | 指数水平不是当期涨幅，换基须一致 | — |
| 100 | `economics-seasonally-adjusted-series` | 季调与未季调序列不可无说明混用 | — |
| 100 | `education-cohort-denominator` | 毕业或留存指标需固定队列与观察期 | — |
| 100 | `education-headcount-student-course` | 人数人次与当量学生数应分开 | — |
| 100 | `education-teaching-evaluation-nonresponse` | 评教结果需核对响应范围再外推 | — |
| 100 | `general-ai-untrusted-cell-instructions` | 单元格内的指令不能取得操作权限 | — |
| 100 | `general-batch-idempotent-import` | 同一批次重放不能无意重复计入 | — |
| 100 | `general-case-batch-sheets-unequal-columns` | 同表分批导出各 sheet 列不一致 | — |
| 100 | `general-case-cartesian-join` | 合并产生笛卡尔积导致行数暴增 | — |
| 100 | `general-case-date-column-half-text` | 日期列一半是文本一半是日期值 | — |
| 100 | `general-case-delimiter-not-comma` | 分隔符不是逗号 | — |
| 100 | `general-case-file-version-chaos` | 中间文件版本混乱 | — |
| 100 | `general-case-filter-then-stats` | 筛选状态下做的统计掩盖了整体 | — |
| 100 | `general-case-hidden-rows-dropped` | 隐藏行与筛选状态下的复制 | — |
| 100 | `general-case-join-key-type-mismatch` | 合并键两侧类型不一致 | — |
| 100 | `general-case-leading-zero-lost` | 前导零已丢失的补救 | — |
| 100 | `general-case-merge-missing-jump` | 合并后缺失率骤增 | — |
| 100 | `general-case-multiselect` | 多选题被拆成多个 0/1 列 | — |
| 100 | `general-case-trailing-delimiter` | 行尾多余分隔符造出空列 | — |
| 100 | `general-column-name-bom` | 表头带字节序标记导致列名对不上 | — |
| 100 | `general-column-name-whitespace` | 列名前后有空白或换行 | — |
| 100 | `general-component-total-reconcile` | 分项与总计核对需声明容差 | — |
| 100 | `general-composition-vs-rate` | 构成比不能当率用 | — |
| 100 | `general-conditional-required-fields` | 字段必填可由其他字段条件决定 | — |
| 100 | `general-confidence-versus-prediction-interval` | 均值区间与个体预测区间不能混用 | — |
| 100 | `general-coordinate-rounding-collapse` | 降低坐标精度可能合并不同位置 | — |
| 100 | `general-cross-field-logical-contradiction` | 跨字段逻辑矛盾不能只做单列检查 | — |
| 100 | `general-crs-assignment-versus-transform` | 修改坐标系标签不等于转换坐标 | — |
| 100 | `general-date-ambiguous` | 日期格式存在多义 | — |
| 100 | `general-date-excel-serial` | Excel 序列号被当成数值 | — |
| 100 | `general-dedupe-scope` | 去重前必须明确唯一键 | — |
| 100 | `general-deidentification-linkage-risk` | 去掉姓名不等于无法重新识别 | — |
| 100 | `general-distribution-drift-review` | 分布漂移需区分业务变化与数据故障 | — |
| 100 | `general-dst-ambiguous-local-time` | 夏令时会产生重复或不存在的本地时刻 | — |
| 100 | `general-education-vs-degree` | 学历与学位是两个不同字段 | — |
| 100 | `general-effective-interval-overlap` | 有效区间的重叠与边界需明确 | — |
| 100 | `general-encoding-mojibake` | 中文编码错配导致取值碎裂 | — |
| 100 | `general-enrolled-status` | 在读与已毕业必须分开 | — |
| 100 | `general-epoch-unit-origin` | 整数时间戳需声明单位与起点 | — |
| 100 | `general-equal-vs-quantile-bins` | 等距分组与等频分组含义不同 | — |
| 100 | `general-excel-1904-datesystem` | 日期基准不同导致日期整体偏移 | — |
| 100 | `general-foreign-key-orphan` | 关联记录的外键缺少对应主体 | — |
| 100 | `general-formula-cell-value` | 公式列读到的是公式文本或过期缓存 | — |
| 100 | `general-fullwidth` | 中文数据的全角与隐形字符 | — |
| 100 | `general-fullwidth-comma-csv` | CSV 分隔符与引号不匹配导致错列 | — |
| 100 | `general-geo-axis-order` | 经纬度顺序需按格式约定核对 | — |
| 100 | `general-geodesic-versus-planar-distance` | 经纬度差不能直接解释为米 | — |
| 100 | `general-geometry-validity` | 几何有效性与真实边界需分开核对 | — |
| 100 | `general-late-arrival-revision` | 迟到数据需保留事件时间与处理时间 | — |
| 100 | `general-logs-secrets-minimization` | 日志与报告应检查凭证和不必要原文 | — |
| 100 | `general-mean-imputation-bias` | 均值填补会压缩方差 | — |
| 100 | `general-missing-literal` | 文字形式的缺失标记 | — |
| 100 | `general-missing-mechanism` | 区分缺失的三种机制 | — |
| 100 | `general-missing-rate-no-threshold` | 缺失率没有通用阈值 | — |
| 100 | `general-multi-header-rows` | 多级表头被读成数据行 | — |
| 100 | `general-multiple-testing-family` | 大量比较需声明检验集合与校正 | — |
| 100 | `general-na-as-real-value` | NA 可能是真实取值而不是缺失 | — |
| 100 | `general-newline-in-cell` | 单元格内换行符破坏行结构 | — |
| 100 | `general-nonfinite-numeric-values` | 数值列需区分有限值与无穷值 | — |
| 100 | `general-ordinal-order-lost` | 有序分类的排序被字典序打乱 | — |
| 100 | `general-outlier-not-error` | 异常值不等于错误值 | — |
| 100 | `general-percentage-points` | 百分点与百分比不是一回事 | — |
| 100 | `general-percentage-sum-not-100` | 百分比之和不等于 100 的成因 | — |
| 100 | `general-period-vs-point` | 时期指标与时点指标不能相加 | — |
| 100 | `general-pvalue-effect-size` | 显著性不等于效应大小或重要性 | — |
| 100 | `general-ranking-ties` | 排名遇到并列值要说明规则 | — |
| 100 | `general-rate-not-average-of-rates` | 汇总行的比率不能取平均 | — |
| 100 | `general-resample-aggregation-contract` | 频率转换要区分求和均值与期末值 | — |
| 100 | `general-rolling-window-information-boundary` | 滚动统计需核对窗口边界和可用信息 | — |
| 100 | `general-row-multiset-invariants` | 行数和均值相同不能证明记录未变 | — |
| 100 | `general-scientific-notation` | 长数字被转成科学计数法 | — |
| 100 | `general-series-gap-not-zero` | 时间序列断档不等于观测为零 | — |
| 100 | `general-small-cell-count` | 小频数单元格需评估不确定性与披露风险 | — |
| 100 | `general-spreadsheet-formula-injection` | 导出CSV中的文本可能被当公式 | — |
| 100 | `general-thousand-separator-number` | 数值列带千分位分隔符 | — |
| 100 | `general-transform-order-noncommutative` | 相同清洗动作换顺序可能得到不同结果 | — |
| 100 | `general-unit-mixed` | 同一列混用单位 | — |
| 100 | `general-yoy-vs-mom` | 同比增长与环比增长不可混用 | — |
| 100 | `general-zero-pearson-not-independent` | 线性相关接近零不代表没有关系 | — |
| 100 | `psychology-alpha-not-dimensionality` | 内部一致性不能替代维度与效度检查 | — |
| 100 | `psychology-item-direction-key` | 反向题需按题号与计分键处理 | — |
| 100 | `psychology-language-group-comparability` | 跨群体量表均值比较需核对测量可比性 | — |
| 100 | `psychology-scale-missing-score` | 量表缺题时能否评分由手册决定 | — |
| 100 | `psychology-straightlining-review` | 连续同选项只是作答质量核查线索 | — |
| 100 | `public-health-censoring-event-indicator` | 随访终止需区分事件发生与右删失 | — |
| 100 | `public-health-incidence-person-time` | 发病比例与人时发病率分母不同 | — |
| 100 | `public-health-risk-versus-odds` | 风险比与优势比不能直接互换 | — |
| 100 | `public-health-standard-population-comparison` | 年龄标化率比较要使用同一标准人口 | — |
| 100 | `public-health-surveillance-case-definition` | 监测病例需记录定义与分类版本 | — |
| 100 | `sociology-frame-response-distinction` | 覆盖不足与无应答是不同误差来源 | — |
| 100 | `sociology-household-person-denominator` | 户与个人是不同的统计单位 | — |
| 100 | `sociology-intercoder-codebook` | 人工编码需保留码本与编码者一致性 | — |
| 100 | `sociology-labour-status-reference-period` | 劳动状态分类需明确参考期与人群 | — |
| 100 | `sociology-survey-mode-comparison` | 调查方式变化可能改变回答分布 | — |

## 七、字段别名体系

一级=学科，二级=字段别名组。别名组由「共同出现在同一条规则里」聚类得出 —— 脚本不做同义判定，只把「你们已经写在一起的」归成一组，并记下依据。

### 通用

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 缺失 | 251 | 缺失、未填写、备注、remark、note、日期、时间、date、time、年月日、单位、剂量、浓度、重量、长度、重量kg、身高、性别、sex、gender、年龄段、区间、范围、分组、档次、比例、占比、百分比、率、percent、rate、其他、其他请注明、说明、补充、学号、编号、身份证、电话、手机号、账号、卡号、开放题、备注2、金额、收入、数量、费用、价格、amount、差额、增减、盈亏、地区、省份、国家、洲、区域、region、area、身份证号、证件号、idcard、地址、所在地区、籍贯、住址、address、学历、受教育程度、文化程度、最高学历、学位、degree、就读状态、edu、学院、学校、机构、部门、单位名称、体重、时长、距离、人数、合计、频次、count、total、满意度、等级、grade、创建时间、更新时间、行政区划、城市、区县、专业、学科、民族、民族成分、ethnicity、收益、年龄、age、成绩、分数、考核成绩、score、总评成绩、修读类型、是否重修、成绩备注、替代成绩、主体编号、课程号、部门编号、parent_id、采样时间、计数、reading、时间戳、epoch、created_at、经度、纬度、lon、lat、coordinates、文档内容、规则正文、题号、作答值、反向题、item、选课记录、FTE、出生日期、统计日期、入学年龄、原币种、目标币种、汇率、量表、题项、得分、总分、工号、id、样本号、构成、变化、增幅、差值、change、患病率、死亡率、产值、支出、存量、流量、总量、增长率、同比、环比、主键、bin、次数、覆盖率、普及率、渗透率、轮次、年份、period、sum、平均分、最终成绩、总额、分项、subtotal、销售额、余额、温度、滚动均值、累计值、lag、面积、训练期、测试期、event_time、p值、检验项目、pvalue、效应量、置信区间、批次、字段分布、feature、事件时间、入库时间、处理时间、邮编、匿名ID、量表版本、作答题数、T分数、分量表、alpha、omega、语言版本、群体、实际GDP、链式量、参考年、姓名、名字、name、行业、职业、key、名称、分区、partition、dt、updated_at、timestamp、课程代码、course_id、课程编号、课程名称、测量编号、重复序号、run_id、sample_id、样本编号、实验时间、记录时间、batch、上机时间、本地时间、时区、特征、训练集、测试集、成功数、样本数、样本行、预览、sample、文本、导出单元格 | `ds-case-course-code-revision`、`ds-case-lab-timestamp-batch`、`ds-case-log-timezone`、`ds-case-partition-key-format`、`ds-case-repeat-measurement-id`、`ds-float-accumulation`、`ds-grade-curve-rounding`、`ds-grade-marker-special`、`ds-missing-sentinel-in-model`、`ds-preprocess-before-split-leakage`、`ds-time-ordered-evaluation-split`、`ds-transcript-revision-flag`、`economics-chain-volume-nonadditive`、`economics-exchange-rate-quotation`、`education-age-at-reference-date`、`education-headcount-student-course`、`general-absolute-vs-relative`、`general-accounting-negative`、`general-address-levels-mixed`、`general-age-standardization`、`general-ai-untrusted-cell-instructions`、`general-case-cartesian-join`、`general-case-codebook-version-mismatch`、`general-case-date-column-half-text`、`general-case-duplicate-by-spelling`、`general-case-join-key-type-mismatch`、`general-case-leading-zero-lost`、`general-case-multi-source-unit-different`、`general-case-overlapping-sources`、`general-case-same-name-not-same-person`、`general-case-unit-conversion-direction`、`general-category-other-explosion`、`general-ceiling-effect`、`general-column-name-duplicate`、`general-component-total-reconcile`、`general-composition-vs-rate`、`general-coverage-rate-denominator`、`general-date-ambiguous`、`general-date-excel-serial`、`general-dedupe-scope`、`general-deidentification-linkage-risk`、`general-distribution-drift-review`、`general-dst-ambiguous-local-time`、`general-education-vs-degree`、`general-enrolled-status`、`general-epoch-unit-origin`、`general-equal-vs-quantile-bins`、`general-excel-1904-datesystem`、`general-foreign-key-orphan`、`general-gb-address-code`、`general-gb-education-code`、`general-gb-ethnic-code`、`general-gender-code`、`general-geo-axis-order`、`general-geodesic-versus-planar-distance`、`general-id-checksum`、`general-identifier-not-variable`、`general-interval-text`、`general-late-arrival-revision`、`general-likert-range`、`general-missing-literal`、`general-multiple-testing-family`、`general-na-as-real-value`、`general-newline-in-cell`、`general-nominal-vs-real-amount`、`general-ordinal-order-lost`、`general-org-name-variants`、`general-panel-unbalanced`、`general-percent-scale-mixed`、`general-percentage-points`、`general-percentage-sum-not-100`、`general-period-vs-point`、`general-preview-sample-coverage`、`general-pvalue-effect-size`、`general-rate-not-average-of-rates`、`general-resample-aggregation-contract`、`general-rolling-window-information-boundary`、`general-scale-interval-not-equal`、`general-scientific-notation`、`general-series-gap-not-zero`、`general-simpson-aggregation-reversal`、`general-spreadsheet-formula-injection`、`general-thousand-separator-number`、`general-timestamp-precision`、`general-unit-in-header`、`general-unit-mixed`、`general-yoy-vs-mom`、`general-zero-vs-absent-event`、`psychology-alpha-not-dimensionality`、`psychology-item-direction-key`、`psychology-language-group-comparability`、`psychology-scale-missing-score` |
| 生效时间 | 10 | 生效时间、失效时间、start、end、规则版本、来源版本、rule_id、报告期、累计收入、单季收入 | `economics-cumulative-quarter-flow`、`general-effective-interval-overlap`、`general-rule-effective-version` |
| 权重 | 8 | 权重、权数、weight、权重系数、wgt、平时成绩、期末成绩、总评 | `education-assessment-weight-total`、`general-weight-column-detected` |
| 记录ID | 7 | 记录ID、行、排序、导出、排名、名次、rank | `general-ranking-ties`、`general-row-multiset-invariants` |
| 开始日期 | 6 | 开始日期、结束日期、下限、上限、完成数量、计划数量 | `general-cross-field-logical-contradiction` |
| 是否 | 6 | 是否、有无、同意、标记、flag、is | `general-boolean-variants` |
| 边界 | 6 | 边界、polygon、geometry、坐标、crs、grid_size | `general-coordinate-rounding-collapse`、`general-crs-assignment-versus-transform`、`general-geometry-validity` |
| 变量X | 4 | 变量X、变量Y、相关系数、r | `general-zero-pearson-not-independent` |
| 处理步骤 | 4 | 处理步骤、填补、过滤、映射 | `general-transform-order-noncommutative` |
| 批次号 | 4 | 批次号、事件ID、文件指纹、batch_id | `general-batch-idempotent-import` |
| 数值 | 4 | 数值、比值、模型输出、value | `general-nonfinite-numeric-values` |
| 数据来源 | 4 | 数据来源、许可、授权范围、license | `general-license-and-consent-scope` |
| 日志 | 4 | 日志、报错、报告、access_token | `general-logs-secrets-minimization` |
| 规则命中 | 4 | 规则命中、检索分数、来源、核验状态 | `general-retrieval-score-not-rule-validity` |
| 区间下限 | 3 | 区间下限、区间上限、预测值 | `general-confidence-versus-prediction-interval` |

- **待确认 · 缺失**：该组 251 个别名里有 7 个来自同一条规则 `general-case-codebook-version-mismatch`。请判断这 7 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 生效时间**：该组 10 个别名里有 5 个来自同一条规则 `economics-cumulative-quarter-flow`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 权重**：该组 8 个别名里有 5 个来自同一条规则 `general-weight-column-detected`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 开始日期**：该组 6 个别名里有 6 个来自同一条规则 `general-cross-field-logical-contradiction`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 是否**：该组 6 个别名里有 6 个来自同一条规则 `general-boolean-variants`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。

> 上面这份是**候选人清单，不是缺陷列表**。别名多本身是对的 —— 别名就是给检索用的，写全才能命中不同表头。只有当一个字段族的别名里混进了另一个字段族（如`学号／工号／编号` 与 `性别／学历／民族` 混在一条里），才该拆。机器分不出这两者（`学号` 与 `编号` 的字面重合度是 0），所以判定权交回填表的人。

### 数据科学与大数据技术

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 标签 | 16 | 标签、label、target、y、结果、状态、学籍状态、学籍状况、在读状态、status、学籍异动、完成日期、审批编号、预测类别、y_true、y_pred | `ds-imbalanced-class-metric`、`ds-label-positive-class`、`ds-student-status-timeline`、`general-conditional-required-fields` |
| 测量值 | 6 | 测量值、读数、量程、measurement、仪器、值 | `ds-case-instrument-range` |
| 绩点 | 6 | 绩点、平均绩点、GPA、gpa、学分绩点、加权平均分 | `ds-gpa-scale-caliber` |
| 在校生数 | 5 | 在校生数、招生数、毕业生数、学年初、统计时点 | `ds-enrollment-base-caliber` |
| 学分 | 5 | 学分、已获学分、总学分、credit、credits | `ds-credit-accounting-caliber` |
| 学年 | 5 | 学年、学期、开课学期、academic_term、学年学期 | `ds-term-year-encoding` |
| 主体ID | 4 | 主体ID、试样ID、group、subject_id | `ds-group-aware-evaluation-split` |
| 特征时间 | 4 | 特征时间、发布时间、结果时间、available_at | `ds-feature-availability-time` |
| 随机种子 | 4 | 随机种子、模型、依赖版本、seed | `ds-random-seed-environment` |

- **待确认 · 标签**：该组 16 个别名里有 6 个来自同一条规则 `ds-label-positive-class`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 测量值**：该组 6 个别名里有 6 个来自同一条规则 `ds-case-instrument-range`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 绩点**：该组 6 个别名里有 6 个来自同一条规则 `ds-gpa-scale-caliber`。请判断这 6 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 在校生数**：该组 5 个别名里有 5 个来自同一条规则 `ds-enrollment-base-caliber`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 学分**：该组 5 个别名里有 5 个来自同一条规则 `ds-credit-accounting-caliber`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。
- **待确认 · 学年**：该组 5 个别名里有 5 个来自同一条规则 `ds-term-year-encoding`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。

> 上面这份是**候选人清单，不是缺陷列表**。别名多本身是对的 —— 别名就是给检索用的，写全才能命中不同表头。只有当一个字段族的别名里混进了另一个字段族（如`学号／工号／编号` 与 `性别／学历／民族` 混在一条里），才该拆。机器分不出这两者（`学号` 与 `编号` 的字面重合度是 0），所以判定权交回填表的人。

### 公共卫生

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 年龄组 | 4 | 年龄组、组别率、标准人口、标化率 | `public-health-standard-population-comparison` |
| 新发事件 | 4 | 新发事件、风险人数、随访人时、incidence | `public-health-incidence-person-time` |
| 暴露 | 4 | 暴露、结局、RR、OR | `public-health-risk-versus-odds` |
| 病例分类 | 4 | 病例分类、报告时间、确证时间、case_status | `public-health-surveillance-case-definition` |
| 随访时长 | 4 | 随访时长、事件标记、退出时间、event | `public-health-censoring-event-indicator` |


### 社会学

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 原文 | 4 | 原文、编码、编码者、码本版本 | `sociology-intercoder-codebook` |
| 家庭ID | 4 | 家庭ID、个人ID、成员数、户收入 | `sociology-household-person-denominator` |
| 就业状态 | 4 | 就业状态、求职、可工作、参考周 | `sociology-labour-status-reference-period` |
| 抽样框 | 4 | 抽样框、受邀名单、响应状态、总体 | `sociology-frame-response-distinction` |
| 访问方式 | 4 | 访问方式、波次、问卷版本、mode | `sociology-survey-mode-comparison` |


### 教育学

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 入学队列 | 4 | 入学队列、毕业状态、转入、转出 | `education-cohort-denominator` |
| 班级 | 4 | 班级、受邀人数、响应人数、评教得分 | `education-teaching-evaluation-nonresponse` |


### 经济学

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 季调标记 | 5 | 季调标记、月份、指标、SA、NSA | `economics-seasonally-adjusted-series` |
| 价格指数 | 4 | 价格指数、基期、CPI、index | `economics-index-level-rebasing` |

- **待确认 · 季调标记**：该组 5 个别名里有 5 个来自同一条规则 `economics-seasonally-adjusted-series`。请判断这 5 个是否属于同一字段族：是则该条管住即可，若跨了不同字段族（如编码体系互不相干的几类字段）则建议拆开。

> 上面这份是**候选人清单，不是缺陷列表**。别名多本身是对的 —— 别名就是给检索用的，写全才能命中不同表头。只有当一个字段族的别名里混进了另一个字段族（如`学号／工号／编号` 与 `性别／学历／民族` 混在一条里），才该拆。机器分不出这两者（`学号` 与 `编号` 的字面重合度是 0），所以判定权交回填表的人。

### 心理学

| 别名组 | 规模 | 词表 | 依据 |
| --- | --- | --- | --- |
| 题项序列 | 3 | 题项序列、答题时长、注意力题 | `psychology-straightlining-review` |


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
| 8276 | 0.3037 | 0.1806 | 0.1138 | 0.0424 | 0.3 |

**最相似 TOP 5**（无条件展示，供人工判断）

| 余弦 | A | B |
| --- | --- | --- |
| 0.3037 | `general-gender-code` | `general-boolean-variants` |
| 0.289 | `general-unit-mixed` | `general-case-multi-source-unit-different` |
| 0.2871 | `general-missing-negative-code` | `general-missing-mechanism` |
| 0.2845 | `general-column-name-whitespace` | `general-fullwidth` |
| 0.2557 | `general-missing-negative-code` | `general-missing-sentinel` |

**超过阈值 0.3 的 1 对**

| 余弦 | A | B |
| --- | --- | --- |
| 0.3037 | `general-gender-code` | `general-boolean-variants` |

两条可能在讲同一件事。确认后请删掉一条，或把边界写进反例。

## 九、自召回冒烟测试

> 机械生成的自召回冒烟测试，用于发现索引故障（别名未进索引、学科过滤写反、向量未算）。不是检索质量评测 —— 真实评测需要团队标注的数据摘要→规则对，见设计文档 §5.9。

| 指标 | 值 |
| --- | --- |
| 总用例 | 178 |
| Hit@1 | 0.8427 |
| Hit@5 | 0.9663 |
| MRR | 0.8979 |

### 未命中明细

- `general-fullwidth` 未进 Top-5
  - 查询：取值分布: 确认尾部全角空格无意义 → 去除并记录原写法
  - 实际召回：general-unit-mixed、general-ceiling-effect、general-boolean-variants、general-deidentification-linkage-risk、general-case-duplicate-by-spelling
- `general-small-n-unstable` 未进 Top-5
  - 查询：取值分布: 就业1/8可报1人/8人及12.5%，并说明估计不稳定
  - 实际召回：general-percentage-points、general-unit-mixed、general-absolute-vs-relative、general-ceiling-effect、general-case-cartesian-join
- `general-case-zero-variance` 未进 Top-5
  - 查询：取值分布: 「省份」列全是北京，且数据集说明本就是北京样本 → 正常
  - 实际召回：general-ceiling-effect、general-distribution-drift-review、general-panel-unbalanced、general-case-column-rename-across-waves、general-case-copy-paste-offset
- `general-case-merge-missing-jump` 未进 Top-5
  - 查询：取值分布: 用匹配标记区分left_only/right_only/both，并另查原字段缺失
  - 实际召回：general-column-name-bom、general-absolute-vs-relative、general-encoding-mojibake、general-enrolled-status、general-boolean-variants
- `general-case-sample-size-unexplained` 未进 Top-5
  - 查询：取值分布: 处理日志逐项记录：重复删除 N 条、缺失删除 M 条、最终 K 条
  - 实际召回：general-equal-vs-quantile-bins、general-case-file-version-chaos、general-absolute-vs-relative、general-logs-secrets-minimization、general-outlier-not-error
- `ds-case-upstream-schema-change` 未进 Top-5
  - 查询：取值分布: 按列名取数，缺列时显式报错
  - 实际召回：general-column-name-bom、general-column-name-whitespace、general-unit-in-header、general-ceiling-effect、general-unit-mixed

---

本报告由 AI 依据 `knowledge/schema.md` 的规格生成。分数、指标均可由构建脚本复现。
