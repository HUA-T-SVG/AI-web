"""生成知识库填写模板。

这个脚本的产物是 knowledge/知识库模板.xlsx —— 团队填写的唯一载体。
脚本本身保留下来是为了两件事：
  1. 模板的结构是可复现的，不是某人手工拼出来的，改了字段能重新生成
  2. 通用层的预填内容在代码里有据可查，答辩问「这批规则哪来的」能翻到这里

**这个脚本会覆盖模板。** 模板里一旦有了团队填的内容，覆盖就等于把那些内容丢掉，
所以默认拒绝在已有内容时重建（见下面 has_team_content），确需重建要显式加 --force。

重新生成（会覆盖模板，若团队已在里面填写请先备份）：
  <python> knowledge/tools/make-template.py            # 模板有内容时会拒绝
  <python> knowledge/tools/make-template.py --force    # 强制重建，会丢掉已填内容
"""

from pathlib import Path
from sys import argv

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "知识库模板.xlsx"

# 列定义。顺序即 Excel 里的列顺序，改动它等于改了团队的填写方式，
# 所以要同步改 README.md 的第 5 节。
COLUMNS = [
    ("id", 30),
    ("标题", 22),
    ("适用学科", 11),
    ("适用字段", 26),
    ("触发条件", 32),
    ("规则内容", 68),
    ("正例", 30),
    ("反例", 30),
    ("来源", 34),
    ("权威度", 10),
    ("核验状态", 10),
]

# 规则内容的单元格很宽，不换行会看到一条长得离谱的横条
WRAP_COLUMNS = {"适用字段", "触发条件", "规则内容", "正例", "反例", "来源"}

HEADER_FILL = PatternFill("solid", fgColor="1F2937")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
NOTE_FONT = Font(italic=True, color="6B7280")

# ---------------------------------------------------------------------------
# 通用层预填内容
#
# 判据只有一条：pandas 会不会告诉你。凡是 describe() / pandas-profiling
# 能直接给出的都不写进来 —— 写了只会让知识库显得像常识汇编。
#
# 涉及具体码值（国标编号、调查数据的负数码表）的条目一律标「待核对」：
# 编造码值比留空危险得多，答辩现场被指出编码是错的，整段可信度就没了。
# ---------------------------------------------------------------------------

