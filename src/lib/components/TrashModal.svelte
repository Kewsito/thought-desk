<script lang="ts">
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import { relativeTime } from '../time';

  let filter = $state('');

  const items = $derived(
    store.trash.filter((p) => (p.title || 'Untitled').toLowerCase().includes(filter.trim().toLowerCase())),
  );

  function origin(id: string) {
    const path = store.ancestors(id);
    return path.length ? path.map((a) => a.title || 'Untitled').join(' / ') : null;
  }
</script>

<Modal onclose={() => (ui.trashOpen = false)} width={540} label="Trash">
  <div class="head">
    <h2>Trash</h2>
    <button class="icon-btn" onclick={() => (ui.trashOpen = false)} aria-label="Close"><Icon name="x" /></button>
  </div>
  <div class="filter">
    <Icon name="search" size={15} />
    <input bind:value={filter} placeholder="Filter deleted pages…" spellcheck="false" />
  </div>
  <div class="list">
    {#each items as p (p.id)}
      {@const from = origin(p.id)}
      <div class="item">
        <span class="icon">{#if p.icon}{p.icon}{:else}<Icon name="page" size={16} />{/if}</span>
        <div class="main">
          <span class="title">{p.title || 'Untitled'}</span>
          <span class="meta">Deleted {relativeTime(p.deletedAt ?? 0)}{from ? ` · in ${from}` : ''}</span>
        </div>
        <button class="icon-btn" onclick={() => store.restore(p.id)} title="Restore"><Icon name="restore" size={15} /></button>
        <button class="icon-btn" onclick={() => store.deleteForever(p.id)} title="Delete permanently"><Icon name="trash" size={15} /></button>
      </div>
    {:else}
      <div class="empty">
        <Icon name="trash" size={22} />
        <span>{filter ? 'Nothing matches that filter' : 'Trash is empty'}</span>
      </div>
    {/each}
  </div>
  {#if store.trash.length}
    <div class="foot">
      <span>Restoring a page also restores the sub-pages deleted with it.</span>
      <button class="btn danger" onclick={() => store.emptyTrash()}>Empty trash</button>
    </div>
  {/if}
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px 8px 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 16px 6px;
    padding: 0 10px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--text-3);
  }
  .filter input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 13.5px;
  }
  .list {
    overflow-y: auto;
    padding: 4px 8px 8px;
    min-height: 120px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 7px;
  }
  .item:hover {
    background: var(--hover);
  }
  .icon {
    width: 22px;
    display: grid;
    place-items: center;
    color: var(--text-2);
    font-size: 16px;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: 12px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 36px 0;
    color: var(--text-3);
    font-size: 13.5px;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-3);
  }
</style>
