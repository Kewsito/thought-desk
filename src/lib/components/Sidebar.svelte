<script lang="ts">
  import Icon from './Icon.svelte';
  import TreeItem, { drag } from './TreeItem.svelte';
  import { prefs } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';

  const MIN = 200;
  const MAX = 440;

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
  function cycleTheme() {
    prefs.theme = prefs.theme === 'system' ? 'light' : prefs.theme === 'light' ? 'dark' : 'system';
  }
</script>

<aside class="sidebar" class:resizing style:width="{prefs.sidebarWidth}px">
  <div class="head" data-tauri-drag-region>
    <div class="brand" data-tauri-drag-region>
      <svg class="logo" width="20" height="20" viewBox="0 0 1024 1024" aria-hidden="true">
        <rect x="64" y="64" width="896" height="896" rx="208" fill="var(--text)" />
        <circle cx="512" cy="430" r="150" fill="var(--bg)" />
        <rect x="262" y="660" width="500" height="68" rx="34" fill="var(--bg)" />
      </svg>
      <span data-tauri-drag-region>Thought Desk</span>
    </div>
    <button class="icon-btn" onclick={() => (prefs.sidebarOpen = false)} title="Hide sidebar (Ctrl+\)">
      <Icon name="chevrons-left" />
    </button>
  </div>

  <nav class="quick">
    <button class="nav" onclick={() => (ui.searchOpen = true)}>
      <Icon name="search" /> <span>Search</span> <kbd>Ctrl K</kbd>
    </button>
    <button class="nav" onclick={() => void store.create(null)}>
      <Icon name="page-plus" /> <span>New page</span> <kbd>Ctrl N</kbd>
    </button>
  </nav>

  <div class="scroll">
    {#if store.favorites.length}
      <section>
        <button class="section-title" onclick={() => toggleSection('favorites')}>
          <span>Favorites</span>
          <span class="caret" class:closed={prefs.sections.favorites}><Icon name="chevron-down" size={12} stroke={2} /></span>
        </button>
        {#if !prefs.sections.favorites}
          <div role="tree">
            {#each store.favorites as p (p.id)}
              <TreeItem page={p} favorite />
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <section>
      <div class="section-row">
        <button class="section-title" onclick={() => toggleSection('pages')}>
          <span>Pages</span>
          <span class="caret" class:closed={prefs.sections.pages}><Icon name="chevron-down" size={12} stroke={2} /></span>
        </button>
        <button class="section-add" onclick={() => void store.create(null)} title="New page"><Icon name="plus" size={14} /></button>
      </div>
      {#if !prefs.sections.pages}
        <div role="tree">
          {#each store.roots as p (p.id)}
            <TreeItem page={p} />
          {/each}
        </div>
        {#if store.loaded && store.roots.length === 0}
          <button class="empty" onclick={() => void store.create(null)}>
            <Icon name="plus" size={14} /> Add your first page
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
    <button class="nav" onclick={() => (ui.trashOpen = true)}>
      <Icon name="trash" /> <span>Trash</span>
      {#if store.trash.length}<span class="count">{store.trash.length}</span>{/if}
    </button>
    <div class="foot-row">
      <button class="nav" onclick={() => (ui.settingsOpen = true)}>
        <Icon name="settings" /> <span>Settings</span>
      </button>
      <button class="icon-btn" onclick={cycleTheme} title="Theme: {prefs.theme} (Ctrl+Shift+L)">
        <Icon name={themeIcon} />
      </button>
    </div>
  </div>

  <div
    class="resizer"
    role="separator"
    aria-orientation="vertical"
    onpointerdown={startResize}
    ondblclick={() => (prefs.sidebarWidth = 260)}
    title="Drag to resize · double-click to reset"
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
    border-right: 1px solid var(--border);
    user-select: none;
  }
  .sidebar.resizing {
    cursor: col-resize;
  }
  .head {
    height: var(--titlebar-h);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 14px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    font-weight: 600;
    font-size: 14px;
    letter-spacing: -0.01em;
    color: var(--text);
    min-width: 0;
  }
  .brand span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .logo {
    flex: none;
  }
  .head .icon-btn {
    opacity: 0;
    transition: opacity 120ms;
  }
  .sidebar:hover .head .icon-btn {
    opacity: 1;
  }
  .quick {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 2px 0 8px;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 30px;
    margin: 0 6px;
    padding: 0 10px;
    border-radius: 6px;
    color: var(--text-2);
    font-size: 14px;
    text-align: left;
    flex: 1;
    min-width: 0;
  }
  .nav:hover {
    background: var(--hover);
    color: var(--text);
  }
  .nav span {
    flex: 1;
  }
  .nav kbd {
    opacity: 0;
    transition: opacity 120ms;
  }
  .nav:hover kbd {
    opacity: 1;
  }
  .count {
    flex: none !important;
    font-size: 11.5px;
    color: var(--text-3);
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 8px;
  }
  section {
    margin-bottom: 10px;
  }
  .section-row {
    display: flex;
    align-items: center;
    padding-right: 10px;
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    margin: 0 6px;
    padding: 0 10px;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
    flex: 1;
    text-align: left;
  }
  .section-title:hover {
    color: var(--text-2);
  }
  .caret {
    display: inline-grid;
    opacity: 0;
    transition: transform 120ms;
  }
  .section-title:hover .caret {
    opacity: 1;
  }
  .caret.closed {
    transform: rotate(-90deg);
    opacity: 1;
  }
  .section-add {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    color: var(--text-3);
    opacity: 0;
  }
  .section-row:hover .section-add {
    opacity: 1;
  }
  .section-add:hover {
    background: var(--hover);
    color: var(--text);
  }
  .empty {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 6px;
    padding: 6px 10px;
    border-radius: 6px;
    color: var(--text-3);
    font-size: 13.5px;
  }
  .empty:hover {
    background: var(--hover);
    color: var(--text);
  }
  .root-drop {
    height: 32px;
    margin: 0 6px;
    border-radius: 6px;
  }
  .root-drop.over {
    box-shadow: inset 0 2px 0 var(--text);
  }
  .foot {
    flex: none;
    padding: 6px 0 8px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .foot-row {
    display: flex;
    align-items: center;
    padding-right: 8px;
  }
  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .resizer:hover,
  .resizing .resizer {
    background: linear-gradient(to right, transparent 2px, var(--border-strong) 2px, var(--border-strong) 4px, transparent 4px);
  }
</style>
