<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu';
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';

  let { editor }: { editor: Editor } = $props();
  let el: HTMLDivElement;

  /** The DOM table that contains the selection. */
  function currentTable(): HTMLElement | null {
    const { view, state } = editor;
    const dom = view.domAtPos(state.selection.from).node;
    const elem = dom instanceof HTMLElement ? dom : dom.parentElement;
    return (elem?.closest('.tableWrapper') as HTMLElement) ?? (elem?.closest('table') as HTMLElement) ?? null;
  }

  onMount(() => {
    const key = 'tableBubble';
    editor.registerPlugin(
      BubbleMenuPlugin({
        pluginKey: key,
        editor,
        element: el,
        updateDelay: 0,
        shouldShow: ({ editor }) => editor.isEditable && editor.isActive('table'),
        getReferencedVirtualElement: () => {
          const table = currentTable();
          return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null;
        },
        options: { strategy: 'fixed', placement: 'top-end', offset: 6, flip: false, shift: { padding: 8 } },
      }),
    );
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
    };
  });

  const run = (fn: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    fn();
  };
</script>

<div class="table-menu popover" bind:this={el} style="visibility: hidden">
  <button onmousedown={run(() => editor.chain().focus().addRowAfter().run())} title="Add row below"><Icon name="row-plus" size={15} /></button>
  <button onmousedown={run(() => editor.chain().focus().addColumnAfter().run())} title="Add column to the right"><Icon name="col-plus" size={15} /></button>
  <span class="sep"></span>
  <button onmousedown={run(() => editor.chain().focus().deleteRow().run())} title="Delete row"><Icon name="row-minus" size={15} /></button>
  <button onmousedown={run(() => editor.chain().focus().deleteColumn().run())} title="Delete column"><Icon name="col-minus" size={15} /></button>
  <span class="sep"></span>
  <button onmousedown={run(() => editor.chain().focus().toggleHeaderRow().run())} title="Toggle header row"><Icon name="header" size={15} /></button>
  <button onmousedown={run(() => editor.chain().focus().deleteTable().run())} title="Delete table"><Icon name="trash" size={15} /></button>
</div>

<style>
  .table-menu {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 35;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px;
  }
  button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 5px;
    color: var(--text-2);
  }
  button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .sep {
    width: 1px;
    height: 16px;
    background: var(--border);
    margin: 0 2px;
  }
</style>
