#!/usr/bin/env python
"""把 `docs/技术文档.md` 转成 Word（.docx），供团队排版与导出 PDF。

**为什么需要它**：技术文档要交的是 PDF（≤30 页），而真源是 Markdown —— 手改 Word
会在下次修订时丢掉改动。所以 Markdown 是唯一真源，Word/PDF 都由本脚本生成。

**依赖的是 DSH 自带运行时**（不是系统 Python）：
    <bundled python> scripts/md-to-docx.py docs/技术文档.md docs/技术文档.docx

设计约定（对应赛项常见排版要求，可按官方模板调整）：
- A4，页边距上下 2.2 cm、左右 2.0 cm
- 正文宋体 10.5 pt、行距 1.3；标题黑体
- 表格 8.5 pt，带网格线，首行加粗
- 代码块等宽字体 8.5 pt
- 图片按页面可用宽度（17 cm）等比缩放

用法：
    python scripts/md-to-docx.py [输入.md] [输出.docx]
缺省即 docs/技术文档.md → docs/技术文档.docx。
"""

import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

BODY_FONT_CN = "宋体"
HEADING_FONT_CN = "黑体"
MONO_FONT = "Consolas"
BODY_SIZE = Pt(10.5)
TABLE_SIZE = Pt(8.5)
CODE_SIZE = Pt(8.5)

# Markdown 里的行内标记：**粗体**、`代码`、[文字](链接)
INLINE_RE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\[[^\]]*\]\([^)]*\))")


def set_run_font(run, *, cn=BODY_FONT_CN, ascii_font=None, size=BODY_SIZE, bold=None, italic=None):
    """中文字体必须显式设置 w:eastAsia，只设 font.name 对中文不生效。"""
    run.font.name = ascii_font or cn
    run.font.size = size
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), cn)
    rfonts.set(qn("w:ascii"), ascii_font or cn)
    rfonts.set(qn("w:hAnsi"), ascii_font or cn)


def add_inline(paragraph, text, *, size=BODY_SIZE, cn=BODY_FONT_CN, base_bold=False, italic=None):
    """按行内标记切分，逐段写入 run（保留粗体/等宽）。"""
    for piece in INLINE_RE.split(text):
        if not piece:
            continue
        if piece.startswith("**") and piece.endswith("**") and len(piece) > 4:
            run = paragraph.add_run(piece[2:-2])
            set_run_font(run, cn=cn, size=size, bold=True, italic=italic)
        elif piece.startswith("`") and piece.endswith("`") and len(piece) > 2:
            run = paragraph.add_run(piece[1:-1])
            set_run_font(run, ascii_font=MONO_FONT, size=Pt(size.pt - 1), bold=base_bold, italic=italic)
        elif piece.startswith("[") and "](" in piece:
            label = piece[1 : piece.index("](")]
            run = paragraph.add_run(label)
            set_run_font(run, cn=cn, size=size, bold=base_bold, italic=italic)
        else:
            run = paragraph.add_run(piece)
            set_run_font(run, cn=cn, size=size, bold=base_bold, italic=italic)


def is_table_separator(line: str) -> bool:
    return bool(re.fullmatch(r"\|[\s:|-]+\|", line.strip())) and "---" in line


def split_row(line: str) -> list[str]:
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|"):
        body = body[:-1]
    return [cell.strip() for cell in body.split("|")]


def add_table(document, rows: list[list[str]]):
    columns = max(len(row) for row in rows)
    table = document.add_table(rows=len(rows), cols=columns)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for r, row in enumerate(rows):
        for c in range(columns):
            cell = table.cell(r, c)
            cell.paragraphs[0].paragraph_format.space_after = Pt(0)
            text = row[c] if c < len(row) else ""
            add_inline(cell.paragraphs[0], text, size=TABLE_SIZE, base_bold=(r == 0))
    # 表格后留一点空，避免与下一段贴在一起
    spacer = document.add_paragraph()
    spacer.paragraph_format.space_after = Pt(2)


