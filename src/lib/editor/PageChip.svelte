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
  title={missing ? 'This page was deleted' : 'Open page'}
>
  <span class="chip-icon">
    {#if page?.icon}{page.icon}{:else}<Icon name="page" size={block ? 18 : 15} />{/if}
  </span>
  <span class="chip-title">{missing ? 'Deleted page' : page?.title || 'Untitled'}</span>
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    cursor: pointer;
    border-radius: 4px;
    padding: 0 2px;
    color: var(--text);
    white-space: nowrap;
  }
  .chip:hover {
    background: var(--hover);
  }
  .chip-icon {
    display: inline-flex;
    align-self: center;
    color: var(--text-2);
    font-size: 0.95em;
  }
  .chip-title {
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 3px;
    white-space: normal;
  }
  .chip.block {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    margin: 0 -6px;
  }
  .chip.block .chip-icon {
    font-size: 1.15em;
    width: 22px;
    justify-content: center;
  }
  .missing {
    color: var(--text-3);
    cursor: default;
  }
  .missing .chip-title {
    text-decoration: line-through;
  }
</style>
