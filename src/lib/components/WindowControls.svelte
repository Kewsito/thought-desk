<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onMount } from 'svelte';

  const win = getCurrentWindow();
  let maximized = $state(false);

  onMount(() => {
    let unlisten: (() => void) | undefined;
    const sync = async () => (maximized = await win.isMaximized());
    void sync();
    void win.onResized(sync).then((u) => (unlisten = u));
    return () => unlisten?.();
  });
</script>

<div class="controls">
  <button class="ctl" onclick={() => win.minimize()} title="Minimize" aria-label="Minimize">
    <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" /></svg>
  </button>
  <button class="ctl" onclick={() => win.toggleMaximize()} title={maximized ? 'Restore' : 'Maximize'} aria-label={maximized ? 'Restore' : 'Maximize'}>
    {#if maximized}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <rect x="0.5" y="2.5" width="7" height="7" />
        <path d="M2.5 2.5V0.5h7v7h-2" />
      </svg>
    {:else}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
    {/if}
  </button>
  <button class="ctl close" onclick={() => win.close()} title="Close" aria-label="Close">
    <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.05"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /></svg>
  </button>
</div>

<style>
  .controls {
    display: flex;
    height: 100%;
    align-self: stretch;
  }
  .ctl {
    width: 46px;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--text);
    border-radius: 0;
    transition: background 80ms linear;
  }
  .ctl svg {
    shape-rendering: crispEdges;
  }
  .ctl:hover {
    background: var(--hover);
  }
  .ctl:active {
    background: var(--active);
  }
  .close:hover {
    background: var(--text);
    color: var(--bg);
  }
  .close svg {
    shape-rendering: geometricPrecision;
  }
</style>
