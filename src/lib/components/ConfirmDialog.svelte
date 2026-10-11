<script lang="ts">
  import { onMount } from 'svelte';
  import { ui, type ConfirmState } from '../ui.svelte';

  let { dialog }: { dialog: ConfirmState } = $props();
  let confirmBtn: HTMLButtonElement;

  function done(ok: boolean) {
    ui.confirmState = null;
    dialog.resolve(ok);
  }

  onMount(() => {
    confirmBtn.focus();
    // Capture phase, so Escape doesn't also close a modal underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        done(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={(e) => e.target === e.currentTarget && done(false)}>
  <div class="dialog popover" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <h2 id="confirm-title">{dialog.title}</h2>
    <p>{dialog.message}</p>
    <div class="actions">
      <button class="btn" onclick={() => done(false)}>Cancel</button>
      <button class="btn primary" class:danger={dialog.danger} bind:this={confirmBtn} onclick={() => done(true)}>
        {dialog.confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: var(--scrim);
  }
  .dialog {
    width: 380px;
    max-width: calc(100vw - 32px);
    padding: 20px 20px 16px;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 15.5px;
    font-weight: 600;
  }
  p {
    margin: 0 0 18px;
    font-size: 13.5px;
    color: var(--text-2);
    line-height: 1.5;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