STANDARDS = [
    {
        "id": "general-missing-negative-code",
        "标题": "负数编码表示未回答",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "该列为数值列，且出现负数取值时",
        "规则内容": (
            "国内社会科学类调查数据常用负数区分未回答的原因，例如 -1 不适用、-2 不知道、"
            "-3 拒答、-9 缺失。这些数字不是真实测量值。具体码表必须以该数据集自己的说明文档为准，"
            "不同数据集的约定并不一致。若在确认含义之前就当成数值统计，均值、最值、分布会被整体污染。"
        ),
        "正例": "-9 通常是缺失，需按该数据的码表确认",
        "反例": "-3 拒答与 -2 不知道是两种不同的缺失机制，不应简单合并成一个「缺失」",
        "来源": "国内社会科学调查数据的常见约定；具体码表待按数据集说明文档核对",
        "权威度": "行业",
        "核验状态": "待核对",
    },
    {
        "id": "general-missing-sentinel",
        "标题": "哨兵值当作缺失",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "该列的取值里出现 99、999、-99 这类明显脱离其余取值范围的整齐数字",
        "规则内容": (
            "调查数据里 99、999、998、997 常被用来表示「未回答」「不适用」等状态，而不是真实数值。"
            "判断线索是它们与其余取值之间存在断崖式的间隔（例如年龄列其余值都在 0-120 之间）。"
            "这类值一旦当成数值参与统计，均值与标准差会严重失真。"
        ),
        "正例": "年龄列出现 999 而其余取值均小于 120 → 疑似缺失编码",
        "反例": "收入列出现 999 → 可能是真实的 999 元，需结合该字段的取值范围判断",
        "来源": "调查数据处理的通用约定",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-missing-literal",
        "标题": "文字形式的缺失标记",
        "适用学科": "通用",
        "适用字段": "缺失,未填写,备注,remark,note",
        "触发条件": "该列取值中出现 NA、N/A、null、无、未填、不详、/、-- 这类文字",
        "规则内容": (
            "缺失不只表现为空白单元格，还常被写成 NA、N/A、null、NaN、无、未填、未填写、不详、"
            "不知道、/、--、／ 等文字。这些字符串在类型推断时会让原本的数值列或日期列被误判为文本列，"
            "进而导致该列所有检查失效。规范化时应先统一识别为缺失，再做类型推断。"
        ),
        "正例": "「无」「未填」应识别为缺失",
        "反例": "「无业」是职业的合法取值，不能因为含有「无」字就判成缺失",
        "来源": "数据清洗通用约定",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-gb-code-standards",
        "标题": "国标编码字段需对照原文",
        "适用学科": "通用",
        "适用字段": "民族,行政区划,省份,学历,性别,专业,行业",
        "触发条件": "该列取值为短整数或短字符串编码，且列名疑似对应某类国家标准",
        "规则内容": (
            "行政区划、性别、学历、民族、学科专业等字段都有对应的国家标准码表。"
            "码值必须以国标原文为准，不要凭记忆或网络二手资料填写 —— 这类码表存在版本差异，"
            "行政区划代码每年调整，学历与专业代码也有新旧版之分。使用前先确认该数据用的是哪一版。"
        ),
        "正例": "性别列取值为 1、2，与国标一致",
        "反例": "性别列出现 0 或 9 → 可能是缺失编码或自定义编码，需查该数据的说明",
        "来源": "相关国家标准（具体标准号与码值待团队核对原文后填入）",
        "权威度": "国标",
        "核验状态": "待核对",
    },
    {
        "id": "general-date-ambiguous",
        "标题": "日期格式存在多义",
        "适用学科": "通用",
        "适用字段": "日期,时间,date,time,年月日",
        "触发条件": "该列取值为 01/02/2024 这类斜杠或点分隔的日期",
        "规则内容": (
            "01/02/2024 到底是 1 月 2 日还是 2 月 1 日，取决于该数据是月在前还是日在前，"
            "两种约定在国内数据里都常见。此外还有 2024.1.2、20240102、2024年1月2日 等写法。"
            "在无法确定约定时不应自动转换 —— 转换错了会把整列日期整体错位，而且错得很隐蔽。"
        ),
        "正例": "同一列内格式统一为 2024-01-02 → 可安全解析",
        "反例": "同一列里既有 01/02/2024 又有 1月2日 → 无法确定约定，需询问数据提供者",
        "来源": "日期解析的通用问题",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-date-excel-serial",
        "标题": "Excel 序列号被当成数值",
        "适用学科": "通用",
        "适用字段": "日期,时间,date,time",
        "触发条件": "列名含日期含义，但该列被推断为数值列，取值是 40000-50000 之间的整数",
        "规则内容": (
            "从 Excel 读取的日期有时会以序列号形式出现，例如 45000 表示 2023 年前后某一天。"
            "这类列在画像里完全正常 —— 类型是数值、没有缺失、分布也合理，"
            "所以纯统计手段发现不了，必须靠列名语义与取值范围共同判断。"
        ),
        "正例": "「出生日期」列取值在 20000-50000 之间 → 疑似 Excel 序列号",
        "反例": "「工号」列取值为 45000 → 是真实的编号，不要当日期转换",
        "来源": "Excel 数据交换的已知行为",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-unit-mixed",
        "标题": "同一列混用单位",
        "适用学科": "通用",
        "适用字段": "单位,剂量,浓度,重量,长度,重量kg,身高",
        "触发条件": "该列取值带单位后缀，或数值分布呈现两个相距很远的峰",
        "规则内容": (
            "同一列里混用 mg、g、μg 是常见错误（1 g = 1000 mg）。"
            "判断线索有两个：取值里带单位词（如「120mg」「0.12g」），"
            "或数值分布出现双峰且两峰之间大致相差 1000 倍。"
            "换算前必须先确认该列的基准单位，换算方向搞反会让所有数值差一千倍。"
        ),
        "正例": "120mg 与 0.12g 是同一个量，应统一后再统计",
        "反例": "身高 170（cm）与体重 65（kg）是同一个人不同字段，不是单位混用",
        "来源": "科研数据整理的常见问题",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-gender-code",
        "标题": "性别字段的多种写法",
        "适用学科": "通用",
        "适用字段": "性别,sex,gender",
        "触发条件": "该列为取值很少的分类列，且取值疑似表示性别",
        "规则内容": (
            "性别字段的写法极不统一：男/女、1/2、M/F、male/female、男性/女性。"
            "其中 1/2 与 M/F 的对应关系在不同数据里可能相反，必须结合该数据的说明确认，"
            "不能假设 1 一定是男。这是最容易静默出错的一类字段 —— 归并方向搞反了，"
            "整个按性别分组的分析结果都是反的，而且看起来完全正常。"
        ),
        "正例": "男、男性、M 归为同一类",
        "反例": "不要假设 1 一定是男，需查该数据的编码说明",
        "来源": "数据清洗通用约定",
        "权威度": "行业",
        "核验状态": "已核对",
    },
]

