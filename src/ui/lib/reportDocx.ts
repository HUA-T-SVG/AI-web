import type { Paragraph, Table } from 'docx';
import type { ReadableReport } from './report';
import { METHOD_DRAFT_APPENDIX_HEADING, methodDraftLines } from './methodDraft';

type DocxChild = Paragraph | Table;

/**
 * Word（.docx）报告生成。
 *
 * **为什么生成逻辑不放组件里**：组件要做的是「点一下、下载一个文件」，
 * 而生成过程需要能在 node 里被单测验证（`Packer.toBuffer` 出来的字节必须是
 * `PK` 开头的合法 zip）。塞进组件后，测试就得先造一个 DOM。
 *
 * **为什么两次动态 import**：`docx` 是首屏完全用不到的重依赖（整套 OOXML 序列化）。
 * 调用方动态 import 本模块，本模块再动态 import `docx` —— 双保险：即使将来有人
 * 在别处静态引用了本文件，也不会把 docx 拖进首屏包。
 */

/**
 * 生成 Word 文档对象（不打包）。
 *
 * 单独暴露是为了让「内容长什么样」与「怎么打包成字节」分开测：
 * 前者可以在需要时检查段落，后者只关心 PK 头。
 */
export async function createReportDocument(
  report: ReadableReport,
): Promise<import('docx').Document> {
  const docx = await import('docx');
  const children: DocxChild[] = [];

  const paragraph = (
    value: string,
    options: { bold?: boolean; size?: number; color?: string } = {},
  ): Paragraph =>
    new docx.Paragraph({
      spacing: { after: 80 },
      children: [
        new docx.TextRun({
          text: value,
          bold: options.bold,
          size: options.size,
          color: options.color,
        }),
      ],
    });

  const heading = (value: string): Paragraph =>
    new docx.Paragraph({
      text: value,
      heading: docx.HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
    });

  const table = (headers: readonly string[], rows: readonly (readonly string[])[]): Table =>
    new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      rows: [
        new docx.TableRow({
          tableHeader: true,
          children: headers.map(
            (header) =>
              new docx.TableCell({
                children: [
                  new docx.Paragraph({
                    children: [new docx.TextRun({ text: header, bold: true, size: 20 })],
                  }),
                ],
              }),
          ),
        }),
        ...rows.map(
          (cells) =>
            new docx.TableRow({
              children: cells.map(
                (cell) =>
                  new docx.TableCell({
                    children: [
                      new docx.Paragraph({
                        children: [new docx.TextRun({ text: cell, size: 20 })],
                      }),
                    ],
                  }),
              ),
            }),
        ),
      ],
    });

  // 标题 + 一句话副标题：报告单独拿出来时也知道是哪份文件、哪一版
  children.push(
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new docx.TextRun({ text: report.title, bold: true, size: 36 })],
    }),
  );
  children.push(
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new docx.TextRun({
          text: `${report.summary.isEmpty ? '未执行清洗' : `已应用 ${report.summary.actionCount} 步动作`} · ${report.generatedAtText} 生成`,
          size: 20,
          color: '595959',
        }),
      ],
    }),
  );

  children.push(heading('报告信息'));
  children.push(
    table(
      ['项目', '内容'],
      report.meta.map((row) => [row.label, row.value]),
    ),
  );
  children.push(paragraph(''));

  // 检查结论放在处理摘要之前：读者先要知道「检查到底得出了什么」，
  // 再看「这次洗了什么」。状态不是 done 时同样要占位，不能因为没结论就整段消失
  children.push(heading('一、检查结论'));
  children.push(
    paragraph(report.checks.summary, {
      bold: true,
      ...(report.checks.state === 'done' ? {} : { color: 'C00000' }),
    }),
  );
  for (const detail of report.checks.details) {
    children.push(paragraph(detail, { size: 20, color: '595959' }));
  }

  // 覆盖与能力边界紧跟在检查结论后面：只给结论的报告会被读成「检查完了、没问题」，
  // 而覆盖表要说清「查了哪些、哪里没查」。这一节始终占位，不能因为缺画像就消失。
  children.push(heading('二、检查覆盖与能力边界'));
  if (report.coverage === null) {
    children.push(
      paragraph(
        '这份报告没有拿到字段画像，因此不给出检查覆盖情况；「没有发现问题」不应被读成「所有检查通过」。',
        { color: '595959' },
      ),
    );
  } else {
    children.push(
      paragraph(report.coverage.summary, {
        bold: true,
        ...(report.coverage.trustworthy ? {} : { color: 'C00000' }),
      }),
    );
    children.push(
      table(
        ['字段', '已完成检查', '尚未覆盖'],
        [report.coverage.table, ...report.coverage.fields].map((row) => [
          `${row.column}（${row.typeLabel}）`,
          row.completedText,
          row.gapsText,
        ]),
      ),
    );
    children.push(paragraph(report.coverage.note, { size: 18, color: '595959' }));
  }

  children.push(heading('三、处理摘要'));
  const summary = report.summary;
  children.push(paragraph(`已应用动作：${summary.actionCount} 步`));
  children.push(
    paragraph(
      `改动单元格：${summary.changedCells} 个` +
        (summary.deletedRows > 0 ? `；删除行：${summary.deletedRows} 行` : ''),
    ),
  );
  children.push(
    paragraph(
      `数据规模：${summary.beforeRowCount} 行 × ${summary.beforeColumnCount} 列` +
        ` → ${summary.afterRowCount} 行 × ${summary.afterColumnCount} 列` +
        `（行数变化 ${describeRowDelta(summary.rowDelta)}）`,
    ),
  );
  if (summary.isEmpty) {
    children.push(paragraph('本轮没有执行清洗动作，数据保持原样。', { color: '595959' }));
  }

  children.push(heading('四、清洗前后字段变化'));
  if (summary.isEmpty) {
    children.push(paragraph('本轮没有执行清洗动作，数据保持原样。', { color: '595959' }));
  } else if (report.fieldChanges.length === 0) {
    children.push(
      paragraph('动作已执行，但字段统计没有变化（例如只记录了复核决定）—— 不把它写成「已优化」。', {
        color: '595959',
      }),
    );
  } else {
    children.push(
      table(
        ['字段', '缺失数（前 → 后）', '不同取值数（前 → 后）'],
        report.fieldChanges.map((change) => [
          change.name,
          `${change.missingBefore} → ${change.missingAfter}`,
          `${change.uniqueBefore} → ${change.uniqueAfter}`,
        ]),
      ),
    );
    children.push(
      paragraph('只列出统计上确实发生变化的字段；没有变化的字段不会被写成改善。', {
        size: 18,
        color: '595959',
      }),
    );
  }

  children.push(heading('五、逐步动作'));
  if (report.steps.length === 0) {
    children.push(paragraph('本次会话还没有执行任何清洗动作。', { color: '595959' }));
  } else {
    children.push(
      table(
        ['序号', '时间（UTC）', '动作（涉及列）', '参数', '影响'],
        report.steps.map((step) => [
          String(step.index + 1),
          step.appliedAtText,
          `${step.actionText}（${step.targetColumnsText}）`,
          step.paramsText,
          step.impactText,
        ]),
      ),
    );
  }

  children.push(heading('六、人工决定与理由'));
  if (report.decisions.length === 0) {
    children.push(paragraph('本次分析没有留下人工决定记录。', { color: '595959' }));
  } else {
    for (const decision of report.decisions) {
      children.push(
        new docx.Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new docx.TextRun({
              text: `${decision.title}（${decision.severityText}）`,
              bold: true,
            }),
          ],
        }),
      );
      children.push(paragraph(`人工决定：${decision.decisionText}`));
      children.push(
        paragraph(
          `AI 建议：${decision.suggestionActionText}；参数 ${decision.suggestionParamsText}；` +
            `建议理由：${decision.rationale}`,
          { size: 20 },
        ),
      );
      children.push(paragraph(`用户理由：${decision.note}`));
      if (decision.adjustmentText !== null) {
        children.push(paragraph(decision.adjustmentText));
      }
    }
  }

  children.push(heading('七、遗留风险'));
  children.push(paragraph(report.risks.summary));
  for (const risk of report.risks.pending) {
    children.push(paragraph(`待确认：${risk.title}（${risk.severityText}）`));
  }
  for (const risk of report.risks.rejected) {
    children.push(
      paragraph(`已拒绝：${risk.title}（${risk.severityText}），保留原值。用户理由：${risk.note}`),
    );
  }
  for (const risk of report.risks.skipped) {
    children.push(paragraph(`未执行：${risk.actionText} —— ${risk.reason}`));
  }

  children.push(heading('八、版本与口径'));
  if (report.staleNotices.length === 0) {
    children.push(paragraph('报告里的结论与当前数据版本一致。'));
  } else {
    for (const notice of report.staleNotices) {
      children.push(paragraph(notice, { bold: true }));
    }
  }
  children.push(paragraph(report.sourceNote, { size: 18, color: '595959' }));

  // 方法草稿放**末尾附录**，不插进一~八章：插进去就要给后面的章节全部重编号，
  // 报告里被引用过的「见 §四」会指错。附录里的免责声明用警示色，避免被当成正式定稿。
  children.push(heading(METHOD_DRAFT_APPENDIX_HEADING));
  for (const line of methodDraftLines(report.methodDraft)) {
    if (line.kind === 'title') {
      children.push(paragraph(line.text, { bold: true, size: 24 }));
    } else if (line.kind === 'heading') {
      children.push(paragraph(line.text, { bold: true }));
    } else if (line.kind === 'disclaimer') {
      children.push(paragraph(line.text, { size: 18, color: 'C00000' }));
    } else if (line.kind === 'caveat') {
      children.push(paragraph(`· ${line.text}`, { size: 18, color: '595959' }));
    } else {
      children.push(paragraph(line.text, { size: 20 }));
    }
  }

  return new docx.Document({
    title: report.title,
    creator: '科研数据质量治理 Agent',
    description: `数据处理质量报告 · ${report.sourceFileName} · v${report.dataVersion}`,
    styles: {
      default: {
        document: {
          // 中文报告中文字体要显式指定，否则部分 Word 会用西文默认字体渲染中文
          run: { font: '宋体', size: 21 },
          paragraph: { spacing: { line: 300 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, right: 1134, bottom: 1440, left: 1134 } },
        },
        children,
      },
    ],
  });
}

/** 浏览器端下载用 Blob。 */
export async function buildReportDocxBlob(report: ReadableReport): Promise<Blob> {
  const { Packer } = await import('docx');
  const document = await createReportDocument(report);
  return Packer.toBlob(document);
}

/**
 * 字节输出。node 单测用它断言 `PK` 头；浏览器端也能用（docx 自带 buffer 兜底），
 * 但下载路径优先 `buildReportDocxBlob`，省一次从 Buffer 到 Blob 的拷贝。
 */
export async function buildReportDocx(report: ReadableReport): Promise<Uint8Array> {
  const { Packer } = await import('docx');
  const document = await createReportDocument(report);
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}

function describeRowDelta(delta: number): string {
  if (delta === 0) return '不变';
  return delta > 0 ? `+${delta}` : String(delta);
}
