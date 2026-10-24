/** Menus for live sessions: what a friend's menu offers, and picking the page for a request. */

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

/** What a friend's menu offers for writing together. */
export function friendLiveItems(f: Friend): MenuItem[] {
  const page = store.view === 'page' ? store.current : null;
  const items: MenuItem[] = [];
  if (shareable(page)) items.push({ label: `Invite to “${page.title || 'Untitled'}”`, icon: 'user', action: () => inviteFriend(f, page.id) });
  items.push({
    label: 'Ask to Write Together',
    icon: 'user',
    action: () => void cowork.ask(f).then(() => ui.toast(`Asked ${nameOf(f)} to write together`), say),
  });
  return items;
}

/** Accepting someone's request: which of your pages to write on (the open
 *  one, a new one, or a recent one). Only that page is shared. */
export function choosePage(row: LiveSession, anchor: Element) {
  const name = cowork.otherName(row);
  const share = (pageId: string) => void cowork.share(row, pageId).catch(say);
  const open = store.view === 'page' ? store.current : null;
  const recent: PageMeta[] = [];
  for (const p of store.all) {
    if (!shareable(p) || p.id === open?.id) continue;
    recent.push(p);
    recent.sort((a, b) => b.updatedAt - a.updatedAt);
    if (recent.length > 6) recent.pop();
  }
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