CALIBER = [
    {
        "id": "general-category-no-mean",
        "标题": "分类列不计算均值",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "该列被推断为分类列，但取值恰好都是数字",
        "规则内容": (
            "性别 1/2、学历 1-5 这类编码列即使能转成数字，计算均值与标准差也没有意义 —— "
            "学历 2.3 这个数解释不出任何东西。这类列应给出频数分布，而不是集中趋势。"
            "编码列被当成数值统计是自动画像工具最常见的误报来源。"
        ),
        "正例": "学历 1-5 应给频数分布",
        "反例": "年龄即使取值分散也是真正的数值列，应给均值",
        "来源": "统计学基本口径",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-missing-mechanism",
        "标题": "区分缺失的三种机制",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "某列缺失率较高，或缺失率在不同子群体之间差异明显",
        "规则内容": (
            "缺失分三种：完全随机（MCAR）、随机（MAR）、非随机（MNAR）。"
            "判断线索是把该列的缺失率按其他列分组比较 —— 各组差异显著就说明不是完全随机，"
            "此时直接删除缺失行会让样本产生系统性偏差。另外，"
            "「拒答」与「不知道」属于不同的缺失机制，不应简单合并成一个缺失。"
        ),
        "正例": "缺失率在城市组 3%、农村组 25% → 疑似 MAR，需按组分析",
        "反例": "全表缺失率均匀为 5% → 更像 MCAR，可直接删除缺失行",
        "来源": "缺失数据处理的通用口径",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-likert-range",
        "标题": "李克特量表的常见取值",
        "适用学科": "通用",
        "适用字段": "量表,题项,item,得分,score",
        "触发条件": "该列为整数，且唯一值数量很少（4 到 11 个）",
        "规则内容": (
            "常见李克特量表为 1-5、1-7、0-10 点。若出现 0 或 8、9 这类值，"
            "需先确认是编码错误还是使用了非标准量表。"
            "含反向题的问卷必须先反向计分再求和，否则总分没有意义 —— "
            "这一点光看数据发现不了，必须结合问卷原文。"
        ),
        "正例": "取值为 1、2、3、4、5 → 5 点量表",
        "反例": "取值为 1 到 6 → 不在常见量表之列，需核对原始问卷",
        "来源": "心理测量学通用口径",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-ceiling-effect",
        "标题": "量表分的天花板与地板效应",
        "适用学科": "通用",
        "适用字段": "总分,得分,score,量表",
        "触发条件": "该列为量表总分，且取值大量集中在最大值或最小值",
        "规则内容": (
            "量表分数若大量挤在满分或最低分附近，说明该量表对这个样本缺乏区分度，"
            "测量的信息量有限。此时均值会高估或低估真实水平，"
            "而且在后续分析里当作连续变量直接做回归也不合适。"
            "这属于「数据没问题但结论要谨慎」的情况，应在报告里说明而不是当作质量问题处理。"
        ),
        "正例": "100 分制量表里 60% 的样本得满分 → 存在天花板效应",
        "反例": "分数近似正态分布 → 无此问题",
        "来源": "心理测量学通用口径",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-duplicate-no-key",
        "标题": "没有主键时重复未必是错误",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "检出完全重复的行，但该表没有明显的唯一标识列",
        "规则内容": (
            "若表中不存在学号、编号这类唯一键，完全重复的两行可能是真实的重复观测"
            "（例如同一个人在不同时点的测量，或被试恰好给出了完全相同的作答）。"
            "是否是错误取决于业务口径，必须交由用户确认，不可自动删除 —— "
            "科研数据里删掉一行真实记录，比留下一条重复危险得多。"
        ),
        "正例": "有学号列且学号重复 → 大概率是录入错误",
        "反例": "无任何标识列且两行完全相同 → 可能是真实重复观测，需用户确认",
        "来源": "数据清洗通用口径",
        "权威度": "行业",
        "核验状态": "已核对",
    },
    {
        "id": "general-fullwidth",
        "标题": "中文数据的全角与隐形字符",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "列内取值看似相同，却未被当成同一个值",
        "规则内容": (
            "中文数据里常见四类隐形差异：全角数字（１２３）、全角空格、"
            "零宽字符、以及行尾多余的 \\r。它们在界面上与正常字符看不出区别，"
            "却会导致分组、去重、跨表合并键全部失效。"
            "规范化时应统一处理，但要小心不要把「本科」与「本科在读」这类真实差异也一并消除。"
        ),
        "正例": "「本科」与「本科　」（尾部全角空格）应视为同一取值",
        "反例": "「本科」与「本科在读」是不同取值，不可因规范化而合并",
        "来源": "中文文本处理的通用问题",
        "权威度": "行业",
        "核验状态": "已核对",
    },
]

