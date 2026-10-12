<script lang="ts">
  import Icon from './Icon.svelte';
  import TreeItem, { drag } from './TreeItem.svelte';
  import { prefs } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';

  const MIN = 208;
  const MAX = 420;
  const DEFAULT = 252;

  let resizing = $state(false);
  let rootDrop = $state(false);

  function startResize(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    resizing = true;
    const startX = e.clientX;
    const startW = prefs.sidebarWidth;
    const move = (ev: PointerEvent) => {
      prefs.sidebarWidth = Math.round(Math.min(MAX, Math.max(MIN, startW + ev.clientX - startX)));
    };
    const up = () => {
      resizing = false;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  function toggleSection(name: string) {
    prefs.sections[name] = !prefs.sections[name];
  }

  // Dropping below the tree moves a page to the end of the top level.
  function onRootDragOver(e: DragEvent) {
    if (!drag.id) return;
    e.preventDefault();
    rootDrop = true;
  }

  function onRootDrop(e: DragEvent) {
    rootDrop = false;
    const id = drag.id;
    if (!id) return;
    e.preventDefault();
    const count = store.roots.filter((p) => p.id !== id).length;
    void store.move(id, null, count);
  }

  const themeIcon = $derived(prefs.theme === 'system' ? 'monitor' : prefs.theme === 'dark' ? 'moon' : 'sun');
  const themeLabel = $derived(prefs.theme === 'system' ? 'System' : prefs.theme === 'dark' ? 'Dark' : 'Light');
  function cycleTheme() {
    prefs.theme = prefs.theme === 'system' ? 'light' : prefs.theme === 'light' ? 'dark' : 'system';
  }
</script>

<aside class="sidebar" class:resizing style:width="{prefs.sidebarWidth}px">
  <div class="head" data-tauri-drag-region>
    <div class="brand" data-tauri-drag-region>
      <svg class="logo" width="18" height="18" viewBox="0 0 1024 1024" aria-hidden="true">
        <rect x="64" y="64" width="896" height="896" rx="230" fill="var(--text)" />
        <circle cx="512" cy="430" r="150" fill="var(--bg-sidebar)" />
        <rect x="262" y="660" width="500" height="68" rx="34" fill="var(--bg-sidebar)" />
      </svg>
      <span data-tauri-drag-region>Thought Desk</span>
    </div>
    <div class="head-actions">
      <button class="icon-btn collapse" onclick={() => (prefs.sidebarOpen = false)} data-tip="Hide sidebar" data-tip-key="Ctrl+\">
        <Icon name="sidebar-left" />
      </button>
      <button class="icon-btn" onclick={() => void store.create(null)} data-tip="New page" data-tip-key="Ctrl+N">
        <Icon name="compose" />
      </button>
    </div>
  </div>

  <button class="search" onclick={() => (ui.searchOpen = true)}>
    <span class="lead search-icon"><Icon name="search" size={15} stroke={2} /></span>
    <span>Search</span>
    <kbd>Ctrl K</kbd>
  </button>

  <div class="scroll">
    {#if store.favorites.length}
      <section>
        <div class="section-head">
          <button class="section-title" onclick={() => toggleSection('favorites')} aria-expanded={!prefs.sections.favorites}>
            Favorites
            <span class="caret" class:closed={prefs.sections.favorites}><Icon name="chevron-down" size={11} stroke={2.4} /></span>
          </button>
        </div>
        {#if !prefs.sections.favorites}
          <div role="tree" aria-label="Favorites">
            {#each store.favorites as p (p.id)}
              <TreeItem page={p} favorite />
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <section>
      <div class="section-head">
        <button class="section-title" onclick={() => toggleSection('pages')} aria-expanded={!prefs.sections.pages}>
          Pages
          <span class="caret" class:closed={prefs.sections.pages}><Icon name="chevron-down" size={11} stroke={2.4} /></span>
        </button>
        <button class="section-add" onclick={() => void store.create(null)} data-tip="New page"><Icon name="plus" size={14} stroke={2} /></button>
      </div>
      {#if !prefs.sections.pages}
        <div role="tree" aria-label="Pages">
          {#each store.roots as p (p.id)}
            <TreeItem page={p} />
          {/each}
        </div>
        {#if store.loaded && store.roots.length === 0}
          <button class="row-btn muted" onclick={() => void store.create(null)}>
            <span class="lead"><Icon name="plus" /></span>
            <span class="label">Add a page</span>
          </button>
        {/if}
        <div
          class="root-drop"
          class:over={rootDrop}
          role="presentation"
          ondragover={onRootDragOver}
          ondragleave={() => (rootDrop = false)}
          ondrop={onRootDrop}
        ></div>
      {/if}
    </section>
  </div>

  <div class="foot">
    <button class="row-btn" onclick={() => (ui.trashOpen = true)}>
      <span class="lead"><Icon name="trash" /></span>
      <span class="label">Trash</span>
      {#if store.trash.length}<span class="count">{store.trash.length}</span>{/if}
    </button>
    <div class="foot-row">
      <button class="row-btn" onclick={() => (ui.settingsOpen = true)}>
        <span class="lead"><Icon name="settings" /></span>
        <span class="label">Settings</span>
      </button>
      <button class="icon-btn" onclick={cycleTheme} data-tip="Appearance: {themeLabel}" data-tip-key="Ctrl+Shift+L">
        <Icon name={themeIcon} />
      </button>
    </div>
  </div>

  <div
    class="resizer"
    role="separator"
    aria-orientation="vertical"
    onpointerdown={startResize}
    ondblclick={() => (prefs.sidebarWidth = DEFAULT)}
   
  ></div>
</aside>

<style>
  .sidebar {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-sidebar);
    box-shadow: inset -1px 0 0 var(--separator);
    user-select: none;
  }
  .sidebar.resizing {
    cursor: col-resize;
  }

  /* Header: aligned to the title bar's height. */
  .head {
    height: var(--titlebar-h);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px 0 19px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-650);
    letter-spacing: -0.012em;
    color: var(--text);
  }
  .brand span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .logo {
    flex: none;
  }
  .head-actions {
    display: flex;
    gap: 2px;
  }
  .collapse {
    opacity: 0;
    transition:
      opacity var(--dur) var(--ease),
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .sidebar:hover .collapse,
  .collapse:focus-visible {
    opacity: 1;
  }

  /* Search field */
  .search {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    margin: 2px 10px 12px;
    padding: 0 6px 0 8px;
    border-radius: var(--r-sm);
    background: var(--fill);
    color: var(--text-3);
    font-size: var(--fs-body-ui);
    text-align: left;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .search:hover {
    background: var(--fill-2);
  }
  .search > span:not(.lead) {
    flex: 1;
  }
  .search .search-icon {
    color: var(--text-3);
  }
  .search kbd {
    background: var(--bg-elevated);
    box-shadow:
      0 0 0 0.5px var(--hairline),
      0 0.5px 1px rgba(0, 0, 0, 0.06);
  }

  .scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 8px;
  }
  section + section {
    margin-top: 14px;
  }

  /* Section headers */
  .section-head {
    display: flex;
    align-items: center;
    height: 26px;
    padding: 0 12px 0 12px;
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--r-xs);
    font-size: var(--fs-caption);
    font-weight: var(--fw-600);
    letter-spacing: 0.01em;
    color: var(--text-3);
    transition: color var(--dur-fast) var(--ease);
  }
  .section-title:hover {
    color: var(--text-2);
  }
  .caret {
    display: grid;
    opacity: 0;
    transition:
      opacity var(--dur-fast) var(--ease),
      transform var(--dur) var(--ease-out);
  }
  .section-head:hover .caret,
  .caret.closed {
    opacity: 1;
  }
  .caret.closed {
    transform: rotate(-90deg);
  }
  .section-add {
    margin-left: auto;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--r-xs);
    color: var(--text-3);
    opacity: 0;
    transition:
      opacity var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .section-head:hover .section-add {
    opacity: 1;
  }
  .section-add:hover {
    background: var(--fill-2);
    color: var(--text);
  }

  /* Footer rows share the tree rows' metrics. */
  .row-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    height: 30px;
    margin: 0 10px;
    padding: 0 8px;
    border-radius: var(--r-sm);
    font-size: var(--fs-body-ui);
    color: var(--text-sidebar);
    text-align: left;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .row-btn:hover {
    background: var(--fill);
  }
  .row-btn:active {
    background: var(--fill-2);
  }
  .row-btn.muted {
    color: var(--text-3);
  }
  .lead {
    flex: none;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    color: var(--text-2);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .root-drop {
    height: 24px;
    margin: 0 10px;
    border-radius: var(--r-sm);
  }
  .root-drop.over {
    box-shadow: inset 0 2px 0 var(--text);
  }

  .foot {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 0 10px;
    box-shadow: inset 0 1px 0 var(--separator);
  }
  .foot-row {
    display: flex;
    align-items: center;
  }
  .foot-row .row-btn {
    margin-right: 2px;
  }
  .foot-row .icon-btn {
    margin-right: 10px;
    color: var(--text-3);
  }

  /* Resize grip: invisible until hovered, then a 2px rule. */
  .resizer {
    position: absolute;
    top: 0;
    right: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .resizer::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    background: var(--separator-strong);
    opacity: 0;
    transition: opacity var(--dur) var(--ease);
  }
  .resizer:hover::after,
  .resizing .resizer::after {
    opacity: 1;
    transition-delay: 80ms;
  }
</style>
