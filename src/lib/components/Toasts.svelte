<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui } from '../ui.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div class="toast">
      <span class="msg">{t.message}</span>
      {#if t.action}
        <button
          class="act"
          onclick={() => {
            t.action?.();
            ui.dismissToast(t.id);
          }}>{t.actionLabel}</button
        >
      {/if}
      <button class="x" onclick={() => ui.dismissToast(t.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 110;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: min(560px, calc(100vw - 32px));
    padding: 8px 8px 8px 14px;
    border-radius: 8px;
    background: var(--text);
    color: var(--bg);
    font-size: 13.5px;
    box-shadow: var(--shadow);
    animation: up 160ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes up {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .msg {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .act {
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 5px;
    color: var(--bg);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .act:hover,
  .x:hover {
    background: color-mix(in srgb, var(--bg) 16%, transparent);
  }
  .x {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    color: var(--bg);
    opacity: 0.7;
  }
</style>