CASES = [
    {
        "id": "general-case-leading-zero-lost",
        "标题": "前导零已丢失的补救",
        "适用学科": "通用",
        "适用字段": "学号,编号,工号,id,样本号",
        "触发条件": "该列为标识列，取值全为纯数字，且长度不齐",
        "规则内容": (
            "从 Excel 读取的标识列经常因为被识别成数字而丢掉前导零。"
            "判断线索是长度：若该列大多数值长度为 8、个别为 6 或 7，通常说明前导零已丢失。"
            "补救方式是按目标长度左补零，而不是当异常值剔除 —— "
            "剔除会直接丢掉整条记录，补零则能救回来。"
        ),
        "正例": "20210001 与 2100002 → 后者按 8 位补成 02100002",
        "反例": "该列本身长度不固定（如含字母的编号）→ 不能套用补零",
        "来源": "我们自己跑数据时发现",
        "权威度": "团队经验",
        "核验状态": "已核对",
    },
    {
        "id": "general-case-multiselect",
        "标题": "多选题被拆成多个 0/1 列",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "出现若干列名相似、取值只有 0 和 1 的列",
        "规则内容": (
            "多选题导出时常被拆成一列一个选项。这些列之间不独立，"
            "不应各自当作独立的二分类变量做分布统计。"
            "另外，这类列里的 0 与空白含义不同：「没勾选」和「未回答」是两回事，"
            "把空白当 0 处理会凭空造出一批「未选择」的样本。"
        ),
        "正例": "爱好_篮球、爱好_足球 等一组列 → 多选列，需合并考虑",
        "反例": "单独的「是否吸烟」0/1 列 → 是真正的二分类变量，正常统计",
        "来源": "问卷数据整理的常见问题",
        "权威度": "团队经验",
        "核验状态": "已核对",
    },
    {
        "id": "general-case-zero-variance",
        "标题": "零方差列未必该删",
        "适用学科": "通用",
        "适用字段": "",
        "触发条件": "某列所有非缺失值完全相同",
        "规则内容": (
            "零方差列对分析没有信息量，但它本身可能有意义 —— "
            "例如全表省份都是「北京」，因为这份数据本就是北京地区的样本。"
            "不应自动删除，应先确认是数据本身如此，还是筛选条件过窄或抽样出了问题。"
        ),
        "正例": "「省份」列全是北京，且数据集说明本就是北京样本 → 正常",
        "反例": "「省份」列全是北京，但数据声称来自全国 → 抽样有问题，需报告",
        "来源": "我们自己跑数据时发现",
        "权威度": "团队经验",
        "核验状态": "已核对",
    },
]

SHEETS = [
    ("数据标准", STANDARDS),
    ("口径规则", CALIBER),
    ("清洗案例", CASES),
]

