/** Menu actions for a page, shared by the sidebar and the title bar. */

import { api } from './api';
import { toMarkdown, type JNode } from './markdown';
import { store } from './store.svelte';
import { ui, type MenuItem } from './ui.svelte';

/** Saves the open editor and returns the page as Markdown. */
async function pageMarkdown(id: string): Promise<{ title: string; markdown: string }> {
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
  const markdown = toMarkdown(doc, page.title, (pid) => store.byId.get(pid)?.title || 'Untitled');
  return { title: page.title || 'Untitled', markdown };
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
    {
      label: 'Export to Downloads',
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
