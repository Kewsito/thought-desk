/** Menu actions for a page, shared by the sidebar and the title bar. */

import { api } from './api';
import { toMarkdown, type JNode } from './markdown';
import { titleOf } from './editor/page-link';
import { store } from './store.svelte';
import { ui, type MenuItem } from './ui.svelte';
import { toDocx } from './docx';
import { exportImage } from './export-images';
import { cards } from './cards.svelte';

/** Saves the open editor and returns the page's document. */
async function pageDoc(id: string): Promise<{ title: string; doc: JNode }> {
  window.dispatchEvent(new Event('td:flush'));
  await store.flush();
  const page = await api.getPage(id);
  let doc: JNode = { type: 'doc', content: [] };
  try {
    doc = JSON.parse(page.content);
  } catch {
    // Never-edited seeded page (HTML): export it as plain text instead.
    const div = document.createElement('div');
    div.innerHTML = page.content;
    doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: div.textContent ?? '' }] }] };
  }
  return { title: page.title || 'Untitled', doc };
}

async function pageMarkdown(id: string): Promise<{ title: string; markdown: string }> {
  const { title, doc } = await pageDoc(id);
  return { title, markdown: toMarkdown(doc, title, titleOf) };
}

/** Writes the page as a Word document in Downloads. */
export async function exportWord(id: string) {
  try {
    const { title, doc } = await pageDoc(id);
    const bytes = await toDocx(doc, title, { titleOf, image: exportImage });
    const path = await api.exportDocument(title, 'docx', bytes);
    ui.toast(`Saved ${path.split(/[\\/]/).pop()} to Downloads`);
  } catch (e) {
    ui.error(e);
  }
}

/**
 * Opens the print dialog for the page (choose "Save as PDF"). The page is
 * shown on its own, in light colours, and the PDF is named after it.
 */
export async function exportPdf(id: string) {
  const page = store.byId.get(id);
  if (!page) return;
  if (store.currentId !== id || store.view !== 'page') {
    store.open(id);
    // Wait for the page to load and render.
    for (let i = 0; i < 40 && !document.querySelector('.page .ProseMirror'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 150));
  }
  window.dispatchEvent(new Event('td:flush'));
  const root = document.documentElement;
  const theme = root.dataset.theme;
  const title = document.title;
  root.dataset.theme = 'light';
  root.classList.add('printing');
  document.title = page.title || 'Untitled';
  const restore = () => {
    root.dataset.theme = theme;
    root.classList.remove('printing');
    document.title = title;
  };
  try {
    await api.printPage().catch(() => window.print());
  } finally {
    // The print dialog may return before printing finishes; "afterprint" is
    // the reliable signal, with a timeout in case it never comes.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', finish);
      restore();
    };
    window.addEventListener('afterprint', finish);
    setTimeout(finish, 60_000);
  }
}

export function pageMenuItems(id: string, opts: { words?: number; sidebar?: boolean } = {}): MenuItem[] {
  const page = store.byId.get(id);
  if (!page) return [];
  const items: MenuItem[] = [
    {
      label: page.favorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: 'star',
      action: () => store.toggleFavorite(id),
    },
  ];
  if (opts.sidebar) {
    items.push(
      { label: 'Add Subpage', icon: 'page-plus', action: () => void store.create(id) },
      {
        label: 'Rename',
        icon: 'pencil',
        action: () => {
          store.open(id);
          ui.focusTitle = id;
        },
      },
    );
  }
  items.push({ label: 'Duplicate', icon: 'copy', action: () => void store.duplicate(id) });
  const deck = cards.deck(id);
  if (deck) {
    items.push({ label: `Study ${deck.cards.length} Flashcard${deck.cards.length === 1 ? '' : 's'}`, icon: 'cards', action: () => void cards.study([id], page.title || 'Untitled', { all: !(deck.due + deck.fresh) }) });
  }
  if (!opts.sidebar) {
    items.push({
      label: 'Full Width',
      icon: 'width',
      checked: page.fullWidth,
      action: () => store.update(id, { fullWidth: !page.fullWidth }, { immediate: true }),
    });
  }
  items.push(
    { separator: true },
    {
      label: 'Copy as Markdown',
      icon: 'copy',
      action: async () => {
        try {
          const { markdown } = await pageMarkdown(id);
          await navigator.clipboard.writeText(markdown);
          ui.toast('Copied as Markdown');
        } catch (e) {
          ui.error(e);
        }
      },
    },
    { label: 'Export as PDF…', icon: 'file-text', action: () => void exportPdf(id) },
    { label: 'Export as Word', icon: 'file', action: () => void exportWord(id) },
    {
      label: 'Export as Markdown',
      icon: 'download',
      action: async () => {
        try {
          const { title, markdown } = await pageMarkdown(id);
          const path = await api.exportMarkdown(title, markdown);
          ui.toast(`Saved ${path.split(/[\\/]/).pop()} to Downloads`);
        } catch (e) {
          ui.error(e);
        }
      },
    },
    { separator: true },
    { label: 'Move to Trash', icon: 'trash', danger: true, action: () => void store.trashPage(id) },
  );
  if (opts.words !== undefined) {
    items.push({ separator: true }, { header: `${opts.words.toLocaleString()} words · created ${new Date(page.createdAt).toLocaleDateString()}` });
  }
  return items;
}