# 每张表后面留出的空行数：团队在预填内容下面接着写。
# 留空行而不是让他们自己插行，是为了避免插入时把样式带乱。
BLANK_ROWS = 40

# 「填写说明」只做一张指路便签，不做说明书。
#
# 完整的填写说明在 knowledge/README.md。同一件事写两份，改一处忘一处就会漂移 ——
# 而两份说明书并存时，谁都不确定哪份是最新的，这比「少看几行字」危险得多。
# 所以这一页只回答两个问题：这是干什么的、接下来去哪。
NOTE = [
    ("知识库填写模板", "title"),
    ("", "blank"),
    ("你要交付的只有一样东西：填好的这份 Excel。不需要懂代码，不需要懂 YAML。", "body"),
    ("唯一的判据：pandas 会不会告诉你？", "lead"),
    ("　　·「这一列有 12 个缺失」→ pandas 会告诉你 → 不用写", "body"),
    ("　　·「这一列的 -99 是缺失」→ pandas 不会告诉你 → 必须写", "body"),
    ("数据标准 / 口径规则 / 清洗案例三张表已预填「通用」条目：审一遍，再补一个学科。", "body"),
    ("完整填写说明见 knowledge/README.md —— 逐列怎么填、好坏对照、自查清单都在那里。", "pointer"),
]


def build() -> None:
    workbook = Workbook()

    # --- 填写说明（便签） ---
    sheet = workbook.active
    sheet.title = "填写说明"
    # 便签不做成宽表：列宽收到 68，单行不至于长到需要横扫
    sheet.column_dimensions["A"].width = 68
    for row_index, (line, kind) in enumerate(NOTE, start=1):
        cell = sheet.cell(row=row_index, column=1, value=line)
        if kind == "title":
            cell.font = Font(bold=True, size=14)
            sheet.row_dimensions[row_index].height = 26
        elif kind == "lead":
            cell.font = Font(bold=True, size=11)
        elif kind == "pointer":
            cell.font = NOTE_FONT

    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # --- 三张填写表 ---
    for sheet_name, entries in SHEETS:
        target = workbook.create_sheet(sheet_name)

        for column_index, (name, width) in enumerate(COLUMNS, start=1):
            cell = target.cell(row=1, column=column_index, value=name)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border
            target.column_dimensions[get_column_letter(column_index)].width = width
        target.row_dimensions[1].height = 22

        for entry in entries:
            target.append([entry.get(name, "") for name, _ in COLUMNS])

        # 空行也要有边框，否则填到一半看不出这一行填的是哪几列
        last_row = 1 + len(entries) + BLANK_ROWS
        for row_index in range(2, last_row + 1):
            for column_index, (name, _) in enumerate(COLUMNS, start=1):
                cell = target.cell(row=row_index, column=column_index)
                cell.border = border
                if name in WRAP_COLUMNS:
                    cell.alignment = Alignment(wrap_text=True, vertical="top")

        target.freeze_panes = "A2"
        target.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{last_row}"

    # --- 字段说明 ---
    field_sheet = workbook.create_sheet("字段说明")
    field_sheet.append(["列名", "是否必填", "怎么填", "为什么要有这一列"])
    for cell in field_sheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")

    field_notes = [
        ("id", "必填", "英文小写加短横线，如 general-missing-01", "唯一标识。同一条规则以后改了内容，id 不要改，否则会被当成新条目"),
        ("标题", "必填", "一句话说清管什么，30 字以内", "检索结果的展示名，也是人复盘时的索引"),
        ("适用学科", "必填", "通用，或心理学／教育学／公共卫生等", "决定这条规则什么时候被加载 —— 用户选了哪个领域就加载通用层加该领域包"),
        ("适用字段", "选填", "这条规则管哪些列名，别名写全，逗号分隔；留空表示任何列都适用", "产品检索时最可靠的信号就是列名。只写「学历」的话，表头写「文化程度」的数据就召不回这条规则"),
        ("触发条件", "必填", "什么情况下该用这条规则", "让模型判断「现在这条规则适不适用」，而不是一股脑套上去"),
        ("规则内容", "必填", "规则本身，普通话写 2 到 5 句", "这是给大模型读的正文，也是唯一会进提示词的部分"),
        ("正例", "选填", "一两个正确的例子，多个用；分隔", "给模型看「对的样子」，比只讲规则更有效"),
        ("反例", "选填", "一两个容易搞错的例子", "归并类规则必填。误合并会直接破坏数据，是这类规则最大的风险"),
        ("来源", "必填", "国标号／统计局口径／导师口述／我们自己跑数据发现", "答辩要能从这条规则追到出处。不确定就写「待确认」，但不要空着，也不要编"),
        ("权威度", "必填", "国标／行业／团队经验，三选一", "两条规则冲突时按它排序，决定听谁的"),
        ("核验状态", "必填", "已核对／待核对", "你写的先填「待核对」，确认无误后再改「已核对」。这条让我们一眼看出还有多少没验过"),
    ]
    for row in field_notes:
        field_sheet.append(row)

    field_sheet.column_dimensions["A"].width = 12
    field_sheet.column_dimensions["B"].width = 10
    field_sheet.column_dimensions["C"].width = 52
    field_sheet.column_dimensions["D"].width = 62
    for row_index in range(2, len(field_notes) + 2):
        for column_index in range(1, 5):
            cell = field_sheet.cell(row=row_index, column=column_index)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            cell.border = border
    field_sheet.freeze_panes = "A2"

    # 「填写说明」是最先创建的 sheet，天然排在第一位，不需要再移动它。
    # 但要让它**不是**打开时停留的那一页：便签页扫一眼就以为表格是空的，
    # 有人真的因此以为没有内容。打开落在「数据标准」上，数据是第一眼看到的东西。
    for index, sheet in enumerate(workbook.worksheets):
        sheet.sheet_view.tabSelected = sheet.title == "数据标准"
    workbook.active = workbook.sheetnames.index("数据标准")

    workbook.save(OUTPUT)

    total = sum(len(entries) for _, entries in SHEETS)
    print(f"已生成 {OUTPUT}")
    print(f"预填通用层条目 {total} 条：")
    for sheet_name, entries in SHEETS:
        print(f"  {sheet_name}: {len(entries)} 条")


