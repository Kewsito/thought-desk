/** Menus for live sessions: writing with a friend (from the Friends page), and picking the page for a request. */

import { cowork } from './cowork.svelte';
import { nameOf } from './friends.svelte';
import { store } from './store.svelte';
import { ui, type MenuItem } from './ui.svelte';
import type { Friend, LiveSession } from './cloud';
import type { PageMeta } from './types';

/** Pages that can be written together: ordinary pages that aren't live already. */
const shareable = (p: PageMeta | null | undefined): p is PageMeta => !!p && !p.deletedAt && p.kind !== 'database' && !store.isRow(p) && !p.sharedRoom;

const say = (e: unknown) => ui.toast(e instanceof Error ? e.message : String(e));

/** Invites a friend to a page, saying how it went. */
export function inviteFriend(f: Friend, pageId: string) {
  const title = store.byId.get(pageId)?.title || 'Untitled';
  cowork.invite(f, pageId).then(() => ui.toast(`Invited ${nameOf(f)} to “${title}”`), say);
}

/** The pages most recently changed that could be written together. */
function recentPages(except?: string): PageMeta[] {
  const recent: PageMeta[] = [];
  for (const p of store.all) {
    if (!shareable(p) || p.id === except) continue;
    recent.push(p);
    recent.sort((a, b) => b.updatedAt - a.updatedAt);
    if (recent.length > 6) recent.pop();
  }
  return recent;
}

/** Writing with a friend from the Friends page: invite them to the page you
 *  were just on, a new one or a recent one of yours, or ask them to pick one
 *  of theirs. */
export function writeWithMenu(f: Friend, anchor: Element) {
  const last = shareable(store.lastPage) ? store.lastPage : null;
  const page = (p: PageMeta, hint?: string): MenuItem => ({ label: p.title || 'Untitled', icon: 'page', hint, action: () => inviteFriend(f, p.id) });
  const items: MenuItem[] = [
    { header: `Write with ${nameOf(f)} on…` },
    ...(last ? [page(last, 'just open')] : []),
    {
      label: 'A New Page',
      icon: 'page-plus',
      action: async () => {
        const made = await store.create(null, { title: `With ${nameOf(f)}`, open: false });
        if (made) inviteFriend(f, made.id);
      },
    },
    ...recentPages(last?.id).map((p) => page(p)),
    { separator: true },
    { label: 'One of Their Pages', icon: 'user', hint: 'they choose', action: () => void cowork.ask(f).then(() => ui.toast(`Asked ${nameOf(f)} to write together`), say) },
  ];
  ui.openMenuAt(anchor, items);
}

/** Accepting someone's request: which of your pages to write on (the open
 *  one, a new one, or a recent one). Only that page is shared. */
export function choosePage(row: LiveSession, anchor: Element) {
  const name = cowork.otherName(row);
  const share = (pageId: string) => void cowork.share(row, pageId).catch(say);
  const open = store.view === 'page' ? store.current : null;
  const recent = recentPages(open?.id);
  const items: MenuItem[] = [{ header: `Write with ${name} on…` }];
  if (shareable(open)) items.push({ label: open.title || 'Untitled', icon: 'page', hint: 'open now', action: () => share(open.id) });
  items.push({
    label: 'A New Page',
    icon: 'page-plus',
    action: async () => {
      const made = await store.create(null, { title: `With ${name}`, open: false });
      if (made) share(made.id);
    },
  });
  if (recent.length) items.push({ separator: true }, ...recent.map((p): MenuItem => ({ label: p.title || 'Untitled', icon: 'page', action: () => share(p.id) })));
  ui.openMenuAt(anchor, items);
}
