<script lang="ts" module>
  /** The page being dragged in the sidebar (shared by every row). */
  export const drag = $state<{ id: string | null }>({ id: null });
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import TreeItem from './TreeItem.svelte';
  import { prefs } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import { pageMenuItems } from '../page-actions';
  import type { PageMeta } from '../types';

  let { page, depth = 0, favorite = false }: { page: PageMeta; depth?: number; favorite?: boolean } = $props();

  const kids = $derived(favorite ? [] : store.children(page.id));
  const expanded = $derived(!favorite && !!prefs.expanded[page.id]);
  const active = $derived(store.currentId === page.id);

  let zone = $state<'before' | 'inside' | 'after' | null>(null);
  let expandTimer: ReturnType<typeof setTimeout> | undefined;

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (expanded) delete prefs.expanded[page.id];
    else prefs.expanded[page.id] = true;
  }

  function menu(e: MouseEvent, anchor?: Element) {
    e.preventDefault();
    e.stopPropagation();
    const items = pageMenuItems(page.id, { sidebar: true });
    if (anchor) ui.openMenuAt(anchor, items);
    else ui.openMenu({ x: e.clientX, y: e.clientY, items });
  }

  // ------------------------------------------------------------ drag & drop

  function onDragStart(e: DragEvent) {
    if (favorite || !e.dataTransfer) return;
    drag.id = page.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', page.title || 'Untitled');
  }

  function onDragEnd() {
    drag.id = null;
    zone = null;
  }

  function onDragOver(e: DragEvent) {
    const id = drag.id;
    if (favorite || !id || store.isInside(page.id, id)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const next = y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
    if (next !== zone) {
      zone = next;
      clearTimeout(expandTimer);
      if (next === 'inside' && kids.length && !expanded) {
        expandTimer = setTimeout(() => (prefs.expanded[page.id] = true), 650);
      }
    }
  }

  function onDragLeave() {
    zone = null;
    clearTimeout(expandTimer);
  }

  function onDrop(e: DragEvent) {
    const id = drag.id;
    const where = zone;
    zone = null;
    clearTimeout(expandTimer);
    if (!id || !where || store.isInside(page.id, id)) return;
    e.preventDefault();
    if (where === 'inside') {
      const count = store.children(page.id).filter((p) => p.id !== id).length;
      void store.move(id, page.id, count);
      return;
    }
    const siblings = store.children(page.parentId).filter((p) => p.id !== id);
    const at = siblings.findIndex((p) => p.id === page.id);
    void store.move(id, page.parentId, where === 'before' ? at : at + 1);
  }
</script>

<div
  class="row"
  class:active
  class:dragging={drag.id === page.id}
  class:drop-before={zone === 'before'}
  class:drop-after={zone === 'after'}
  class:drop-inside={zone === 'inside'}
  style:padding-left="{8 + depth * 14}px"
  role="treeitem"
  aria-selected={active}
  aria-expanded={kids.length ? expanded : undefined}
  tabindex="0"
  draggable={!favorite}
  onclick={() => store.open(page.id)}
  onkeydown={(e) => e.key === 'Enter' && store.open(page.id)}
  oncontextmenu={menu}
  ondragstart={onDragStart}
  ondragend={onDragEnd}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <span class="lead">
    {#if kids.length}
      <button class="chev" class:open={expanded} onclick={toggle} tabindex="-1" aria-label={expanded ? 'Collapse' : 'Expand'}>
        <Icon name="chevron-right" size={14} stroke={2} />
      </button>
    {/if}
    <span class="glyph" class:has-kids={kids.length > 0}>
      {#if page.icon}<span class="emoji">{page.icon}</span>{:else}<Icon name="page" size={16} />{/if}
    </span>
  </span>
  <span class="title">{page.title || 'Untitled'}</span>
  <span class="actions">
    <button class="act" tabindex="-1" onclick={(e) => menu(e, e.currentTarget as Element)} title="More"><Icon name="more" size={15} /></button>
    {#if !favorite}
      <button
        class="act"
        tabindex="-1"
        onclick={(e) => {
          e.stopPropagation();
          void store.create(page.id);
        }}
        title="Add a page inside"><Icon name="plus" size={15} /></button
      >
    {/if}
  </span>
</div>

{#if expanded}
  {#each kids as child (child.id)}
    <TreeItem page={child} depth={depth + 1} />
  {/each}
{/if}

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding-right: 4px;
    margin: 0 6px;
    border-radius: 6px;
    color: var(--text-2);
    cursor: pointer;
    font-size: 14px;
    outline: none;
  }
  .row:hover {
    background: var(--hover);
  }
  .row:focus-visible {
    box-shadow: inset 0 0 0 1.5px var(--text-3);
  }
  .row.active {
    background: var(--active);
    color: var(--text);
    font-weight: 500;
  }
  .row.dragging {
    opacity: 0.4;
  }
  .row.drop-inside {
    background: var(--active);
    box-shadow: inset 0 0 0 1.5px var(--text);
  }
  .row.drop-before::before,
  .row.drop-after::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 4px;
    height: 2px;
    border-radius: 2px;
    background: var(--text);
    pointer-events: none;
  }
  .row.drop-before::before {
    top: -1px;
  }
  .row.drop-after::after {
    bottom: -1px;
  }
  .lead {
    position: relative;
    flex: none;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
  }
  .emoji {
    font-size: 15px;
    line-height: 1;
  }
  .chev {
    position: absolute;
    inset: 0;
    display: none;
    place-items: center;
    border-radius: 4px;
    color: var(--text-2);
  }
  .chev:hover {
    background: var(--active);
  }
  .chev.open :global(svg) {
    transform: rotate(90deg);
  }
  .row:hover .chev {
    display: grid;
  }
  .row:hover .glyph.has-kids {
    visibility: hidden;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: none;
    gap: 1px;
  }
  .row:hover .actions {
    display: flex;
  }
  .act {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    color: var(--text-2);
  }
  .act:hover {
    background: var(--active);
    color: var(--text);
  }
</style>
