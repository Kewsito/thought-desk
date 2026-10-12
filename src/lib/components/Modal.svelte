<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fadeOut, sheet } from '../motion';

  let {
    onclose,
    width = 560,
    top = '12vh',
    label,
    glass = false,
    children,
  }: { onclose: () => void; width?: number; top?: string; label: string; glass?: boolean; children: Snippet } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="backdrop"
  class:light={glass}
  onmousedown={(e) => e.target === e.currentTarget && onclose()}
  out:fadeOut|global={{ duration: 140 }}
>
  <div
    class="modal"
    class:glass
    style:width="{width}px"
    style:margin-top={top}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    in:sheet|global
    out:fadeOut|global={{ duration: 120 }}
  >
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    background: var(--scrim);
    /* Fade the colour, not opacity: an opacity group would stop the frosted
       panel from blurring the page behind it. */
    animation: scrim-in 200ms var(--ease) both;
  }
  @keyframes scrim-in {
    from {
      background-color: transparent;
    }
  }
  .modal {
    max-width: calc(100vw - 32px);
    max-height: 78vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-elevated);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-modal);
    transform-origin: 50% 30%;
  }
  /* Spotlight-style: frosted panel over a lighter scrim. */
  .backdrop.light {
    background: color-mix(in srgb, var(--scrim) 55%, transparent);
  }
  .modal.glass {
    background: var(--material-strong);
    -webkit-backdrop-filter: blur(40px) saturate(0.2);
    backdrop-filter: blur(40px) saturate(0.2);
  }
</style>