def build(md_path: Path, docx_path: Path) -> dict:
    document = Document()

    section = document.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = section.bottom_margin = Cm(2.2)
    section.left_margin = section.right_margin = Cm(2.0)

    normal = document.styles["Normal"]
    normal.font.size = BODY_SIZE
    normal.font.name = BODY_FONT_CN
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT_CN)
    normal.paragraph_format.line_spacing = 1.3
    normal.paragraph_format.space_after = Pt(3)

    for level, size in ((1, Pt(16)), (2, Pt(13)), (3, Pt(11.5))):
        style = document.styles[f"Heading {level}"]
        style.font.size = size
        style.font.name = HEADING_FONT_CN
        style.font.bold = True
        style.font.color.rgb = RGBColor(0x11, 0x11, 0x11)
        style.element.rPr.rFonts.set(qn("w:eastAsia"), HEADING_FONT_CN)
        style.paragraph_format.space_before = Pt(12 if level == 1 else 9)
        style.paragraph_format.space_after = Pt(6 if level == 1 else 4)

    lines = md_path.read_text(encoding="utf-8").splitlines()
    stats = {"headings": 0, "tables": 0, "images": 0, "code_blocks": 0, "paragraphs": 0}

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 代码块
        if stripped.startswith("```"):
            i += 1
            buffer = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buffer.append(lines[i])
                i += 1
            i += 1  # 跳过结束 ```
            if buffer:
                paragraph = document.add_paragraph()
                paragraph.paragraph_format.line_spacing = 1.0
                paragraph.paragraph_format.space_after = Pt(4)
                run = paragraph.add_run("\n".join(buffer))
                set_run_font(run, ascii_font=MONO_FONT, size=CODE_SIZE)
                stats["code_blocks"] += 1
            continue

        # 表格
        if stripped.startswith("|") and i + 1 < len(lines) and is_table_separator(lines[i + 1]):
            rows = [split_row(stripped)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            add_table(document, rows)
            stats["tables"] += 1
            continue

        # 图片
        match = re.fullmatch(r"!\[[^\]]*\]\(([^)]+)\)", stripped)
        if match:
            image_path = (md_path.parent / match.group(1)).resolve()
            if image_path.exists():
                paragraph = document.add_paragraph()
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                paragraph.paragraph_format.space_after = Pt(2)
                # 与紧随其后的图注保持同页，避免「图在这页、注在那页」
                paragraph.paragraph_format.keep_with_next = True
                paragraph.add_run().add_picture(str(image_path), width=Cm(16.5))
                stats["images"] += 1
            else:
                document.add_paragraph(f"[图片缺失：{match.group(1)}]")
            i += 1
            continue

        # 图注（形如「〔图 1：说明〕」）：居中小字灰色，紧随图片
        if re.fullmatch(r"〔图\s*\d+[:：].*〕", stripped):
            paragraph = document.add_paragraph()
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(6)
            run = paragraph.add_run(stripped)
            set_run_font(run, size=Pt(9), italic=True)
            run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
            stats["paragraphs"] += 1
            i += 1
            continue

        # 标题
        heading = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if heading:
            level = len(heading.group(1))
            text = heading.group(2).strip()
            paragraph = document.add_heading(level=level)
            add_inline(paragraph, text, size=Pt(16 if level == 1 else 13 if level == 2 else 11.5),
                       cn=HEADING_FONT_CN, base_bold=True)
            stats["headings"] += 1
            i += 1
            continue

        # 分隔线：不留空段落
        if stripped in {"---", "***", "___"}:
            i += 1
            continue

        # 引用
        if stripped.startswith(">"):
            text = stripped.lstrip(">").strip()
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.6)
            paragraph.paragraph_format.space_after = Pt(4)
            add_inline(paragraph, text, size=Pt(9.5), italic=True)
            stats["paragraphs"] += 1
            i += 1
            continue

        # 列表
        bullet = re.match(r"^[-*]\s+(.*)$", stripped)
        if bullet:
            paragraph = document.add_paragraph(style="List Bullet")
            add_inline(paragraph, bullet.group(1))
            stats["paragraphs"] += 1
            i += 1
            continue
        numbered = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if numbered:
            # **不用 Word 的自动编号**：List Number 在整篇文档里共用一个计数器，
            # 会出现「第三章的列表从 13 开始」（真实踩过）。这里手写序号 + 悬挂缩进。
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.75)
            paragraph.paragraph_format.first_line_indent = Cm(-0.75)
            add_inline(paragraph, f"{numbered.group(1)}. ")
            add_inline(paragraph, numbered.group(2))
            stats["paragraphs"] += 1
            i += 1
            continue

        if not stripped:
            i += 1
            continue

        paragraph = document.add_paragraph()
        add_inline(paragraph, stripped)
        stats["paragraphs"] += 1
        i += 1

    add_page_number_footer(document)
    docx_path.parent.mkdir(parents=True, exist_ok=True)
    document.save(docx_path)
    return stats


def add_page_number_footer(document):
    """页脚居中「第 N 页 / 共 M 页」。

    用 Word 的域代码（PAGE / NUMPAGES），在 Word/WPS 里打开会自动更新，导出 PDF 也正确。
    """
    footer = document.sections[0].footer
    paragraph = footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

    def field(run, instruction):
        begin = run._element.makeelement(qn("w:fldChar"), {qn("w:fldCharType"): "begin"})
        text = run._element.makeelement(qn("w:instrText"), {})
        text.text = instruction
        end = run._element.makeelement(qn("w:fldChar"), {qn("w:fldCharType"): "end"})
        run._element.append(begin)
        run._element.append(text)
        run._element.append(end)

    lead = paragraph.add_run("第 ")
    set_run_font(lead, size=Pt(9))
    number_run = paragraph.add_run()
    set_run_font(number_run, size=Pt(9))
    field(number_run, "PAGE")
    middle = paragraph.add_run(" 页 / 共 ")
    set_run_font(middle, size=Pt(9))
    total_run = paragraph.add_run()
    set_run_font(total_run, size=Pt(9))
    field(total_run, "NUMPAGES")
    tail = paragraph.add_run(" 页")
    set_run_font(tail, size=Pt(9))


def main() -> int:
    md_path = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/技术文档.md")
    docx_path = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/技术文档.docx")
    if not md_path.exists():
        print(f"找不到输入：{md_path}")
        return 1
    stats = build(md_path, docx_path)
    print(f"已生成 {docx_path}  ({docx_path.stat().st_size/1024:.0f} KB)")
    print(
        "统计：标题 {headings} · 表格 {tables} · 图片 {images} · 代码块 {code_blocks} · 段落 {paragraphs}".format(**stats)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
