<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { fadeOut, sheet } from '../motion';
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
<div class="backdrop" onmousedown={(e) => e.target === e.currentTarget && done(false)} out:fadeOut|global={{ duration: 140 }}>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" in:sheet|global={{ duration: 280 }}>
    <div class="badge"><Icon name={dialog.danger ? 'trash' : 'info'} size={22} /></div>
    <h2 id="confirm-title">{dialog.title}</h2>
    <p id="confirm-message">{dialog.message}</p>
    <div class="actions">
      <button class="btn" onclick={() => done(false)}>Cancel</button>
      <button class="btn primary" bind:this={confirmBtn} onclick={() => done(true)}>{dialog.confirmLabel}</button>
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
    animation: scrim-in 200ms var(--ease) both;
  }
  @keyframes scrim-in {
    from {
      background-color: transparent;
    }
  }
  /* A centred alert, in the manner of macOS. */
  .dialog {
    width: 300px;
    max-width: calc(100vw - 32px);
    padding: 24px 20px 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: var(--bg-elevated);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-modal);
  }
  .badge {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: 14px;
    border-radius: var(--r-lg);
    background: var(--fill);
    color: var(--text);
  }
  h2 {
    margin: 0 0 6px;
    font-size: var(--fs-callout);
    font-weight: var(--fw-650);
    letter-spacing: -0.008em;
  }
  p {
    margin: 0 0 20px;
    font-size: var(--fs-ui);
    line-height: 1.45;
    color: var(--text-2);
    text-wrap: balance;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }
  .actions .btn {
    min-width: 0;
    height: 32px;
  }
</style>
