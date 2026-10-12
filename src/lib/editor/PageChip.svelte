<script lang="ts">
  import { store } from '../store.svelte';
  import Icon from '../components/Icon.svelte';

  let { id, block = false }: { id: string; block?: boolean } = $props();

  const page = $derived(store.byId.get(id));
  const missing = $derived(!page || !!page.deletedAt);

  function open(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!missing) store.open(id);
  }
</script>

<span
  class="chip"
  class:block
  class:missing
  role="link"
  tabindex="-1"
  onclick={open}
  onkeydown={(e) => e.key === 'Enter' && store.open(id)}
>
  <span class="chip-icon">
    {#if page?.icon}<span class="emoji">{page.icon}</span>{:else}<Icon name="page" size={block ? 18 : 15} />{/if}
  </span>
  <span class="chip-title">{missing ? 'Deleted page' : page?.title || 'Untitled'}</span>
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.28em;
    padding: 0 0.15em;
    margin: 0 -0.05em;
    border-radius: 4px;
    color: var(--text);
    white-space: nowrap;
    cursor: default;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .chip:hover {
    background: var(--fill);
  }
  .chip-icon {
    display: inline-flex;
    align-self: center;
    color: var(--text-2);
  }
  .emoji {
    font-size: 0.95em;
    line-height: 1;
  }
  .chip-title {
    font-weight: var(--fw-550);
    white-space: normal;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-decoration-color: var(--text-4);
    text-underline-offset: 0.22em;
    transition: text-decoration-color var(--dur-fast) var(--ease);
  }
  .chip:hover .chip-title {
    text-decoration-color: var(--text-2);
  }

  /* Block form: a full-width row, like a sub-page in a list. */
  .chip.block {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 4px 8px;
    margin: 0 -8px;
    border-radius: var(--r-sm);
  }
  .chip.block .chip-icon {
    width: 22px;
    justify-content: center;
  }
  .chip.block .emoji {
    font-size: 18px;
  }
  .chip.block .chip-title {
    font-weight: var(--fw-500);
  }

  .missing {
    color: var(--text-3);
  }
  .missing .chip-icon {
    color: var(--text-4);
  }
  .missing .chip-title {
    font-weight: 400;
    text-decoration-line: line-through;
  }
  .missing:hover {
    background: none;
  }
</style>
