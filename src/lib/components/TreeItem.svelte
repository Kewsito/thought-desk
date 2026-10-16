<script lang="ts" module>
  /**
   * The page being dragged (shared by every row): from the sidebar, or from
   * the title bar or the side pane's header (`from`), which only split view
   * takes; the tree ignores those.
   */
  export const drag = $state<{ id: string | null; from?: 'main' | 'side' }>({ id: null });

  let pending = 0;
  /**
   * Starts a drag from something the drop targets cover (title bar, side
   * pane header) a tick later: showing them in the same moment the drag
   * starts makes Chromium cancel it. A drag that's already over is left alone.
   */
  export function dragLater(id: string, from: 'main' | 'side') {
    const mine = ++pending;
    setTimeout(() => {
      if (mine === pending) Object.assign(drag, { id, from });
    });
  }

  /** Ends any drag (also cancels one still waiting to start). */
  export function endDrag() {
    pending++;
    drag.id = null;
    drag.from = undefined;
  }
</script>

<script lang="ts">
  import { split } from '../split.svelte';
  import PageIcon from './PageIcon.svelte';
  import Icon from './Icon.svelte';
  import TreeItem from './TreeItem.svelte';
  import { prefs } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import { pageMenuItems } from '../page-actions';
  import { Progressive, sliceKeeping } from '../progressive.svelte';
  import type { PageMeta } from '../types';

  let { page, depth = 0, favorite = false }: { page: PageMeta; depth?: number; favorite?: boolean } = $props();

  const kids = $derived(favorite ? [] : store.children(page.id));
  const expanded = $derived(!favorite && !!prefs.expanded[page.id]);
  // A folder of thousands of pages renders its rows as you scroll to them.
  const lazy = new Progressive(100, 200);
  const shownKids = $derived(sliceKeeping(kids, lazy.limit, (p) => store.openPath.has(p.id)));
  const active = $derived(store.currentId === page.id);

  let zone = $state<'before' | 'inside' | 'after' | null>(null);
  let expandTimer: ReturnType<typeof setTimeout> | undefined;

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (expanded) delete prefs.expanded[page.id];
    else prefs.expanded[page.id] = true;
  }

  // The row stays highlighted while its menu is open.
  let menuOpen = $state(false);
  function menu(e: MouseEvent, anchor?: Element) {
    e.preventDefault();
    e.stopPropagation();
    const items = pageMenuItems(page.id, { sidebar: true });
    const onClose = () => (menuOpen = false);
    menuOpen = true;
    if (anchor) ui.openMenuAt(anchor, items, { onClose });
    else ui.openMenu({ x: e.clientX, y: e.clientY, items, onClose });
  }

  // ------------------------------------------------------------ drag & drop

  function onDragStart(e: DragEvent) {
    if (favorite || !e.dataTransfer) return;
    drag.id = page.id;
    drag.from = undefined;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', page.title || 'Untitled');
  }

  function onDragEnd() {
    drag.id = null;
    zone = null;
  }

  function onDragOver(e: DragEvent) {
    const id = drag.id;
    if (favorite || !id || drag.from || store.isInside(page.id, id)) return;
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
  class:menu-open={menuOpen}
  class:dragging={drag.id === page.id}
  class:drop-before={zone === 'before'}
  class:drop-after={zone === 'after'}
  class:drop-inside={zone === 'inside'}
  style:padding-left="{8 + depth * 16}px"
  role="treeitem"
  aria-selected={active}
  aria-expanded={kids.length ? expanded : undefined}
  tabindex="0"
  draggable={!favorite}
  onclick={(e) => (e.altKey ? split.show(page.id) : store.open(page.id))}
  onkeydown={(e) => e.key === 'Enter' && (e.altKey ? split.show(page.id) : store.open(page.id))}
  oncontextmenu={menu}
  ondragstart={onDragStart}
  ondragend={onDragEnd}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <span class="lead">
    <span class="glyph" class:has-kids={kids.length > 0}>
      {#if page.icon}<span class="emoji"><PageIcon icon={page.icon} /></span>{:else}<Icon name={page.kind === 'database' ? 'database' : 'page'} />{/if}
    </span>
    {#if kids.length}
      <button class="chev" class:open={expanded} onclick={toggle} tabindex="-1" aria-label={expanded ? 'Collapse' : 'Expand'}>
        <Icon name="chevron-right" size={13} stroke={2.2} />
      </button>
    {/if}
  </span>
  <span class="title">{page.title || 'Untitled'}</span>
  <span class="actions">
    <button class="act" tabindex="-1" onclick={(e) => menu(e, e.currentTarget as Element)} data-tip="More"><Icon name="more" size={15} /></button>
    {#if !favorite}
      <button
        class="act"
        tabindex="-1"
        onclick={(e) => {
          e.stopPropagation();
          void store.create(page.id);
        }}
        data-tip="Add a page inside"><Icon name="plus" size={15} stroke={2} /></button
      >
    {/if}
  </span>
</div>

{#if expanded}
  {#each shownKids as child (child.id)}
    <TreeItem page={child} depth={depth + 1} />
  {/each}
  {#if shownKids.length < kids.length}<div {@attach lazy.more}></div>{/if}
{/if}

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--h-row);
    margin: 0 8px 2px;
    padding-right: 4px;
    border-radius: var(--r-sm);
    color: var(--text-sidebar);
    font-size: var(--fs-body-ui);
    outline: none;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .row:hover,
  .row.menu-open {
    background: var(--fill);
  }
  .row:focus-visible {
    box-shadow: inset 0 0 0 1.5px var(--focus);
  }
  .row.active {
    background: var(--fill-2);
    color: var(--text);
    font-weight: var(--fw-550);
  }
  .row.dragging {
    opacity: 0.4;
  }
  .row.drop-inside {
    background: var(--fill-2);
    box-shadow: inset 0 0 0 1.5px var(--text);
  }
  .row.drop-before::before,
  .row.drop-after::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
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

  /* Icon slot; on rows with children the chevron takes its place on hover. */
  .lead {
    position: relative;
    flex: none;
    width: 20px;
    height: 20px;
  }
  .glyph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-3);
    transition: opacity var(--dur-fast) var(--ease);
  }
  .active .glyph {
    color: var(--text-2);
  }
  .emoji {
    font-size: 15px;
    line-height: 1;
  }
  .chev {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: var(--r-xs);
    color: var(--text-2);
    opacity: 0;
    transition:
      opacity var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease);
  }
  .chev :global(svg) {
    transition: transform var(--dur) var(--ease-out);
  }
  .chev.open :global(svg) {
    transform: rotate(90deg);
  }
  .chev:hover {
    background: var(--fill-2);
  }
  .row:hover .chev {
    opacity: 1;
  }
  .row:hover .glyph.has-kids {
    opacity: 0;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 1px;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
  }
  .row:hover .actions,
  .row.menu-open .actions {
    opacity: 1;
  }
  .act {
    display: grid;
    place-items: center;
    width: var(--h-xs);
    height: var(--h-xs);
    border-radius: var(--r-xs);
    color: var(--text-3);
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .act:hover {
    background: var(--fill-2);
    color: var(--text);
  }
</style>