def count_entries(path: Path) -> dict[str, int]:
    """数出模板里每张填写表实际有多少条条目（不含表头与空行）。"""
    if not path.exists():
        return {}
    workbook = load_workbook(path, read_only=True, data_only=True)
    counts: dict[str, int] = {}
    try:
        for sheet_name, _ in SHEETS:
            if sheet_name not in workbook.sheetnames:
                continue
            sheet = workbook[sheet_name]
            counted = 0
            for index, row in enumerate(sheet.iter_rows(values_only=True)):
                if index == 0:  # 表头
                    continue
                if row and row[0] not in (None, ""):
                    counted += 1
            counts[sheet_name] = counted
    finally:
        workbook.close()
    return counts


def has_team_content(path: Path) -> dict[str, tuple[int, int]]:
    """找出「比预填条数多出来」的表。

    为什么要这道闸：这个脚本是覆盖式写文件的，而模板是团队填写的唯一真源。
    没有这道闸时，任何一次误跑都会静默抹掉团队填的全部内容 —— 而 xlsx 是二进制，
    git 也 diff 不出丢了什么。宁可让人多打一个 --force。
    """
    prefilled = {name: len(entries) for name, entries in SHEETS}
    actual = count_entries(path)
    return {
        name: (prefilled[name], actual[name])
        for name in prefilled
        if actual.get(name, 0) > prefilled[name]
    }


if __name__ == "__main__":
    force = "--force" in argv
    extra = has_team_content(OUTPUT)
    if extra and not force:
        print("模板里已有团队填写的内容，拒绝覆盖：")
        for sheet_name, (prefilled, actual) in extra.items():
            print(f"  {sheet_name}: 预填 {prefilled} 条，现有 {actual} 条")
        print()
        print("重建会丢掉这些条目（xlsx 是二进制，git 也 diff 不出丢了什么）。")
        print("确需重建：先备份模板，再加 --force 重跑。")
        raise SystemExit(1)

    if extra and force:
        print("注意：--force 已指定，模板里的团队内容会被覆盖。")

    build()
