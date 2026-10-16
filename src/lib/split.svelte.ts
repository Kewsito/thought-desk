/**
 * Split view: a second page beside the main one. The main side works as
 * always (sidebar, search and links open there); the side pane shows one
 * page or database, chosen with Alt+click, "Open to the Side" or its own
 * picker. What it shows and how wide it is are remembered.
 */

import { prefs } from './prefs.svelte';
import { store } from './store.svelte';

export const MIN_RATIO = 0.25;
export const MAX_RATIO = 0.75;

class Split {
  get open() {
    return prefs.splitOpen;
  }

  /** The page in the side pane, if it still exists. */
  get pageId(): string | null {
    const id = prefs.splitPageId;
    const page = id ? store.byId.get(id) : undefined;
    return page && !page.deletedAt ? page.id : null;
  }

  /** Whether the side pane would show what the main side already shows. */
  get duplicate() {
    return store.view === 'page' && !!this.pageId && this.pageId === store.currentId;
  }

  get ratio() {
    return prefs.splitRatio;
  }
  set ratio(r: number) {
    prefs.splitRatio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
  }

  /** Opens `id` beside the main page. */
  show(id: string) {
    prefs.splitPageId = id;
    prefs.splitOpen = true;
  }

  /** Empties the side pane, back to its picker. */
  clear() {
    prefs.splitPageId = null;
  }

  toggle() {
    prefs.splitOpen = !prefs.splitOpen;
  }

  close() {
    prefs.splitOpen = false;
  }

  /** The side page moves over to the main side, and the split closes. */
  expand() {
    const id = this.pageId;
    prefs.splitOpen = false;
    if (id) store.open(id);
  }

  /** The two sides trade places. */
  swap() {
    const side = this.pageId;
    const main = store.view === 'page' ? store.currentId : null;
    prefs.splitPageId = main;
    if (side) store.open(side);
  }
}

export const split = new Split();
