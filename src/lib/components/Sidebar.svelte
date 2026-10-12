<script lang="ts">
  import Icon from './Icon.svelte';
  import TreeItem, { drag } from './TreeItem.svelte';
  import { prefs } from '../prefs.svelte';
  import { store, type AppView } from '../store.svelte';
  import { tags } from '../tags.svelte';
  import { planner } from '../planner.svelte';
  import { library } from '../library.svelte';
  import { itemsByDay } from '../calendar.svelte';
  import { clock } from '../clock.svelte';
  import { dueState } from '../dates';
  import { colorVar } from '../colors';
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

  const overdue = $derived(planner.dueSoon.some((a) => dueState(a, clock.today, clock.time) === 'overdue'));
  const todayEvents = $derived.by(() => {
    const d = itemsByDay(clock.today, clock.today).get(clock.today);
    return d ? d.allDay.length + d.timed.length : 0;
  });

  const nav: { view: AppView; label: string; icon: string; key: string }[] = [
    { view: 'home', label: 'Home', icon: 'home', key: 'Ctrl+1' },
    { view: 'assignments', label: 'Assignments', icon: 'assignment', key: 'Ctrl+2' },
    { view: 'calendar', label: 'Calendar', icon: 'calendar', key: 'Ctrl+3' },
    { view: 'files', label: 'Files', icon: 'files', key: 'Ctrl+4' },
  ];
  const counts = $derived<Record<string, number>>({
    assignments: planner.dueSoon.length,
    calendar: todayEvents,
    files: library.live.length,
  });
  const countTips = $derived<Record<string, string>>({
    assignments: `${planner.dueSoon.length} due within a week${overdue ? ', some overdue' : ''}`,
    calendar: `${todayEvents} event${todayEvents === 1 ? '' : 's'} today`,
    files: `${library.live.length} file${library.live.length === 1 ? '' : 's'}`,
  });

  const themeIcon = $derived(prefs.theme === 'system' ? 'monitor' : prefs.theme === 'dark' ? 'moon' : 'sun');
  const themeLabel = $derived(prefs.theme === 'system' ? 'System' : prefs.theme === 'dark' ? 'Dark' : 'Light');
  const trashCount = $derived(
    store.trash.length +
      planner.assignments.filter((a) => a.deletedAt).length +
      planner.events.filter((e) => e.deletedAt).length +
      library.files.filter((f) => f.deletedAt).length,
  );

  /** Open assignments per course. */
  const courseOpen = $derived.by(() => {
    const map = new Map<string, number>();
    for (const a of planner.live) if (a.courseId && a.status !== 'done') map.set(a.courseId, (map.get(a.courseId) ?? 0) + 1);
    return map;
  });

  async function addCourse() {
    const c = await planner.promptCourse();
    if (c) store.openCourse(c.id);
  }

  function cycleTheme() {
    prefs.theme = prefs.theme === 'system' ? 'light' : prefs.theme === 'light' ? 'dark' : 'system';
  }
</script>

