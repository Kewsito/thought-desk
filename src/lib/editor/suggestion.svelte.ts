/** Shared popup renderer for "/" commands and "@" page links. */

import type { Editor, Range } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';
import SuggestionList from './SuggestionList.svelte';

export interface MenuEntry {
  id: string;
  title: string;
  description?: string;
  /** Icon name, short text label, or emoji for the glyph box. */
  icon?: string;
  label?: string;
  emoji?: string;
  hint?: string;
  group?: string;
  keywords?: string;
  run: (editor: Editor, range: Range) => void;
}

export interface SuggestionState {
  items: MenuEntry[];
  selected: number;
  rect: DOMRect | null;
  empty: string;
  pick: (index: number) => void;
}

export function suggestionRenderer(empty: string) {
  return () => {
    let target: HTMLDivElement | null = null;
    let component: ReturnType<typeof mount> | null = null;
    let command: ((item: MenuEntry) => void) | null = null;

    const ctl: SuggestionState = $state({
      items: [],
      selected: 0,
      rect: null,
      empty,
      pick: (i: number) => {
        const item = ctl.items[i];
        if (item && command) command(item);
      },
    });

    const sync = (props: SuggestionProps<MenuEntry, MenuEntry>) => {
      command = props.command;
      const changed = props.items.length !== ctl.items.length || props.items.some((it, i) => it.id !== ctl.items[i]?.id);
      ctl.items = props.items;
      if (changed) ctl.selected = 0;
      ctl.rect = props.clientRect?.() ?? null;
    };

    return {
      onStart(props: SuggestionProps<MenuEntry, MenuEntry>) {
        target = document.createElement('div');
        document.body.appendChild(target);
        component = mount(SuggestionList, { target, props: { ctl } });
        sync(props);
      },
      onUpdate(props: SuggestionProps<MenuEntry, MenuEntry>) {
        sync(props);
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        const n = ctl.items.length;
        if (event.key === 'ArrowDown') {
          if (n) ctl.selected = (ctl.selected + 1) % n;
          return true;
        }
        if (event.key === 'ArrowUp') {
          if (n) ctl.selected = (ctl.selected - 1 + n) % n;
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          if (!n) return false;
          ctl.pick(ctl.selected);
          return true;
        }
        return false;
      },
      onExit() {
        if (component) void unmount(component);
        target?.remove();
        component = null;
        target = null;
      },
    };
  };
}

/** Lowercases and drops punctuation/spaces, so "todo" matches "To-do". */
const squash = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

function isSubsequence(needle: string, hay: string) {
  let i = 0;
  for (const c of hay) if (c === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

/** Ranks entries by how well their title/keywords match the query. */
export function rank<T extends { title: string; keywords?: string }>(items: T[], query: string, limit = 50): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const sq = squash(q);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    const words = `${title} ${item.keywords ?? ''}`.toLowerCase();
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q) || (sq && squash(title).startsWith(sq))) score = 80;
    else if (words.split(/\s+/).some((w) => w.startsWith(q) || (sq && squash(w).startsWith(sq)))) score = 60;
    else if (words.includes(q)) score = 40;
    else if (sq.length > 1 && isSubsequence(sq, squash(title))) score = 10;
    if (score) scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
