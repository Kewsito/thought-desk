<script lang="ts">
  import { Editor, type JSONContent } from '@tiptap/core';
  import { onMount } from 'svelte';
  import { normalizeFileUrl } from '../api';
  import { prefs } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import type { Page } from '../types';
  import { blockMenuItems } from './blocks';
  import { buildExtensions } from './extensions';
  import BubbleMenu from './BubbleMenu.svelte';
  import TableMenu from './TableMenu.svelte';

  let { page, onstats }: { page: Page; onstats?: (words: number) => void } = $props();

  let host: HTMLDivElement;
  let editor = $state<Editor | null>(null);

  const SAVE_DELAY = 350;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Fixes stored image URLs for this platform; walks the doc in place. */
  function normalize(node: JSONContent) {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      node.attrs.src = normalizeFileUrl(node.attrs.src);
    }
    node.content?.forEach(normalize);
  }

  function parseContent(raw: string): { content: JSONContent | string; legacy: boolean } {
    if (!raw) return { content: '', legacy: false };
    try {
      const json = JSON.parse(raw) as JSONContent;
      normalize(json);
      return { content: json, legacy: false };
    } catch {
      // Seeded pages are stored as HTML until their first save.
      return { content: raw, legacy: true };
    }
  }

  function save() {
    clearTimeout(timer);
    if (!dirty || !editor || editor.isDestroyed) return;
    dirty = false;
    store.update(
      page.id,
      {
        content: JSON.stringify(editor.getJSON()),
        text: editor.getText({ blockSeparator: '\n' }),
      },
      { immediate: true },
    );
  }

  function stats() {
    if (editor && !editor.isDestroyed) onstats?.(editor.storage.characterCount.words());
  }

  export function focusStart() {
    editor?.chain().focus('start').run();
  }

  export function focusEnd() {
    editor?.chain().focus('end').run();
  }

  onMount(() => {
    const { content, legacy } = parseContent(page.content);
    const ed = new Editor({
      element: host,
      content,
      extensions: buildExtensions({
        onMenu: (target, anchor) => {
          const rect = anchor.getBoundingClientRect();
          ui.openMenu({ x: rect.left, y: rect.bottom + 4, items: blockMenuItems(ed, target) });
        },
      }),
      editorProps: {
        attributes: {
          class: 'prose',
          spellcheck: String(prefs.spellcheck),
          'aria-label': 'Page content',
        },
      },
      onUpdate: () => {
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(() => {
          save();
          stats();
        }, SAVE_DELAY);
      },
    });
    editor = ed;
    if (import.meta.env.DEV) (window as any).__editor = ed;
    stats();
    if (legacy) {
      // Convert seeded HTML into stored JSON right away.
      dirty = true;
      save();
    }

    const flushOnHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('td:flush', save);
    // Quick Capture adding a to-do to this page while it's open.
    const appendTodo = (e: Event) => {
      const { pageId, text } = (e as CustomEvent<{ pageId: string; text: string }>).detail;
      if (pageId !== page.id || ed.isDestroyed) return;
      const item = { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
      ed.chain().insertContentAt(ed.state.doc.content.size, { type: 'taskList', content: [item] }).run();
    };
    window.addEventListener('td:append-todo', appendTodo);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('td:flush', save);
      window.removeEventListener('td:append-todo', appendTodo);
      save();
      ed.destroy();
    };
  });

  // Live-apply the spellcheck preference.
  $effect(() => {
    const value = String(prefs.spellcheck);
    editor?.view.dom.setAttribute('spellcheck', value);
  });
</script>

<div class="editor-host" bind:this={host}></div>
{#if editor}
  <BubbleMenu {editor} />
  <TableMenu {editor} />
{/if}
