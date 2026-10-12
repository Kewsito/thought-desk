<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { cssToRgb } from './lib/color-math';
  import { shortcuts, toAccelerator, type ShortcutId } from './lib/shortcuts.svelte';
  import { memory } from './lib/memory.svelte';
  import { prefs } from './lib/prefs.svelte';
  import { store } from './lib/store.svelte';
  import { planner } from './lib/planner.svelte';
  import { library } from './lib/library.svelte';
  import { tags } from './lib/tags.svelte';
  import './lib/reminders.svelte';
  import { listen } from '@tauri-apps/api/event';
  import { ui } from './lib/ui.svelte';
  import type { Page } from './lib/types';
  import Sidebar from './lib/components/Sidebar.svelte';
  import TitleBar from './lib/components/TitleBar.svelte';
  import PageView from './lib/components/PageView.svelte';
  import SearchPalette from './lib/components/SearchPalette.svelte';
  import SettingsModal from './lib/components/SettingsModal.svelte';
  import TrashModal from './lib/components/TrashModal.svelte';
  import Menu from './lib/components/Menu.svelte';
  import IconPicker from './lib/components/IconPicker.svelte';
  import ConfirmDialog from './lib/components/ConfirmDialog.svelte';
  import Toasts from './lib/components/Toasts.svelte';
  import Icon from './lib/components/Icon.svelte';
  import Tooltip from './lib/components/Tooltip.svelte';
  import FilePicker from './lib/components/FilePicker.svelte';
  import TagPicker from './lib/components/TagPicker.svelte';
  import HomeView from './lib/views/HomeView.svelte';
  import TagView from './lib/views/TagView.svelte';
  import CourseView from './lib/views/CourseView.svelte';
  import CaptureSheet from './lib/sheets/CaptureSheet.svelte';
  import AssignmentsView from './lib/views/AssignmentsView.svelte';
  import CalendarView from './lib/views/CalendarView.svelte';
  import FilesView from './lib/views/FilesView.svelte';
  import AssignmentSheet from './lib/sheets/AssignmentSheet.svelte';
  import EventSheet from './lib/sheets/EventSheet.svelte';
  import FilePreview from './lib/sheets/FilePreview.svelte';
  import ImportSheet from './lib/sheets/ImportSheet.svelte';
  import StudySheet from './lib/sheets/StudySheet.svelte';
  import FlashcardsView from './lib/views/FlashcardsView.svelte';
  import { cards } from './lib/cards.svelte';

  const win = getCurrentWindow();
  const webviewWin = getCurrentWebviewWindow();

  let page = $state<Page | null>(null);
  let words = $state(0);
  let scroller = $state<HTMLDivElement>();
  let scrolled = $state(false);

  // Match the native window (border, shadow, resize backdrop) to the theme so
  // nothing flashes white while resizing in dark mode.
  $effect(() => {
    const dark = prefs.resolvedTheme === 'dark';
    void prefs.palette;
    void prefs.customTheme.hue;
    void prefs.customTheme.tint;
    void win.setTheme(dark ? 'dark' : 'light').catch(() => {});
    // Read the theme's background once the new attributes are applied (the
    // body's resolved colour, which works for hex and oklch() themes alike).
    requestAnimationFrame(() => {
      const rgb = cssToRgb(getComputedStyle(document.body).backgroundColor) ?? (dark ? [0, 0, 0] : [1, 1, 1]);
      const [r, g, b] = rgb.map((v) => Math.round(v * 255));
      void webviewWin.setBackgroundColor([r, g, b, 255]).catch(() => {});
    });
  });

  // The system-wide Quick Capture shortcut follows its setting and its keys.
  $effect(() => {
    const combo = shortcuts.combos('capture')[0];
    const on = prefs.globalCapture && !!combo;
    api.setCaptureShortcut(on, combo ? toAccelerator(combo) : '').catch((e) => {
      if (!on) return;
      ui.error(e);
      prefs.globalCapture = false;
    });
  });

  // The sidebar's memory readout keeps readings coming while it's shown.
  $effect(() => {
    if (prefs.showMemory) return memory.watch();
  });

  /** What each app-wide shortcut does (the calendar's own are in its view). */
  const ACTIONS: Partial<Record<ShortcutId, () => void>> = {
    search: () => (ui.searchOpen = !ui.searchOpen),
    newPage: () => void store.create(null),
    capture: () => {
      if (!ui.capture) ui.capture = { text: '' };
    },
    sidebar: () => (prefs.sidebarOpen = !prefs.sidebarOpen),
    theme: () => prefs.toggleTheme(),
    settings: () => (ui.settingsOpen = true),
    back: () => store.back(),
    forward: () => store.forward(),
    goHome: () => store.go('home'),
    goAssignments: () => store.go('assignments'),
    goCalendar: () => store.go('calendar'),
    goFiles: () => store.go('files'),
    goCards: () => store.go('cards'),
  };
  const ACTION_IDS = Object.keys(ACTIONS) as ShortcutId[];

  // Each view starts at the top.
  $effect(() => {
    void store.view;
    void store.courseId;
    void store.tag;
    if (scroller) scroller.scrollTop = 0;
    scrolled = false;
  });

  /** Saves everything that's waiting to be written. */
  const flushAll = () => Promise.all([store.flush(), planner.flush()]);

  // Load the full page (with content) whenever the selection changes.
  $effect(() => {
    const id = store.currentId;
    if (!id) {
      page = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // Make sure the page we're leaving (or returning to) is saved first.
        await store.flush();
        const full = await api.getPage(id);
        if (cancelled) return;
        page = full;
        if (scroller) scroller.scrollTop = 0;
        scrolled = false;
      } catch (e) {
        if (!cancelled) ui.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  onMount(() => {
    let unlistenClose: (() => void) | undefined;
    let unlistenCapture: (() => void) | undefined;
    void (async () => {
      try {
        // Pages decide where to start, so the planner and files load alongside.
        await Promise.all([planner.load(), library.load(), tags.load(), store.load()]);
        void cards.load();
      } catch (e) {
        ui.error(e);
      }
      // Show the window only once the first frame is painted (no white flash),
      // with a timer as a fallback in case frames are throttled while hidden.
      let shown = false;
      const show = () => {
        if (shown) return;
        shown = true;
        void win.show().then(() => win.setFocus());
      };
      requestAnimationFrame(() => requestAnimationFrame(show));
      setTimeout(show, 500);
      // Minimizing hides and suspends the webview; save everything first.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flushAll();
      });
      // Quick Capture from anywhere (the Rust side shows the window first).
      unlistenCapture = await listen('td-quick-capture', () => {
        if (!ui.capture) ui.capture = { text: '' };
      }).catch(() => undefined);
      unlistenClose = await win.onCloseRequested(async () => {
        window.dispatchEvent(new Event('td:flush'));
        await flushAll();
      });
    })();
    return () => {
      unlistenClose?.();
      unlistenCapture?.();
    };
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Shortcuts (Settings → Keyboard). Quick Capture's is also caught
    // system-wide when that's on; inside the app it always works.
    const action = shortcuts.match(e, ACTION_IDS);
    if (action) {
      e.preventDefault();
      ACTIONS[action]!();
    } else if (mod && key === 's') {
      // Everything autosaves; just flush now instead of "Save page as…".
      e.preventDefault();
      window.dispatchEvent(new Event('td:flush'));
      void flushAll();
    } else if (mod && !e.shiftKey && (key === 'o' || key === 'j')) {
      // Browser shortcuts (open file, downloads) that make no sense here.
      e.preventDefault();
    } else if (import.meta.env.PROD && (e.key === 'F5' || (mod && key === 'r'))) {
      // A reload would only interrupt typing; data is already saved.
      e.preventDefault();
    }
  }

  // Mouse back/forward buttons.
  function onMouseUp(e: MouseEvent) {
    if (e.button === 3) {
      e.preventDefault();
      store.back();
    } else if (e.button === 4) {
      e.preventDefault();
      store.forward();
    }
  }

  // Files dropped where nothing else takes them go to the library, instead
  // of the webview navigating away to show the file.
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  function onDragOver(e: DragEvent) {
    if (hasFiles(e) && !e.defaultPrevented) e.preventDefault();
  }
  async function onDrop(e: DragEvent) {
    if (!hasFiles(e) || e.defaultPrevented) return;
    e.preventDefault();
    const added = await library.add(Array.from(e.dataTransfer?.files ?? []));
    if (added.length) {
      ui.toast(`Added ${added.length === 1 ? `“${added[0].name}”` : `${added.length} files`} to Files`, {
        label: 'Show',
        run: () => (added.length === 1 ? library.preview(added[0].id) : store.go('files')),
      });
    }
  }

  // Only editable areas get the native context menu (spelling, copy/paste).
  function onContextMenu(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKeydown} onmouseup={onMouseUp} oncontextmenu={onContextMenu} ondragover={onDragOver} ondrop={onDrop} />

<div class="app">
  {#if prefs.sidebarOpen}
    <Sidebar />
  {/if}
  <main class="main">
    <TitleBar {words} {scrolled} />
    <div class="scroller" bind:this={scroller} onscroll={() => (scrolled = (scroller?.scrollTop ?? 0) > 2)}>
      {#if store.view === 'home'}
        {#if planner.loaded && library.loaded}<HomeView />{/if}
      {:else if store.view === 'tag' && store.tag}
        {#key store.tag}<TagView name={store.tag} />{/key}
      {:else if store.view === 'course' && store.courseId}
        {#if planner.loaded && library.loaded}
          {#key store.courseId}<CourseView id={store.courseId} />{/key}
        {/if}
      {:else if store.view === 'assignments'}
        {#if planner.loaded}<AssignmentsView />{/if}
      {:else if store.view === 'calendar'}
        {#if planner.loaded}<CalendarView />{/if}
      {:else if store.view === 'files'}
        {#if library.loaded}<FilesView />{/if}
      {:else if store.view === 'cards'}
        <FlashcardsView />
      {:else if page && store.currentId === page.id}
        {#key page.id}
          <PageView {page} onstats={(w) => (words = w)} />
        {/key}
      {:else if store.loaded && !store.currentId}
        <div class="empty">
          <svg class="empty-logo" width="48" height="48" viewBox="0 0 1024 1024" aria-hidden="true">
            <rect x="64" y="64" width="896" height="896" rx="230" fill="var(--text)" />
            <circle cx="512" cy="430" r="150" fill="var(--bg)" />
            <rect x="262" y="660" width="500" height="68" rx="34" fill="var(--bg)" />
          </svg>
          <h2>A clear desk</h2>
          <p>Create a page to start writing. Everything stays on this computer.</p>
          <button class="btn primary" onclick={() => void store.create(null)}>
            <Icon name="plus" size={15} stroke={2.2} /> New page
          </button>
        </div>
      {/if}
    </div>
  </main>
</div>

{#if ui.searchOpen}<SearchPalette />{/if}
{#if ui.settingsOpen}<SettingsModal />{/if}
{#if ui.trashOpen}<TrashModal />{/if}
{#if ui.menu}
  {#key ui.menu}<Menu menu={ui.menu} />{/key}
{/if}
{#if ui.iconPicker}
  {#key ui.iconPicker}<IconPicker picker={ui.iconPicker} />{/key}
{/if}
{#if ui.assignmentSheet}
  {#key ui.assignmentSheet}<AssignmentSheet sheet={ui.assignmentSheet} />{/key}
{/if}
{#if ui.eventSheet}
  {#key ui.eventSheet}<EventSheet sheet={ui.eventSheet} />{/key}
{/if}
{#if ui.filePreview}
  {#key ui.filePreview}<FilePreview id={ui.filePreview} />{/key}
{/if}
{#if ui.study}
  {#key ui.study}<StudySheet title={ui.study.title} deck={ui.study.cards} />{/key}
{/if}
{#if ui.importSheet}
  {#key ui.importSheet}<ImportSheet name={ui.importSheet.name} items={ui.importSheet.items} />{/key}
{/if}
{#if ui.tagPicker}
  {#key ui.tagPicker}<TagPicker picker={ui.tagPicker} />{/key}
{/if}
{#if ui.capture}<CaptureSheet start={ui.capture.text} />{/if}
{#if ui.filePicker}
  {#key ui.filePicker}<FilePicker picker={ui.filePicker} />{/key}
{/if}
{#if ui.confirmState}<ConfirmDialog dialog={ui.confirmState} />{/if}
<Toasts />
<Tooltip />

<style>
  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .scroller {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
  }
  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 32px 12vh;
    text-align: center;
  }
  .empty-logo {
    margin-bottom: 20px;
  }
  .empty h2 {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: var(--fw-650);
    letter-spacing: -0.018em;
  }
  .empty p {
    margin: 0 0 22px;
    max-width: 300px;
    font-size: var(--fs-callout);
    line-height: 1.5;
    color: var(--text-2);
    text-wrap: balance;
  }
</style>
