<script lang="ts">
  /**
   * A row's properties, at the top of its page: every value, editable in
   * place, with its property's settings a click away.
   */
  import Icon from '../components/Icon.svelte';
  import Popover from './Popover.svelte';
  import Value from './Value.svelte';
  import CellEditor from './CellEditor.svelte';
  import PropertyMenu from './PropertyMenu.svelte';
  import { databases } from '../databases.svelte';
  import { store } from '../store.svelte';
  import { EDITABLE, TYPES, typeInfo } from './schema';
  import type { Property, PropertyType } from '../types';

  let { rowId }: { rowId: string } = $props();

  const row = $derived(databases.rows[rowId]);
  const dbId = $derived(row?.dbId ?? '');
  const rowProps = $derived(databases.props(dbId).filter((p) => p.type !== 'title'));
  let editing = $state<{ prop: Property; el: Element } | null>(null);
  let menuFor = $state<{ prop: Property; el: Element } | null>(null);
  let adding = $state<Element | null>(null);
  let showEmpty = $state(true);

  const empty = (p: Property) => {
    if (!row) return true;
    const v = databases.get(row, p);
    return v === null || v === '' || (Array.isArray(v) && !v.length);
  };
  const shown = $derived(showEmpty ? rowProps : rowProps.filter((p) => !empty(p) || p.type === 'checkbox'));
  const hiddenCount = $derived(rowProps.length - shown.length);

  async function add(type: PropertyType) {
    adding = null;
    const p = await databases.addProperty(dbId, type);
    if (!p) return;
    await Promise.resolve();
    const el = document.querySelector(`[data-row-prop="${p.id}"]`);
    if (el) menuFor = { prop: p, el };
  }

  const groupedTypes = (['Basic', 'Thought Desk', 'Advanced', 'Automatic'] as const).map((g) => ({ g, items: TYPES.filter((t) => t.group === g && t.type !== 'title') }));
</script>

{#if row}
  <div class="props" aria-label="Properties">
    <button class="db-link" onclick={() => store.open(dbId)}>
      <Icon name="database" size={13} />
      {store.byId.get(dbId)?.icon ?? ''}
      {store.byId.get(dbId)?.title || 'Untitled database'}
    </button>
    {#each shown as p (p.id)}
      <div class="prop">
        <button class="name" data-row-prop={p.id} onclick={(e) => (menuFor = { prop: p, el: e.currentTarget as Element })} data-tip={p.config.description || undefined}>
          <Icon name={typeInfo(p.type).icon} size={14} />
          <span>{p.name}</span>
        </button>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="value"
          class:editable={EDITABLE.has(p.type)}
          onclick={(e) => {
            if ((e.target as Element).closest('a, .chip-link, .v-check')) return;
            if (EDITABLE.has(p.type)) editing = { prop: p, el: e.currentTarget as Element };
          }}
        >
          {#if empty(p) && p.type !== 'checkbox'}
            <span class="placeholder">{EDITABLE.has(p.type) ? 'Empty' : '—'}</span>
          {:else}
            <Value {dbId} {row} prop={p} wrap oncheck={p.type === 'checkbox' ? () => databases.setOne(row, p, !databases.get(row, p)) : undefined} />
          {/if}
        </div>
      </div>
    {/each}
    <div class="foot">
      <button class="add" onclick={(e) => (adding = e.currentTarget as Element)}><Icon name="plus" size={14} /> Add a property</button>
      {#if rowProps.some((p) => empty(p) && p.type !== 'checkbox')}
        <button class="add" onclick={() => (showEmpty = !showEmpty)}>
          <Icon name={showEmpty ? 'eye-off' : 'eye'} size={14} />
          {showEmpty ? 'Hide empty' : `Show ${hiddenCount} empty`}
        </button>
      {/if}
    </div>
  </div>

  {#if editing}
    {#key editing}
      <CellEditor {dbId} {row} prop={editing.prop} anchor={editing.el} onclose={() => (editing = null)} />
    {/key}
  {/if}
  {#if menuFor}
    {#key menuFor.prop.id}
      <PropertyMenu {dbId} prop={menuFor.prop} anchor={menuFor.el} onclose={() => (menuFor = null)} />
    {/key}
  {/if}
  {#if adding}
    <Popover anchor={adding} width={260} onclose={() => (adding = null)} label="Add a property">
      {#each groupedTypes as group (group.g)}
        <div class="pop-head">{group.g}</div>
        {#each group.items as t (t.type)}
          <button class="pop-item" onclick={() => add(t.type)}><Icon name={t.icon} size={15} /><span class="grow">{t.label}</span></button>
        {/each}
      {/each}
    </Popover>
  {/if}
{/if}

<style>
  .props {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 4px 0 20px;
    padding-bottom: 16px;
    box-shadow: inset 0 -1px 0 var(--separator);
    font-family: var(--font-ui);
  }
  .db-link {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    margin: 0 0 6px -6px;
    padding: 0 8px 0 6px;
    border-radius: var(--r-xs);
    font-size: var(--fs-footnote);
    font-weight: var(--fw-500);
    color: var(--text-3);
  }
  .db-link:hover {
    background: var(--fill);
    color: var(--text-2);
  }
  .prop {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-height: 34px;
  }
  .name {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 168px;
    height: 34px;
    margin-left: -6px;
    padding: 0 6px;
    border-radius: var(--r-xs);
    font-size: var(--fs-body-ui);
    color: var(--text-2);
    text-align: left;
  }
  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name :global(.icon) {
    flex: none;
    color: var(--text-3);
  }
  .name:hover {
    background: var(--fill);
  }
  .value {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    min-height: 34px;
    padding: 6px 8px;
    border-radius: var(--r-xs);
    font-size: var(--fs-body-ui);
  }
  .value.editable {
    cursor: pointer;
  }
  .value.editable:hover {
    background: var(--fill);
  }
  .placeholder {
    color: var(--text-4);
  }
  .foot {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    margin-left: -6px;
    padding: 0 8px;
    border-radius: var(--r-xs);
    font-size: var(--fs-ui);
    color: var(--text-3);
  }
  .add:hover {
    background: var(--fill);
    color: var(--text-2);
  }
</style>
