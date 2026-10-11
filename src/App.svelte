<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { prefs } from './lib/prefs.svelte';
  import { store } from './lib/store.svelte';
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

  const win = getCurrentWindow();

  let page = $state<Page | null>(null);
  let words = $state(0);
  let scroller = $state<HTMLDivElement>();

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
    void (async () => {
      try {
        await store.load();
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
        if (document.visibilityState === 'hidden') void store.flush();
      });
      unlistenClose = await win.onCloseRequested(async () => {
        window.dispatchEvent(new Event('td:flush'));
        await store.flush();
      });
    })();
    return () => unlistenClose?.();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && !e.shiftKey && (key === 'k' || key === 'p')) {
      e.preventDefault();
      ui.searchOpen = !ui.searchOpen;
    } else if (mod && !e.shiftKey && key === 'n') {
      e.preventDefault();
      void store.create(null);
    } else if (mod && key === '\\') {
      e.preventDefault();
      prefs.sidebarOpen = !prefs.sidebarOpen;
    } else if (mod && e.shiftKey && key === 'l') {
      e.preventDefault();
      prefs.toggleTheme();
    } else if (mod && key === ',') {
      e.preventDefault();
      ui.settingsOpen = true;
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      store.back();
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      store.forward();
    } else if (mod && key === 's') {
      // Everything autosaves; just flush now instead of "Save page as…".
      e.preventDefault();
      window.dispatchEvent(new Event('td:flush'));
      void store.flush();
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

  // Only editable areas get the native context menu (spelling, copy/paste).
  function onContextMenu(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKeydown} onmouseup={onMouseUp} oncontextmenu={onContextMenu} />

<div class="app">
  {#if prefs.sidebarOpen}
    <Sidebar />
  {/if}
  <main class="main">
    <TitleBar {words} />
    <div class="scroller" bind:this={scroller}>
      {#if page && store.currentId === page.id}
        {#key page.id}
          <PageView {page} onstats={(w) => (words = w)} />
        {/key}
      {:else if store.loaded && !store.currentId}
        <div class="empty">
          <svg width="56" height="56" viewBox="0 0 1024 1024" aria-hidden="true">
            <rect x="64" y="64" width="896" height="896" rx="208" fill="var(--text)" />
            <circle cx="512" cy="430" r="150" fill="var(--bg)" />
            <rect x="262" y="660" width="500" height="68" rx="34" fill="var(--bg)" />
          </svg>
          <h2>A clear desk</h2>
          <p>Create a page to start writing. Everything stays on this computer.</p>
          <button class="btn primary" onclick={() => void store.create(null)}>
            <Icon name="plus" size={15} /> New page
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
{#if ui.confirmState}<ConfirmDialog dialog={ui.confirmState} />{/if}
<Toasts />

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
    gap: 10px;
    padding-bottom: 10vh;
    text-align: center;
  }
  .empty h2 {
    margin: 12px 0 0;
    font-size: 20px;
    font-weight: 650;
  }
  .empty p {
    margin: 0 0 10px;
    color: var(--text-2);
    font-size: 14px;
  }
</style>
