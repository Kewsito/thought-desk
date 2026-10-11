<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import WindowControls from './WindowControls.svelte';
  import { prefs } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import { relativeTime } from '../time';
  import { pageMenuItems } from '../page-actions';

  let { words = 0 }: { words?: number } = $props();

  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  const page = $derived(store.current);
  const crumbs = $derived.by(() => {
    if (!page) return [];
    const all = [...store.ancestors(page.id), page];
    // Collapse long paths to first … last two.
    if (all.length > 4) return [all[0], null, ...all.slice(-2)];
    return all;
  });

  function openMore(e: MouseEvent) {
    if (!page) return;
    ui.openMenuAt(e.currentTarget as Element, pageMenuItems(page.id, { words }), { alignRight: true });
  }
</script>

<header class="titlebar" data-tauri-drag-region>
  <div class="left">
    {#if !prefs.sidebarOpen}
      <button class="icon-btn" onclick={() => (prefs.sidebarOpen = true)} title="Show sidebar (Ctrl+\)">
        <Icon name="sidebar" />
      </button>
    {/if}
    <button class="icon-btn" disabled={!store.canGoBack} onclick={() => store.back()} title="Back (Alt+←)">
      <Icon name="arrow-left" />
    </button>
    <button class="icon-btn" disabled={!store.canGoForward} onclick={() => store.forward()} title="Forward (Alt+→)">
      <Icon name="arrow-right" />
    </button>

    <nav class="crumbs" data-tauri-drag-region>
      {#each crumbs as c, i (c?.id ?? `gap-${i}`)}
        {#if i > 0}<span class="slash" data-tauri-drag-region>/</span>{/if}
        {#if c === null}
          <span class="gap" data-tauri-drag-region>…</span>
        {:else}
          <button class="crumb" class:last={i === crumbs.length - 1} onclick={() => store.open(c.id)}>
            {#if c.icon}<span class="emoji">{c.icon}</span>{/if}
            <span class="crumb-title">{c.title || 'Untitled'}</span>
          </button>
        {/if}
      {/each}
    </nav>
  </div>

  <div class="spacer" data-tauri-drag-region></div>

  {#if page}
    <div class="right">
      <span class="status" data-tauri-drag-region>
        {store.saving ? 'Saving…' : `Edited ${relativeTime(page.updatedAt, now)}`}
      </span>
      <button
        class="icon-btn"
        class:fav={!!page.favorite}
        onclick={() => store.toggleFavorite(page.id)}
        title={page.favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Icon name="star" filled={!!page.favorite} />
      </button>
      <button class="icon-btn" onclick={openMore} title="More actions">
        <Icon name="more" />
      </button>
    </div>
  {/if}
  <span class="divider"></span>
  <WindowControls />
</header>

<style>
  .titlebar {
    height: var(--titlebar-h);
    display: flex;
    align-items: center;
    flex: none;
    user-select: none;
    background: var(--bg);
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    min-width: 0;
  }
  .left {
    flex: 0 1 auto;
  }
  .spacer {
    flex: 1;
    align-self: stretch;
  }
  .crumbs {
    display: flex;
    align-items: center;
    min-width: 0;
    margin-left: 6px;
    overflow: hidden;
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    padding: 3px 6px;
    border-radius: 5px;
    font-size: 13.5px;
    color: var(--text-2);
    min-width: 0;
  }
  .crumb:hover {
    background: var(--hover);
    color: var(--text);
  }
  .crumb.last {
    color: var(--text);
  }
  .crumb-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .emoji {
    font-size: 14px;
  }
  .slash,
  .gap {
    color: var(--text-3);
    font-size: 13px;
    padding: 0 1px;
  }
  .status {
    font-size: 12.5px;
    color: var(--text-3);
    margin-right: 6px;
    white-space: nowrap;
  }
  .fav {
    color: var(--text);
  }
  .divider {
    width: 1px;
    height: 16px;
    background: var(--border);
    margin: 0 4px 0 2px;
  }
  @media (max-width: 860px) {
    .status {
      display: none;
    }
  }
</style>
