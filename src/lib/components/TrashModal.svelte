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
    return path.length ? path.map((a) => a.title || 'Untitled').join(' › ') : null;
  }
</script>

<Modal onclose={() => (ui.trashOpen = false)} width={560} label="Trash">
  <header class="head">
    <h2>Trash</h2>
    <button class="icon-btn" onclick={() => (ui.trashOpen = false)} aria-label="Close"><Icon name="x" /></button>
  </header>

  {#if store.trash.length}
    <label class="filter">
      <Icon name="search" size={15} stroke={2} />
      <input bind:value={filter} placeholder="Filter" spellcheck="false" />
    </label>
  {/if}

  <div class="list">
    {#each items as p (p.id)}
      {@const from = origin(p.id)}
      <div class="item">
        <span class="icon">{#if p.icon}<span class="emoji">{p.icon}</span>{:else}<Icon name="page" />{/if}</span>
        <div class="main">
          <span class="title">{p.title || 'Untitled'}</span>
          <span class="meta">Deleted {relativeTime(p.deletedAt ?? 0)}{from ? ` from ${from}` : ''}</span>
        </div>
        <div class="actions">
          <button class="btn small" onclick={() => store.restore(p.id)}>Restore</button>
          <button class="icon-btn" onclick={() => store.deleteForever(p.id)} data-tip="Delete permanently"><Icon name="trash" /></button>
        </div>
      </div>
    {:else}
      <div class="empty">
        <span class="empty-icon"><Icon name="trash" size={22} /></span>
        <strong>{filter ? 'No matches' : 'Trash is empty'}</strong>
        <span>{filter ? 'Try a different name.' : 'Pages you delete stay here until you remove them for good.'}</span>
      </div>
    {/each}
  </div>

  {#if store.trash.length}
    <footer class="foot">
      <span>Restoring a page brings back the sub-pages deleted with it.</span>
      <button class="btn small" onclick={() => store.emptyTrash()}>Empty Trash</button>
    </footer>
  {/if}
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 14px 0 24px;
    flex: none;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: var(--fw-650);
    letter-spacing: -0.016em;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    margin: 0 20px 8px;
    padding: 0 10px;
    border-radius: var(--r-sm);
    background: var(--fill);
    color: var(--text-3);
  }
  .filter input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-size: var(--fs-body-ui);
  }
  .list {
    overflow-y: auto;
    padding: 2px 12px 12px;
    min-height: 140px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 6px 8px 6px 10px;
    border-radius: var(--r-md);
    transition: background-color var(--dur-fast) var(--ease);
  }
  .item:hover {
    background: var(--fill);
  }
  .icon {
    flex: none;
    width: 24px;
    display: grid;
    place-items: center;
    color: var(--text-3);
  }
  .emoji {
    font-size: 18px;
    line-height: 1;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .title {
    font-size: var(--fs-callout);
    font-weight: var(--fw-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
  }
  .item:hover .actions,
  .actions:focus-within {
    opacity: 1;
  }
  .btn.small {
    height: 26px;
    min-width: 0;
    padding: 0 10px;
    font-size: var(--fs-ui);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 32px 24px 36px;
    text-align: center;
    font-size: var(--fs-ui);
    color: var(--text-3);
  }
  .empty-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: 10px;
    border-radius: var(--r-lg);
    background: var(--fill);
    color: var(--text-3);
  }
  .empty strong {
    font-size: var(--fs-callout);
    font-weight: var(--fw-600);
    color: var(--text);
  }
  .empty span {
    max-width: 280px;
    line-height: 1.45;
    text-wrap: balance;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    padding: 0 16px 0 24px;
    box-shadow: inset 0 1px 0 var(--hairline);
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
</style>
