<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onMount } from 'svelte';

  const win = getCurrentWindow();
  // Windows ships hinted caption glyphs that stay crisp at every display
  // scale (100%, 125%, 150%…); elsewhere we draw our own.
  const nativeGlyphs = navigator.userAgent.includes('Windows');
  let maximized = $state(false);

  onMount(() => {
    let unlisten: (() => void) | undefined;
    const sync = async () => (maximized = await win.isMaximized());
    void sync();
    void win.onResized(sync).then((u) => (unlisten = u));
    return () => unlisten?.();
  });
</script>

<div class="controls" class:native={nativeGlyphs}>
  <button class="ctl" onclick={() => win.minimize()} aria-label="Minimize" data-tip="Minimize">
    {#if nativeGlyphs}<span class="glyph">&#xE921;</span>{:else}
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" /></svg>
    {/if}
  </button>
  <button class="ctl" onclick={() => win.toggleMaximize()} aria-label={maximized ? 'Restore' : 'Maximize'} data-tip={maximized ? 'Restore Down' : 'Maximize'}>
    {#if nativeGlyphs}<span class="glyph">{maximized ? '' : ''}</span>{:else if maximized}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
        <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
      </svg>
    {:else}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" /></svg>
    {/if}
  </button>
  <button class="ctl close" onclick={() => win.close()} aria-label="Close" data-tip="Close">
    {#if nativeGlyphs}<span class="glyph">&#xE8BB;</span>{:else}
      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.05"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /></svg>
    {/if}
  </button>
</div>

<style>
  .controls {
    display: flex;
    align-self: stretch;
  }
  .ctl {
    width: 46px;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--text);
    border-radius: 0;
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .glyph {
    font-family: 'Segoe Fluent Icons', 'Segoe MDL2 Assets';
    font-size: 10px;
    line-height: 1;
    /* The glyphs are designed on whole pixels; don't let smoothing shift them. */
    font-optical-sizing: none;
  }
  .ctl svg {
    shape-rendering: crispEdges;
  }
  .ctl:hover {
    background: var(--fill);
  }
  .ctl:active {
    background: var(--fill-2);
    color: var(--text-2);
  }
  .close:hover {
    background: var(--ink);
    color: var(--on-ink);
  }
  .close:active {
    background: var(--ink);
    color: var(--on-ink);
    opacity: 0.85;
  }
  .close svg {
    shape-rendering: geometricPrecision;
  }
</style>
