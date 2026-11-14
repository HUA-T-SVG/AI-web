import { expect, test, type Page } from '@playwright/test';
import type { DictionaryCandidate } from '../../src/agent/shared/dataDictionary';
import { blockSemanticModelDownload, gotoHydrated } from './helpers';

async function openDictionary(page: Page) {
  await blockSemanticModelDownload(page);
  await gotoHydrated(page, '/import');
  await page.setInputFiles('input[type=file]', {
    name: 'dictionary-sample.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('记录,成绩\nLOCAL-ROW-ONLY,70\nb,80\nc,90\nd,999\n', 'utf8'),
  });
  await expect(page.getByText('数据预览')).toBeVisible();
  await page.getByRole('link', { name: '质量检查' }).first().click();
  const panel = page.getByTestId('data-dictionary');
  await panel.locator('summary').click();
  return panel;
}

test('数据字典先核对再执行：只发送字典和列名，范围检查发现异常，缺失码只试算', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const rangeQuote = '考试得分：允许范围 0–100 分。';
  const codeQuote = '成绩：999 表示缺考。';
  const text = `${rangeQuote}\n${codeQuote}`;
  const candidates: DictionaryCandidate[] = [
    { field: '考试得分', quote: rangeQuote, kind: 'range', min: 0, max: 100 },
    { field: '成绩', quote: codeQuote, kind: 'missing-code', code: '999' },
  ];
  await page.route('**/api/data-dictionary', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ text, columns: ['记录', '成绩'] });
    await route.fulfill({ json: { candidates } });
  });
  const panel = await openDictionary(page);
  await panel.getByRole('textbox', { name: '数据字典文本' }).fill(text);
  await panel.getByRole('button', { name: 'AI 提取候选规则' }).click();

  const range = panel.getByTestId('dictionary-candidate').filter({ hasText: rangeQuote });
  const code = panel.getByTestId('dictionary-candidate').filter({ hasText: codeQuote });
  await expect(range).toContainText('未找到同名列');
  await expect(range.getByRole('checkbox', { name: '选中此规则' })).toBeDisabled();
  await expect(code.getByRole('checkbox', { name: '选中此规则' })).not.toBeChecked();
  const apply = panel.getByRole('button', { name: '确认并应用所选规则' });
  await expect(apply).toBeDisabled();
  await expect(page.getByTestId('issue-card').filter({ hasText: '「成绩」有 1 个取值超出合理范围' })).toHaveCount(0);

  await range.getByRole('combobox', { name: '对应的数据列' }).selectOption('成绩');
  await range.getByRole('checkbox', { name: '选中此规则' }).check();
  await code.getByRole('checkbox', { name: '选中此规则' }).check();
  await apply.click();
  await expect(panel.getByTestId('dictionary-success')).toContainText('已保存 1 条检查规则、1 个占位码');
  await expect(page.getByTestId('issue-card').filter({ hasText: '「成绩」有 1 个取值超出合理范围' })).toBeVisible();

  const savedCode = panel.getByTestId('dictionary-code');
  await savedCode.getByRole('button', { name: '试算缺失口径' }).click();
  const preview = savedCode.getByTestId('dictionary-code-preview');
  await expect(preview).toContainText('本地匹配 1 行');
  await expect(preview.getByRole('row', { name: /保留原值/ })).toContainText('0%');
  await expect(preview.getByRole('row', { name: /转为缺失/ })).toContainText('25%');
  await expect(savedCode.getByRole('button', { name: '采用此口径' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('issue-card').filter({ hasText: '「成绩」有 1 个取值超出合理范围' })).toBeVisible({ timeout: 30_000 });
  await panel.locator('summary').click();
  await expect(savedCode).toContainText('「999」');
  await savedCode.getByRole('button', { name: '移除占位码' }).click();
  await expect(savedCode).toHaveCount(0);
});

test('不允许应用假原文或冲突规则，替换原有范围需要明确确认', async ({ page }) => {
  const first = '成绩：允许范围 0–100 分。';
  const second = '成绩：允许范围 0–1000 分。';
  const forged = '成绩：允许范围 0–2000 分。';
  const conflictCode = '成绩：999 表示缺考。';
  await page.route('**/api/data-dictionary', async (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    const candidates: DictionaryCandidate[] = text === conflictCode
      ? [{ field: '成绩', quote: conflictCode, kind: 'missing-code', code: '999' }]
      : [
      { field: '成绩', quote: first, kind: 'range', min: 0, max: 100 },
      ...(text === first ? [] : [
        { field: '成绩', quote: second, kind: 'range' as const, min: 0, max: 1000 },
        { field: '成绩', quote: forged, kind: 'range' as const, min: 0, max: 2000 },
      ]),
    ];
    await route.fulfill({ json: { candidates } });
  });
  const panel = await openDictionary(page);
  const input = panel.getByRole('textbox', { name: '数据字典文本' });
  const extract = panel.getByRole('button', { name: 'AI 提取候选规则' });
  const candidateCheck = (quote: string) => panel.getByTestId('dictionary-candidate').filter({ hasText: quote })
    .getByRole('checkbox', { name: '选中此规则' });
  const apply = panel.getByRole('button', { name: '确认并应用所选规则' });
  const outOfRange = page.getByTestId('issue-card').filter({ hasText: '「成绩」有 1 个取值超出合理范围' });

  await input.fill(first);
  await extract.click();
  await candidateCheck(first).check();
  await apply.click();
  await expect(outOfRange).toBeVisible();

  await input.fill(`${first}\n${second}`);
  await extract.click();
  await expect(candidateCheck(forged)).toBeDisabled();
  await candidateCheck(first).check();
  await candidateCheck(second).check();
  await expect(panel.getByTestId('dictionary-conflict')).toBeVisible();
  await expect(apply).toBeDisabled();
  await candidateCheck(first).uncheck();
  await expect(apply).toBeDisabled();
  await expect(outOfRange).toBeVisible();
  await panel.getByRole('checkbox', { name: '确认替换已有设置' }).check();
  await apply.click();
  await expect(panel.getByTestId('dictionary-success')).toBeVisible();
  await expect(outOfRange).toHaveCount(0);

  await input.fill(conflictCode);
  await extract.click();
  await candidateCheck(conflictCode).check();
  await expect(panel.getByTestId('dictionary-saved-conflict')).toContainText('当前检查规则将「999」视为有效值');
  await expect(apply).toBeDisabled();
});
