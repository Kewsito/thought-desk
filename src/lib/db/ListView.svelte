<script lang="ts">
  /** A list: one line per row, title on the left and properties on the right. */
  import { tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Value from './Value.svelte';
  import { databases } from '../databases.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import { Progressive, takeGrouped } from '../progressive.svelte';
  import type { Group } from './query';
  import type { DbRow, DbView, Property } from '../types';

  let { dbId, view, rows, groups }: { dbId: string; view: DbView; rows: DbRow[]; groups: Group[] | null } = $props();

  const c = $derived(view.config);
  const AUTO_SKIP = new Set(['title', 'created', 'edited', 'text', 'id']);
  const allProps = $derived(databases.props(dbId));
  const lazy = new Progressive(80, 150);
  const sections = $derived(
    groups
      ? takeGrouped(
          groups.filter((g) => g.rows.length || (!c.hideEmptyGroups && g.key !== '')),
          (g) => g.rows,
          lazy.limit,
        )
      : [{ group: null as Group | null, items: rows.slice(0, lazy.limit) }],
  );
  const total = $derived(groups ? groups.reduce((n, g) => n + g.rows.length, 0) : rows.length);
  let editing = $state<{ id: string; title: string } | null>(null);
  let input = $state<HTMLInputElement>();

  function shownFor(row: DbRow): Property[] {
    const filled = (p: Property) => {
      const v = databases.get(row, p);
      return !(v === null || v === '' || v === false || (Array.isArray(v) && !v.length));
    };
    if (c.shown) return allProps.filter((p) => c.shown!.includes(p.id) && p.type !== 'title' && (filled(p) || p.type === 'checkbox'));
    return allProps.filter((p) => !AUTO_SKIP.has(p.type) && filled(p)).slice(0, 4);
  }

  async function add(group?: Group | null) {
    const row = await databases.addRow(dbId, { view, group: group && c.group ? { prop: c.group, key: group.key } : undefined });
    if (!row) return;
    editing = { id: row.id, title: '' };
    await tick();
    input?.focus();
  }

  function commit() {
    if (!editing) return;
    if (editing.title.trim()) store.update(editing.id, { title: editing.title.trim() });
    editing = null;
  }

  function menu(e: MouseEvent, row: DbRow) {
    e.preventDefault();
    ui.openMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', icon: 'expand', action: () => store.open(row.id) },
        { label: 'Duplicate', icon: 'copy', action: () => void databases.duplicateRows([row.id]) },
        { separator: true },
        { label: 'Delete', icon: 'trash', danger: true, action: () => void databases.deleteRows([row.id]) },
      ],
    });
  }
</script>

<div class="list">
  {#each sections as s (s.group?.key ?? 'all')}
    {#if s.group}
      <div class="group">
        {#if s.group.color}<span class="pill" style:--pill={s.group.color}><span>{s.group.label}</span></span>{:else}<span class="g-label">{s.group.label}</span>{/if}
        <span class="count">{s.group.rows.length}</span>
      </div>
    {/if}
    {#each s.items as row (row.id)}
      {@const page = store.byId.get(row.id)}
      {#if editing?.id === row.id}
        <div class="line editing">
          <span class="lead">{#if page?.icon}{page.icon}{:else}<Icon name="page" size={15} />{/if}</span>
          <input
            bind:this={input}
            bind:value={editing.title}
            placeholder="Name it"
            onkeydown={(e) => (e.key === 'Enter' || e.key === 'Escape') && commit()}
            onblur={commit}
            aria-label="Title"
          />
        </div>
      {:else}
        <button class="line" onclick={() => store.open(row.id)} oncontextmenu={(e) => menu(e, row)}>
          <span class="lead">{#if page?.icon}{page.icon}{:else}<Icon name="page" size={15} />{/if}</span>
          <span class="title" class:untitled={!page?.title}>{page?.title || 'Untitled'}</span>
          <span class="allProps">
            {#each shownFor(row) as p (p.id)}<span class="prop" data-tip={p.name}><Value {dbId} {row} prop={p} compact /></span>{/each}
          </span>
        </button>
      {/if}
    {/each}
  {/each}
  {#if sections.reduce((n, s) => n + s.items.length, 0) < total}<div class="more" {@attach lazy.more}></div>{/if}
  <button class="line add" onclick={() => add()}><span class="lead"><Icon name="plus" size={15} /></span><span class="title">New</span></button>
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    margin-top: 10px;
    padding: 0 8px;
  }
  .g-label {
    font-size: var(--fs-ui);
    font-weight: var(--fw-600);
    color: var(--text-2);
  }
  .count {
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 38px;
    padding: 4px 8px;
    border-radius: var(--r-sm);
    text-align: left;
    box-shadow: inset 0 -1px 0 var(--separator);
    transition: background-color var(--dur-fast) var(--ease);
  }
  .line:hover {
    background: var(--fill);
  }
  .lead {
    flex: none;
    display: grid;
    place-items: center;
    width: 20px;
    color: var(--text-3);
    font-size: 15px;
  }
  .title {
    flex: 1;
    min-width: 0;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .untitled {
    color: var(--text-3);
  }
  .allProps {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 60%;
    overflow: hidden;
    font-size: var(--fs-ui);
    color: var(--text-2);
  }
  .prop {
    display: flex;
    min-width: 0;
    max-width: 200px;
  }
  .editing input {
    flex: 1;
    height: 26px;
    border: none;
    background: none;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    color: var(--text);
    outline: none;
  }
  .add {
    color: var(--text-3);
    box-shadow: none;
  }
  .add .title {
    font-weight: var(--fw-400);
    font-size: var(--fs-ui);
  }
  .add:hover {
    color: var(--text);
  }
  .more {
    height: 1px;
  }
</style>
