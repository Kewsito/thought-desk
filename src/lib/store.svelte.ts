/** Page tree state and every action that changes it. */

import { api } from './api';
import { prefs } from './prefs.svelte';
import { ui } from './ui.svelte';
import type { PageMeta, PagePatch } from './types';

const SAVE_DELAY = 400;

function applyLocal(page: PageMeta, patch: PagePatch) {
  if (patch.title !== undefined) page.title = patch.title;
  if (patch.icon !== undefined) page.icon = patch.icon;
  if (patch.fullWidth !== undefined) page.fullWidth = patch.fullWidth;
  if (patch.favorite !== undefined && !!page.favorite !== patch.favorite) {
    page.favorite = patch.favorite ? Date.now() : 0;
  }
}

class Store {
  pages = $state<PageMeta[]>([]);
  loaded = $state(false);
  currentId = $state<string | null>(null);
  saving = $state(false);
  #history = $state<string[]>([]);
  #historyIndex = $state(-1);

  byId = $derived(new Map(this.pages.map((p) => [p.id, p])));

  /** Live pages grouped by parent id ('' = top level), in sibling order. */
  childrenMap = $derived.by(() => {
    const map = new Map<string, PageMeta[]>();
    for (const p of this.pages) {
      if (p.deletedAt) continue;
      const key = p.parentId ?? '';
      let list = map.get(key);
      if (!list) map.set(key, (list = []));
      list.push(p);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  });

  roots = $derived(this.childrenMap.get('') ?? []);

  favorites = $derived(
    this.pages.filter((p) => p.favorite && !p.deletedAt).sort((a, b) => a.favorite - b.favorite),
  );

  /** Trashed pages that were deleted on their own (not along with a parent). */
  trash = $derived(
    this.pages
      .filter((p) => {
        if (!p.deletedAt) return false;
        const parent = p.parentId ? this.byId.get(p.parentId) : undefined;
        return !parent || parent.deletedAt !== p.deletedAt;
      })
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
  );

  current = $derived(this.currentId ? (this.byId.get(this.currentId) ?? null) : null);
  canGoBack = $derived(this.#historyIndex > 0);
  canGoForward = $derived(this.#historyIndex < this.#history.length - 1);

  children(id: string | null): PageMeta[] {
    return this.childrenMap.get(id ?? '') ?? [];
  }

  /** Ancestors from the top level down to (not including) the page. */
  ancestors(id: string): PageMeta[] {
    const out: PageMeta[] = [];
    let p = this.byId.get(id);
    const seen = new Set<string>();
    while (p?.parentId && !seen.has(p.parentId)) {
      seen.add(p.parentId);
      p = this.byId.get(p.parentId);
      if (p) out.unshift(p);
    }
    return out;
  }

  isInside(id: string, ancestorId: string): boolean {
    return id === ancestorId || this.ancestors(id).some((a) => a.id === ancestorId);
  }

  // ---------------------------------------------------------------- loading

  async load() {
    this.pages = await api.listPages();
    this.loaded = true;
    // Forget expanded state of pages that no longer exist.
    for (const id of Object.keys(prefs.expanded)) {
      if (!this.byId.has(id)) delete prefs.expanded[id];
    }
    const last = prefs.lastPageId ? this.byId.get(prefs.lastPageId) : undefined;
    const start = last && !last.deletedAt ? last : this.roots[0];
    if (start) this.open(start.id);
  }

  /** Reloads the page list, keeping local edits that aren't saved yet. */
  async refresh() {
    await this.#chain;
    const pages = await api.listPages();
    for (const p of pages) {
      const patch = this.#pending.get(p.id);
      if (patch) applyLocal(p, patch);
    }
    this.pages = pages;
  }

  // ------------------------------------------------------------- navigation

  open(id: string, { push = true }: { push?: boolean } = {}) {
    const page = this.byId.get(id);
    if (!page || page.deletedAt) return;
    if (this.currentId === id) return;
    this.currentId = id;
    prefs.lastPageId = id;
    // Reveal the page in the sidebar.
    for (const a of this.ancestors(id)) prefs.expanded[a.id] = true;
    if (push) {
      const next = this.#history.slice(0, this.#historyIndex + 1);
      next.push(id);
      if (next.length > 100) next.shift();
      this.#history = next;
      this.#historyIndex = next.length - 1;
    }
  }

  back() {
    this.#step(-1);
  }

  forward() {
    this.#step(1);
  }

  #step(dir: 1 | -1) {
    let i = this.#historyIndex + dir;
    while (i >= 0 && i < this.#history.length) {
      const p = this.byId.get(this.#history[i]);
      if (p && !p.deletedAt) {
        this.#historyIndex = i;
        this.open(p.id, { push: false });
        return;
      }
      i += dir;
    }
  }

  /** After the current page disappears, land somewhere sensible. */
  #leave(removedId: string) {
    if (!this.currentId || !this.isInside(this.currentId, removedId)) return;
    const removed = this.byId.get(removedId);
    const parent = removed?.parentId ? this.byId.get(removed.parentId) : undefined;
    const fallback =
      parent && !parent.deletedAt
        ? parent
        : this.roots.find((p) => p.id !== removedId && !p.deletedAt);
    this.currentId = null;
    if (fallback) this.open(fallback.id);
  }

  // ---------------------------------------------------------------- editing

  async create(parentId: string | null = null, opts: { index?: number; open?: boolean; title?: string } = {}) {
    try {
      const meta = await api.createPage(parentId, opts.index ?? null, opts.title ?? '');
      await this.refresh();
      if (parentId) prefs.expanded[parentId] = true;
      if (opts.open !== false) {
        this.open(meta.id);
        ui.focusTitle = meta.id;
      }
      return meta;
    } catch (e) {
      ui.error(e);
      return null;
    }
  }

  // Pending writes are merged per page and flushed together.
  #pending = new Map<string, PagePatch>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #chain: Promise<void> = Promise.resolve();

  /** Updates a page locally right away and persists it shortly after. */
  update(id: string, patch: PagePatch, { immediate = false } = {}) {
    const page = this.byId.get(id);
    if (page) applyLocal(page, patch);
    this.#pending.set(id, { ...this.#pending.get(id), ...patch });
    clearTimeout(this.#timer);
    if (immediate) void this.flush();
    else this.#timer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  /** Writes all pending changes. Safe to call at any time. */
  flush(): Promise<void> {
    clearTimeout(this.#timer);
    if (this.#pending.size === 0) return this.#chain;
    const batch = [...this.#pending];
    this.#pending.clear();
    this.saving = true;
    this.#chain = this.#chain.then(async () => {
      for (const [id, patch] of batch) {
        try {
          const updatedAt = await api.updatePage(id, patch);
          const page = this.byId.get(id);
          if (page) page.updatedAt = updatedAt;
        } catch (e) {
          // The page may have been deleted meanwhile; nothing to save then.
          if (this.byId.has(id)) ui.error(e);
        }
      }
      if (this.#pending.size === 0) this.saving = false;
    });
    return this.#chain;
  }

  async move(id: string, parentId: string | null, index: number) {
    if (parentId && this.isInside(parentId, id)) return;
    try {
      await this.flush();
      await api.movePage(id, parentId, index);
      await this.refresh();
      if (parentId) prefs.expanded[parentId] = true;
    } catch (e) {
      ui.error(e);
    }
  }

  async duplicate(id: string) {
    try {
      await this.flush();
      const meta = await api.duplicatePage(id);
      await this.refresh();
      this.open(meta.id);
    } catch (e) {
      ui.error(e);
    }
  }

  async trashPage(id: string) {
    const page = this.byId.get(id);
    if (!page) return;
    try {
      await this.flush();
      await api.trashPage(id);
      this.#leave(id);
      await this.refresh();
      ui.toast(`Moved “${page.title || 'Untitled'}” to trash`, {
        label: 'Undo',
        run: () => void this.restore(id),
      });
    } catch (e) {
      ui.error(e);
    }
  }

  async restore(id: string) {
    try {
      await api.restorePage(id);
      await this.refresh();
      this.open(id);
    } catch (e) {
      ui.error(e);
    }
  }

  async deleteForever(id: string) {
    const page = this.byId.get(id);
    const ok = await ui.confirm({
      title: 'Delete permanently?',
      message: `“${page?.title || 'Untitled'}” and its sub-pages will be gone for good.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePage(id);
      await this.refresh();
    } catch (e) {
      ui.error(e);
    }
  }

  async emptyTrash() {
    if (this.trash.length === 0) return;
    const ok = await ui.confirm({
      title: 'Empty trash?',
      message: `${this.trash.length} page${this.trash.length === 1 ? '' : 's'} will be permanently deleted.`,
      confirmLabel: 'Empty trash',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.emptyTrash();
      await this.refresh();
    } catch (e) {
      ui.error(e);
    }
  }

  toggleFavorite(id: string) {
    const page = this.byId.get(id);
    if (page) this.update(id, { favorite: !page.favorite }, { immediate: true });
  }
}

export const store = new Store();