<aside class="sidebar" class:resizing style:width="{prefs.sidebarWidth}px">
  <div class="head" data-tauri-drag-region>
    <div class="brand" data-tauri-drag-region>
      <svg class="logo" width="20" height="20" viewBox="0 0 1024 1024" aria-hidden="true">
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

  <nav class="views" aria-label="Views">
    {#each nav as n (n.view)}
      <div class="nav-row" class:active={store.view === n.view}>
        <button class="nav-main" onclick={() => store.go(n.view)} aria-current={store.view === n.view ? 'page' : undefined} data-tip={n.label} data-tip-key={n.key}>
          <span class="lead tinted"><Icon name={n.icon} /></span>
          <span class="label">{n.label}</span>
        </button>
        {#if counts[n.view]}
          <span class="count" class:alert={n.view === 'assignments' && overdue} data-tip={countTips[n.view]}>{counts[n.view]}</span>
        {/if}
      </div>
    {/each}
  </nav>

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

    {#if planner.loaded}
      <section>
        <div class="section-head">
          <button class="section-title" onclick={() => toggleSection('courses')} aria-expanded={!prefs.sections.courses}>
            Courses
            <span class="caret" class:closed={prefs.sections.courses}><Icon name="chevron-down" size={11} stroke={2.4} /></span>
          </button>
          <button class="section-add" onclick={addCourse} data-tip="New course"><Icon name="plus" size={14} stroke={2} /></button>
        </div>
        {#if !prefs.sections.courses}
          <div class="tag-list">
            {#each planner.courses as c (c.id)}
              {@const open = courseOpen.get(c.id) ?? 0}
              <div class="nav-row" class:active={store.view === 'course' && store.courseId === c.id}>
                <button class="nav-main" onclick={() => store.openCourse(c.id)}>
                  <span class="lead"><span class="dot" style:--dot={colorVar(c.color)}></span></span>
                  <span class="label">{c.name || 'Untitled'}</span>
                </button>
                {#if open}<span class="count" data-tip="{open} open assignment{open === 1 ? '' : 's'}">{open}</span>{/if}
              </div>
            {:else}
              <button class="row-btn muted" onclick={addCourse}>
                <span class="lead"><Icon name="plus" /></span>
                <span class="label">Add a course</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    {#if tags.used.length}
      <section>
        <div class="section-head">
          <button class="section-title" onclick={() => toggleSection('tags')} aria-expanded={!prefs.sections.tags}>
            Tags
            <span class="caret" class:closed={prefs.sections.tags}><Icon name="chevron-down" size={11} stroke={2.4} /></span>
          </button>
        </div>
        {#if !prefs.sections.tags}
          <div class="tag-list">
            {#each tags.used as name (name)}
              <div class="nav-row" class:active={store.view === 'tag' && store.tag === name}>
                <button class="nav-main" onclick={() => store.openTag(name)}>
                  <span class="lead"><span class="dot" style:--dot={tags.color(name)}></span></span>
                  <span class="label">#{name}</span>
                </button>
                <span class="count">{tags.counts.get(name)}</span>
              </div>
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

  <!-- Trash and Settings share one row shape: full width, with a trailing
       accessory (the count, the appearance toggle) inside the row. -->
  <div class="foot">
    <div class="nav-row" class:active={ui.trashOpen}>
      <button class="nav-main" onclick={() => (ui.trashOpen = true)}>
        <span class="lead"><Icon name="trash" /></span>
        <span class="label">Trash</span>
      </button>
      {#if trashCount}<span class="count">{trashCount}</span>{/if}
    </div>
    <div class="nav-row" class:active={ui.settingsOpen}>
      <button class="nav-main" onclick={() => (ui.settingsOpen = true)}>
        <span class="lead"><Icon name="settings" /></span>
        <span class="label">Settings</span>
      </button>
      <button class="acc" onclick={cycleTheme} data-tip="Appearance: {themeLabel}" data-tip-key="Ctrl+Shift+L" aria-label="Appearance: {themeLabel}">
        <Icon name={themeIcon} size={15} />
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
    /* The logo sits in the rows' 20px icon column (16px in), the name on
       the label column, and the buttons line up with the rows' actions. */
    padding: 0 10px 0 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
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
    height: var(--h-md);
    margin: 0 8px 16px;
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
    margin-top: 16px;
  }

  /* Section headers */
  .section-head {
    display: flex;
    align-items: center;
    height: var(--h-sm);
    padding: 0 12px 0 8px;
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--h-xs);
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
    width: var(--h-xs);
    height: var(--h-xs);
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

  /* Navigation and footer rows share the tree rows' metrics: a 30px row
     inset 10px from the edges, a 20px icon slot, and trailing accessories
     that sit 4px from the right edge, like a tree row's actions. */
  .nav-row {
    display: flex;
    align-items: center;
    height: var(--h-row);
    margin: 0 8px;
    border-radius: var(--r-sm);
    color: var(--text-sidebar);
    transition: background-color var(--dur-fast) var(--ease);
  }
  .nav-row:hover {
    background: var(--fill);
  }
  .nav-row:has(.nav-main:active) {
    background: var(--fill-2);
  }
  .nav-row.active {
    background: var(--fill-2);
    color: var(--text);
    font-weight: var(--fw-550);
  }
  .nav-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    padding: 0 8px;
    border-radius: var(--r-sm);
    font-size: var(--fs-body-ui);
    text-align: left;
  }
  .nav-main:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--focus);
  }
  .nav-row .count {
    margin-right: 12px;
  }
  .count.alert {
    color: var(--danger);
    font-weight: var(--fw-600);
  }
  .acc {
    display: grid;
    place-items: center;
    width: var(--h-xs);
    height: var(--h-xs);
    margin-right: 4px;
    border-radius: var(--r-xs);
    color: var(--text-3);
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .acc:hover {
    background: var(--fill-2);
    color: var(--text);
  }
  .views {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 16px;
  }
  .tinted {
    color: var(--tint);
  }
  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    height: var(--h-row);
    margin: 0 8px;
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
    margin: 0 8px;
    border-radius: var(--r-sm);
  }
  .root-drop.over {
    box-shadow: inset 0 2px 0 var(--text);
  }

  .foot {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 0;
    box-shadow: inset 0 1px 0 var(--separator);
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
