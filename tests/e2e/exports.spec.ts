// Exports: what goes into a PDF, CSV and Markdown. (The files themselves are
// written by the Rust side, so here the layout and text going into them is
// checked.)
import { test, expect, open } from './fixtures';

test.use({ viewport: { width: 1360, height: 820 } });

test('a PDF prints the page, even with a page open beside it', async ({ page }) => {
  await open(page);
  await page.click('[role=tree][aria-label=Pages] .row >> text=Getting started');
  await page.locator('[role=tree][aria-label=Pages] .row', { hasText: 'Projects' }).first().click({ modifiers: ['Alt'] });
  await expect(page.locator('.side .pane')).toHaveCount(1);
  // What Export as PDF does before printing.
  await page.evaluate(() => document.documentElement.classList.add('printing'));
  await page.emulateMedia({ media: 'print' });
  const shown = (sel: string) => page.locator(sel).first().evaluate((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed' ? el.getBoundingClientRect().height > 0 && el.getClientRects().length > 0 : false);
  expect(await shown('.panes'), 'the pane holding the page').toBe(true);
  expect(await shown('.scroller .page .ProseMirror'), 'the page itself').toBe(true);
  expect(await shown('.side'), 'the side pane').toBe(false);
  expect(await shown('.sidebar'), 'the sidebar').toBe(false);
  await expect(page.locator('.scroller .page .ProseMirror')).toContainText('Try it');
});

test('CSV guards formulas, and Markdown fences code with backticks in it', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(async () => {
    const csv = await import('/src/lib/db/csv.ts' as string);
    const md = await import('/src/lib/markdown.ts' as string);
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fence with ' }, { type: 'text', text: '```', marks: [{ type: 'code' }] }] }] };
    return {
      guarded: ['=SUM(A1)', '+1 more', '-3', '-3.5', '@home', 'plain', '-x'].map(csv.guardCell),
      back: csv.unguardCell("'=SUM(A1)"),
      md: md.toMarkdown(doc, '', () => ''),
    };
  });
  expect(out.guarded).toEqual(["'=SUM(A1)", "'+1 more", '-3', '-3.5', "'@home", 'plain', "'-x"]);
  expect(out.back).toBe('=SUM(A1)');
  expect(out.md).toContain('Fence with ```` ``` ````');
});
